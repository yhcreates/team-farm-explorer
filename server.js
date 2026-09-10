/* ============================================================
   Team Farm Explorer — Multiplayer Server
   ------------------------------------------------------------
   Zero-dependency Node.js server (built-in `http`/`fs` modules
   only) holding one shared farm's state in memory (persisted to
   a local JSON file so multi-day crop growth survives restarts).

   GAME ECONOMY:
     - Sending a kudos awards the team ONE random seed. The
       "sentiment" picked (why you're recognizing someone) is
       fully decoupled from the seed reward.
     - Planting spends a seed of the chosen crop type.
     - Harvesting fills a shared Harvest Basket.
     - Animals are picky: each only accepts its own liked crop.
     - The Market: sell ANY harvested crop or animal product for
       coins — every crop has a purpose, including the ones no
       animal eats (sunflower, pumpkin, tomato).
     - Coins are spent on:
         - Decorations — coins ONLY, no other requirement.
         - Field Expansions — permanently unlock more of the
           farm's own contiguous farmland grid.
         - NEW: Buying more animals — chickens/cows/sheep can be
           purchased with coins (price rises with how many of
           that type the team already owns), spawned into a free
           pen tile automatically. More animals = more capacity
           to convert crops into sellable animal products.

   GROWTH TIMING: real calendar days (max ~7 for the slowest crop).
   Watering is an optional booster (up to 3x, 10% faster each).

   ANIMALS WANDER within their pen on an independent timer.

   FARMER PHOTOS: an optional uploaded photo (cropped/zoomed and
   compressed client-side to a data URL) renders enlarged on a
   farmer's face.

   MAP: one large contiguous farmland field (84 tiles: 48 open +
   36 behind two purchasable Field Expansion tiers), a picky-eater
   animal pen, and — new in this update — a direct path connector
   between the field and the pen (in addition to the original
   top-corridor route), so players don't have to loop all the way
   around. Verified for full BFS reachability before being wired
   into this server.
   ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

/* ============ Game constants ============ */
const ROWS = 14, COLS = 22;
const HAPPY_MAX = 5;
const MAX_WATER_BOOSTS = 3;
const REDUCTION_PER_WATER = 0.10;
const CROP_IDS = ['sunflower','carrot','strawberry','corn','pumpkin','tomato'];

const DAY_MS = 24 * 60 * 60 * 1000;
const CROP_GROWTH_MS = {
  carrot:     1.0 * DAY_MS,
  corn:       1.5 * DAY_MS,
  tomato:     2.0 * DAY_MS,
  sunflower:  3.0 * DAY_MS,
  strawberry: 4.5 * DAY_MS,
  pumpkin:    7.0 * DAY_MS
};

/* Every crop is sellable — including the ones no animal eats. */
const SELL_PRICES = {
  carrot: 4, corn: 5, tomato: 6, sunflower: 8, strawberry: 10, pumpkin: 14,
  egg: 8, milk: 12, wool: 16
};
const SELLABLE_IDS = Object.keys(SELL_PRICES);

/* ============ Animal types (for purchasing more of them) ============
   Each type has a base coin cost and an increment added per animal
   of that type the team already owns, so buying isn't infinitely
   cheap and the pen doesn't get spammed. */
const ANIMAL_TYPE_DEFS = {
  chicken: {emoji:'🐔', likes:'corn',       product:'egg',  baseCost:50,  costIncrement:25},
  cow:     {emoji:'🐄', likes:'carrot',     product:'milk', baseCost:100, costIncrement:50},
  sheep:   {emoji:'🐑', likes:'strawberry', product:'wool', baseCost:100, costIncrement:50}
};
const MAX_ANIMALS_TOTAL = 16; // generous cap so the pen never visually overflows

const ANIMALS_DEF = [
  {id:'chicken1', type:'chicken', r:5, c:18, likes:'corn',       product:'egg',  productName:'eggs'},
  {id:'chicken2', type:'chicken', r:5, c:20, likes:'corn',       product:'egg',  productName:'eggs'},
  {id:'cow',      type:'cow',     r:8, c:19, likes:'carrot',     product:'milk', productName:'milk'},
  {id:'sheep',    type:'sheep',   r:10,c:19, likes:'strawberry', product:'wool', productName:'wool'}
];
const PEN_BOUNDS = { rMin:4, rMax:11, cMin:18, cMax:20 };

const DEFAULT_SENTIMENTS = [
  {id:'sent_positivity',  emoji:'🌟', label:'Positivity'},
  {id:'sent_growth',      emoji:'🌱', label:'Growth Mindset'},
  {id:'sent_funjoy',      emoji:'🎉', label:'Fun & Joy'},
  {id:'sent_teamwork',    emoji:'🤝', label:'Teamwork'},
  {id:'sent_creativity',  emoji:'💡', label:'Creativity'},
  {id:'sent_greatwork',   emoji:'👏', label:'Great Work'},
  {id:'sent_aboveb',      emoji:'🙌', label:'Above & Beyond'},
  {id:'sent_reliability', emoji:'🎯', label:'Reliability'},
  {id:'sent_problemsolve',emoji:'🧠', label:'Problem Solving'},
  {id:'sent_support',     emoji:'❤️', label:'Support'}
];
const MAX_SENTIMENTS = 40;

/* Decorations cost ONLY coins — no separate "points" gate. */
const DECORATIONS_DEF = [
  {id:'flowerpatch', cost:15},
  {id:'rock',        cost:15},
  {id:'haybale',     cost:30},
  {id:'scarecrow',   cost:30},
  {id:'fountain',    cost:60},
  {id:'bench',       cost:60},
  {id:'lantern',     cost:120},
  {id:'tent',        cost:120},
  {id:'rainbow',     cost:250},
  {id:'statue',      cost:250}
];
function decorationDef(id){ return DECORATIONS_DEF.find(d=>d.id===id); }

/* Field Expansions: the farmland grid is ONE big contiguous block
   (84 tiles). 48 tiles are open from the start; the remaining 36
   are split into two purchasable tiers. Each zone also carries a
   single "centerTile" used by the client to draw ONE lock icon per
   zone instead of one per tile (much less visually crowded). */
function buildExpansionTiles(cMin, cMax){
  const tiles = [];
  for(let r=4; r<=9; r++) for(let c=cMin; c<=cMax; c++) tiles.push([r,c]);
  return tiles;
}
const EXPANSION_ZONES = [
  { id:'field_expansion_1', name:'Field Expansion I',  cost:200, tiles: buildExpansionTiles(10,12), centerTile:[6,11] },
  { id:'field_expansion_2', name:'Field Expansion II', cost:400, tiles: buildExpansionTiles(13,15), centerTile:[6,14] }
];
function expansionZoneAt(r,c){
  return EXPANSION_ZONES.find(z => z.tiles.some(([zr,zc])=>zr===r&&zc===c));
}

const OBSTACLE_TYPES = new Set(['tree','house','barn','fence','water']);
const MAX_PHOTO_DATA_URL_LENGTH = 120000;

/* ============ Map (verified for full reachability) ============
   Layout summary:
     - House top-left, Barn top-right (1 row tall by design, so the
       row below stays open as a corridor to the pen).
     - Kudos board + Market stall along the top path.
     - One big farmland field (rows4-9, cols2-15 = 84 tiles): open
       cols2-9 (48 tiles) + two locked expansion tiers cols10-12
       and cols13-15 (18 tiles each).
     - Animal pen (cols18-20, rows4-11 = 24 tiles), reachable via
       the original top-corridor entrance AND — new in this update
       — a direct path connector at row6 cutting straight through
       the shared fence line (col16/col17), so players don't have
       to loop all the way around.
     - Small pond bottom-left for visual flavor.
   ============================================================ */
function buildGrid(){
  const g = [];
  for(let r=0;r<ROWS;r++) g.push(new Array(COLS).fill('grass'));
  for(let r=0;r<ROWS;r++){ g[r][0]='tree'; g[r][COLS-1]='tree'; }
  for(let c=0;c<COLS;c++){ g[0][c]='tree'; g[ROWS-1][c]='tree'; }
  // house
  for(let r=1;r<=2;r++) for(let c=1;c<=3;c++) g[r][c]='house';
  // barn (1 row tall by design — keeps row2 open as a walking corridor)
  for(let c=17;c<=19;c++) g[1][c]='barn';
  // top path connecting house -> kudos -> market -> barn corridor
  for(let c=4;c<=9;c++) g[1][c]='path';
  g[1][10]='kudos';
  g[1][11]='path';
  g[1][12]='market';
  for(let c=13;c<=16;c++) g[1][c]='path';
  // field fence ring (cols1-16)
  for(let c=1;c<=16;c++){ g[3][c]='fence'; g[10][c]='fence'; }
  for(let r=3;r<=10;r++){ g[r][1]='fence'; g[r][16]='fence'; }
  // field interior farmland (rows4-9, cols2-15) -- 84 tiles total
  for(let r=4;r<=9;r++) for(let c=2;c<=15;c++) g[r][c]='farmland';
  // fence gaps (entrances)
  g[3][4]='path'; g[10][8]='path';
  // pen fence ring (cols17-20); top fence only spans 17-19, leaving
  // col20 open at row3 as an entrance corridor from the top
  for(let c=17;c<=19;c++) g[3][c]='fence';
  for(let c=17;c<=20;c++) g[12][c]='fence';
  for(let r=3;r<=12;r++) g[r][17]='fence';
  g[3][20]='path';
  // interior pen rows4-11, cols18-20 -- 24 tiles
  for(let r=4;r<=11;r++) for(let c=18;c<=20;c++) g[r][c]='pen';
  // NEW: direct path connector between farmland and the pen — a
  // 1-tile gap straight through both fences at row6, so there's a
  // second, much shorter route besides looping via the top corridor.
  g[6][16]='path'; g[6][17]='path';
  // pond
  g[11][2]='water'; g[11][3]='water'; g[12][2]='water'; g[12][3]='water';
  return g;
}
const GRID = buildGrid();
function tileAt(r,c){ return GRID[r] && GRID[r][c]; }

function isFarmlandTile(r,c){
  if(tileAt(r,c) !== 'farmland') return false;
  const zone = expansionZoneAt(r,c);
  if(!zone) return true;
  return !!state.unlockedExpansions[zone.id];
}

const SPAWN_SPOTS = [[1,4],[1,5],[1,6],[1,7],[1,8]];

/* ============ Shared in-memory state ============ */
function emptySeedBank(){
  const bank = {};
  CROP_IDS.forEach(id=> bank[id]=0);
  return bank;
}
function defaultState(){
  return {
    teamName:'',
    farmers:[],
    crops:{},
    animals: ANIMALS_DEF.map(a=>({...a, happiness:0, nextMoveAt: Date.now()+randomWanderDelay()})),
    seeds: emptySeedBank(),
    inventory:{carrot:0,corn:0,strawberry:0,pumpkin:0,tomato:0,sunflower:0, egg:0, milk:0, wool:0},
    coins: 0,
    unlockedExpansions: {},
    sentiments: DEFAULT_SENTIMENTS.map(s=>({...s})),
    kudosLog:[],
    stats:{givers:{}, contributors:{}, caretakers:{}, sellers:{}},
    totalHarvests:0,
    totalProducts:0,
    totalKudos:0,
    totalCoinsEarned:0,
    decorations:{},
    version:0
  };
}

/* ============ Persistence ============ */
const STATE_FILE = path.join(__dirname, 'farm-state.json');
function loadStateFromDisk(){
  try{
    if(fs.existsSync(STATE_FILE)){
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const loaded = JSON.parse(raw);
      const merged = Object.assign(defaultState(), loaded);
      merged.animals = merged.animals.map(a=> ({ nextMoveAt: Date.now()+randomWanderDelay(), ...a }));
      if(!merged.unlockedExpansions) merged.unlockedExpansions = {};
      if(!merged.stats.sellers) merged.stats.sellers = {};
      if(typeof merged.coins !== 'number') merged.coins = 0;
      return merged;
    }
  }catch(e){
    console.error('Failed to load persisted state, starting fresh:', e.message);
  }
  return defaultState();
}
let state = loadStateFromDisk();
let saveScheduled = false;
function saveStateToDisk(){
  saveScheduled = false;
  try{ fs.writeFileSync(STATE_FILE, JSON.stringify(state)); }
  catch(e){ console.error('Failed to persist state to disk:', e.message); }
}
function scheduleSave(){
  if(saveScheduled) return;
  saveScheduled = true;
  setTimeout(saveStateToDisk, 250);
}
function bump(){ state.version++; scheduleSave(); }

const MAX_KUDOS_LOG = 300;

/* ============ Helpers ============ */
function uid(){ return 'f' + Math.random().toString(36).slice(2,10); }
function cellKey(r,c){ return r+','+c; }
function getOrCreateCell(r,c){
  const key = cellKey(r,c);
  let cell = state.crops[key];
  if(!cell){ cell = {stage:0, type:null, plantedAt:null, waterCount:0, plantedBy:null}; state.crops[key]=cell; }
  return cell;
}
function findFarmer(id){ return state.farmers.find(f=>f.id===id); }
function animalById(id){ return state.animals.find(a=>a.id===id); }
function isValidCoord(r,c){ return Number.isInteger(r) && Number.isInteger(c) && r>=0 && r<ROWS && c>=0 && c<COLS; }
function randomCropId(){ return CROP_IDS[Math.floor(Math.random()*CROP_IDS.length)]; }
function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

function effectiveDurationMs(cell){
  const base = CROP_GROWTH_MS[cell.type] || 0;
  const boosts = Math.min(cell.waterCount||0, MAX_WATER_BOOSTS);
  return base * (1 - REDUCTION_PER_WATER*boosts);
}
function readyAtMs(cell){ return (cell.plantedAt||0) + effectiveDurationMs(cell); }
function isReady(cell){ return !!cell.type && Date.now() >= readyAtMs(cell); }
function remainingMs(cell){ return Math.max(0, readyAtMs(cell) - Date.now()); }
function formatRemaining(ms){
  const totalSecs = Math.max(0, Math.ceil(ms/1000));
  const days = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if(days > 0) return `${days}d ${hours}h`;
  if(hours > 0) return `${hours}h ${mins}m`;
  if(mins > 0) return `${mins}m`;
  return `${secs}s`;
}

/* ============ Animal wandering AI ============ */
function randomWanderDelay(){ return 4000 + Math.random()*8000; }
function isTileFreeForAnimal(r,c,excludeAnimalId){
  if(r < PEN_BOUNDS.rMin || r > PEN_BOUNDS.rMax || c < PEN_BOUNDS.cMin || c > PEN_BOUNDS.cMax) return false;
  if(tileAt(r,c) !== 'pen') return false;
  if(state.animals.some(a=> a.id!==excludeAnimalId && a.r===r && a.c===c)) return false;
  if(state.farmers.some(f=> f.r===r && f.c===c)) return false;
  return true;
}
function tickAnimalWander(){
  const now = Date.now();
  let moved = false;
  state.animals.forEach(a=>{
    if(now < (a.nextMoveAt||0)) return;
    a.nextMoveAt = now + randomWanderDelay();
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    for(let i=dirs.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [dirs[i],dirs[j]]=[dirs[j],dirs[i]]; }
    for(const [dr,dc] of dirs){
      const nr=a.r+dr, nc=a.c+dc;
      if(isTileFreeForAnimal(nr,nc,a.id)){ a.r=nr; a.c=nc; moved=true; break; }
      if(Math.random() < 0.3) break;
    }
  });
  if(moved) bump();
}
setInterval(tickAnimalWander, 1000);

/* Finds any free pen tile (not occupied by another animal or a
   farmer) for a newly-purchased animal to spawn into. Returns null
   if the pen is completely full. */
function findFreePenTile(){
  for(let r=PEN_BOUNDS.rMin;r<=PEN_BOUNDS.rMax;r++){
    for(let c=PEN_BOUNDS.cMin;c<=PEN_BOUNDS.cMax;c++){
      if(isTileFreeForAnimal(r,c,null)) return [r,c];
    }
  }
  return null;
}
function countAnimalsOfType(type){ return state.animals.filter(a=>a.type===type).length; }
function costForNextAnimal(type){
  const def = ANIMAL_TYPE_DEFS[type];
  if(!def) return null;
  const owned = countAnimalsOfType(type);
  return def.baseCost + owned * def.costIncrement;
}

/* ============ API handlers ============ */
function validatePhoto(photo){
  if(!photo) return null;
  const str = photo.toString();
  if(!str.startsWith('data:image/')) return null;
  if(str.length > MAX_PHOTO_DATA_URL_LENGTH) return null;
  return str;
}

function apiJoin(body){
  const name = (body.name || '').toString().trim().slice(0,40);
  if(!name) return {ok:false, error:'Name is required.'};
  const spawn = SPAWN_SPOTS[state.farmers.length % SPAWN_SPOTS.length];
  const photo = validatePhoto(body.photo);
  const farmer = {
    id: uid(), name,
    skin: (body.skin||'#ffdbac').toString().slice(0,20),
    hair: (body.hair||'#2d2d2d').toString().slice(0,20),
    shirt: (body.shirt||'#54a0ff').toString().slice(0,20),
    pants: (body.pants||'#3b3b58').toString().slice(0,20),
    hat: (body.hat||'none').toString().slice(0,20),
    photo: photo,
    r: spawn[0], c: spawn[1]
  };
  if(body.teamName && !state.teamName) state.teamName = body.teamName.toString().slice(0,60);
  state.farmers.push(farmer);
  bump();
  return {ok:true, playerId:farmer.id};
}

function apiUpdateAppearance(body){
  const f = findFarmer(body.playerId);
  if(!f) return {ok:false, error:'Unknown player.'};
  if(body.name) f.name = body.name.toString().trim().slice(0,40) || f.name;
  if(body.skin) f.skin = body.skin.toString().slice(0,20);
  if(body.hair) f.hair = body.hair.toString().slice(0,20);
  if(body.shirt) f.shirt = body.shirt.toString().slice(0,20);
  if(body.pants) f.pants = body.pants.toString().slice(0,20);
  if(body.hat) f.hat = body.hat.toString().slice(0,20);
  if(body.hasOwnProperty('photo')){
    if(body.photo === null || body.photo === ''){
      f.photo = null;
    } else {
      const validated = validatePhoto(body.photo);
      if(body.photo && !validated) return {ok:false, error:'Photo is too large or invalid — please try a smaller image.'};
      f.photo = validated;
    }
  }
  bump();
  return {ok:true};
}

function apiLeave(body){
  const idx = state.farmers.findIndex(f=>f.id===body.playerId);
  if(idx===-1) return {ok:false, error:'Unknown player.'};
  state.farmers.splice(idx,1);
  bump();
  return {ok:true};
}

function apiMove(body){
  const f = findFarmer(body.playerId);
  if(!f) return {ok:false, error:'Unknown player.'};
  const {r,c} = body;
  if(!isValidCoord(r,c)) return {ok:false, error:'Bad coordinates.'};
  const t = tileAt(r,c);
  if(!t || OBSTACLE_TYPES.has(t)) return {ok:false, error:'Tile blocked.'};
  if(state.animals.some(a=>a.r===r && a.c===c)) return {ok:false, error:'Animal in the way.'};
  f.r = r; f.c = c;
  bump();
  return {ok:true};
}

function apiTill(body){
  const f = findFarmer(body.playerId);
  if(!f) return {ok:false, error:'Unknown player.'};
  const {r,c} = body;
  if(!isValidCoord(r,c) || !isFarmlandTile(r,c)) return {ok:false, error:'Not farmland (or still locked).'};
  const cell = getOrCreateCell(r,c);
  if(cell.stage!==0) return {ok:false, error:'Already tilled.'};
  cell.stage = 1;
  bump();
  return {ok:true};
}

function apiPlant(body){
  const f = findFarmer(body.playerId);
  if(!f) return {ok:false, error:'Unknown player.'};
  const {r,c,cropId} = body;
  if(!isValidCoord(r,c) || !isFarmlandTile(r,c)) return {ok:false, error:'Not farmland (or still locked).'};
  if(!CROP_IDS.includes(cropId)) return {ok:false, error:'Bad crop.'};
  const cell = getOrCreateCell(r,c);
  if(cell.stage!==1) return {ok:false, error:'Not ready to plant.'};
  if((state.seeds[cropId]||0) <= 0) return {ok:false, error:"No seeds of that type in the team's seed bank — send a kudos to earn one!"};
  state.seeds[cropId]--;
  cell.type = cropId; cell.stage = 2; cell.waterCount = 0; cell.plantedAt = Date.now(); cell.plantedBy = f.name;
  bump();
  return {ok:true};
}

function apiWater(body){
  const f = findFarmer(body.playerId);
  if(!f) return {ok:false, error:'Unknown player.'};
  const {r,c} = body;
  if(!isValidCoord(r,c)) return {ok:false, error:'Bad coordinates.'};
  const cell = getOrCreateCell(r,c);
  if(cell.stage!==2) return {ok:false, error:'Nothing to water.'};
  if(isReady(cell)) return {ok:false, error:'Already ready to harvest!'};
  if((cell.waterCount||0) >= MAX_WATER_BOOSTS) return {ok:false, error:'Already fully boosted — it just needs time now!'};
  cell.waterCount = (cell.waterCount||0) + 1;
  bump();
  return {ok:true, remainingMs: remainingMs(cell)};
}

function apiHarvest(body){
  const f = findFarmer(body.playerId);
  if(!f) return {ok:false, error:'Unknown player.'};
  const {r,c} = body;
  if(!isValidCoord(r,c)) return {ok:false, error:'Bad coordinates.'};
  const cell = getOrCreateCell(r,c);
  if(cell.stage!==2 || !cell.type) return {ok:false, error:'Nothing to harvest.'};
  if(!isReady(cell)) return {ok:false, error:`Still growing — ${formatRemaining(remainingMs(cell))} left!`};
  state.inventory[cell.type] = (state.inventory[cell.type]||0) + 1;
  state.totalHarvests++;
  state.stats.contributors[f.name] = (state.stats.contributors[f.name]||0) + 1;
  cell.stage = 1; cell.type = null; cell.plantedAt = null; cell.waterCount = 0;
  bump();
  return {ok:true};
}

function apiFeed(body){
  const f = findFarmer(body.playerId);
  if(!f) return {ok:false, error:'Unknown player.'};
  const animal = animalById(body.animalId);
  if(!animal) return {ok:false, error:'Unknown animal.'};
  const likedCrop = animal.likes;
  if((state.inventory[likedCrop]||0) <= 0){
    return {ok:false, error:`${capitalize(animal.type)}s only eat ${capitalize(likedCrop)}! Grow and harvest some first.`};
  }
  state.inventory[likedCrop]--;
  const FEED_GAIN = 2;
  animal.happiness = Math.min(HAPPY_MAX, animal.happiness + FEED_GAIN);
  state.stats.caretakers[f.name] = (state.stats.caretakers[f.name]||0) + 1;
  let produced = null;
  if(animal.happiness >= HAPPY_MAX){
    state.inventory[animal.product] = (state.inventory[animal.product]||0) + 1;
    animal.happiness = 0;
    state.totalProducts++;
    produced = animal.product;
  }
  bump();
  return {ok:true, fed:likedCrop, gain:FEED_GAIN, produced};
}

function apiSell(body){
  const f = findFarmer(body.playerId);
  if(!f) return {ok:false, error:'Unknown player.'};
  const itemId = (body.itemId||'').toString();
  const quantity = Math.floor(Number(body.quantity));
  if(!SELLABLE_IDS.includes(itemId)) return {ok:false, error:'That item cannot be sold.'};
  if(!Number.isInteger(quantity) || quantity <= 0) return {ok:false, error:'Bad quantity.'};
  const have = state.inventory[itemId] || 0;
  if(have < quantity) return {ok:false, error:`You only have ${have} of that to sell.`};
  const earned = SELL_PRICES[itemId] * quantity;
  state.inventory[itemId] = have - quantity;
  state.coins += earned;
  state.totalCoinsEarned += earned;
  state.stats.sellers[f.name] = (state.stats.sellers[f.name]||0) + earned;
  bump();
  return {ok:true, earned, newCoins: state.coins};
}

function apiAddSentiment(body){
  const label = (body.label||'').toString().trim().slice(0,40);
  if(!label) return {ok:false, error:'Sentiment name is required.'};
  const emoji = (body.emoji||'').toString().trim().slice(0,8) || '🏷️';
  const existing = state.sentiments.find(s=> s.label.toLowerCase() === label.toLowerCase());
  if(existing) return {ok:true, sentimentId:existing.id, reused:true};
  if(state.sentiments.length >= MAX_SENTIMENTS) return {ok:false, error:'The sentiment list is full — try reusing an existing one!'};
  const id = 'sent_' + uid();
  state.sentiments.push({id, emoji, label});
  bump();
  return {ok:true, sentimentId:id, reused:false};
}

function apiKudos(body){
  const fromName = (body.fromName||'').toString().trim().slice(0,40);
  const toName = (body.toName||'').toString().trim().slice(0,40);
  const message = (body.message||'').toString().trim().slice(0,500);
  if(!fromName || !toName) return {ok:false, error:'From/To required.'};
  if(fromName.toLowerCase() === toName.toLowerCase()) return {ok:false, error:"You can't send yourself a kudos — recognize a teammate instead!"};
  const sentiment = state.sentiments.find(s=> s.id === body.sentimentId);
  if(!sentiment) return {ok:false, error:'Please choose a sentiment for this kudos.'};
  state.kudosLog.push({
    fromName, toName, message,
    sentimentId: sentiment.id, sentimentEmoji: sentiment.emoji, sentimentLabel: sentiment.label,
    when:new Date().toLocaleString(), whenTs: Date.now()
  });
  if(state.kudosLog.length > MAX_KUDOS_LOG) state.kudosLog.shift();
  state.stats.givers[fromName] = (state.stats.givers[fromName]||0) + 1;
  state.totalKudos++;
  const seedAwarded = randomCropId();
  state.seeds[seedAwarded] = (state.seeds[seedAwarded]||0) + 1;
  bump();
  return {ok:true, seedAwarded};
}

function apiDecorate(body){
  const f = findFarmer(body.playerId);
  if(!f) return {ok:false, error:'Unknown player.'};
  const {r,c,decorId} = body;
  if(!isValidCoord(r,c) || tileAt(r,c)!=='grass') return {ok:false, error:'Decorations must go on open grass.'};
  const def = decorationDef(decorId);
  if(!def) return {ok:false, error:'Unknown decoration.'};
  if(state.coins < def.cost) return {ok:false, error:`Not enough coins — need ${def.cost}, have ${state.coins}. Sell some crops at the Market!`};
  const key = cellKey(r,c);
  if(state.decorations[key]) return {ok:false, error:'Tile already decorated.'};
  state.coins -= def.cost;
  state.decorations[key] = decorId;
  bump();
  return {ok:true};
}

function apiRemoveDecor(body){
  const {r,c} = body;
  if(!isValidCoord(r,c)) return {ok:false, error:'Bad coordinates.'};
  const key = cellKey(r,c);
  if(!state.decorations[key]) return {ok:false, error:'Nothing there.'};
  delete state.decorations[key];
  bump();
  return {ok:true};
}

function apiExpand(body){
  const f = findFarmer(body.playerId);
  if(!f) return {ok:false, error:'Unknown player.'};
  const zone = EXPANSION_ZONES.find(z=>z.id===body.expansionId);
  if(!zone) return {ok:false, error:'Unknown expansion.'};
  if(state.unlockedExpansions[zone.id]) return {ok:true, alreadyUnlocked:true};
  if(state.coins < zone.cost) return {ok:false, error:`Not enough coins — need ${zone.cost}, have ${state.coins}. Sell some crops at the Market!`};
  state.coins -= zone.cost;
  state.unlockedExpansions[zone.id] = true;
  bump();
  return {ok:true};
}

/* Buys ONE additional animal of the given type. Cost rises with how
   many of that type the team already owns (baseCost + owned *
   increment). The new animal spawns into any free pen tile; if the
   pen is completely full (or the overall animal cap is hit), the
   purchase is rejected WITHOUT charging coins. */
function apiBuyAnimal(body){
  const f = findFarmer(body.playerId);
  if(!f) return {ok:false, error:'Unknown player.'};
  const type = (body.animalType||'').toString();
  const def = ANIMAL_TYPE_DEFS[type];
  if(!def) return {ok:false, error:'Unknown animal type.'};
  if(state.animals.length >= MAX_ANIMALS_TOTAL) return {ok:false, error:`The pen is at its maximum of ${MAX_ANIMALS_TOTAL} animals!`};
  const cost = costForNextAnimal(type);
  if(state.coins < cost) return {ok:false, error:`Not enough coins — need ${cost}, have ${state.coins}. Sell some crops at the Market!`};
  const spot = findFreePenTile();
  if(!spot) return {ok:false, error:'No free space left in the pen right now — try again once an animal wanders elsewhere!'};
  state.coins -= cost;
  const newId = type + '_' + uid();
  state.animals.push({
    id:newId, type, r:spot[0], c:spot[1],
    likes:def.likes, product:def.product,
    happiness:0, nextMoveAt: Date.now()+randomWanderDelay()
  });
  bump();
  return {ok:true, animalId:newId, spent:cost, nextCost: costForNextAnimal(type)};
}

function apiResetSeason(){
  const keepFarmers = state.farmers;
  const keepTeamName = state.teamName;
  const keepSentiments = state.sentiments;
  state = defaultState();
  state.farmers = keepFarmers;
  state.teamName = keepTeamName;
  state.sentiments = keepSentiments;
  bump();
  return {ok:true};
}

const ROUTES = {
  '/api/join': apiJoin,
  '/api/appearance': apiUpdateAppearance,
  '/api/leave': apiLeave,
  '/api/move': apiMove,
  '/api/till': apiTill,
  '/api/plant': apiPlant,
  '/api/water': apiWater,
  '/api/harvest': apiHarvest,
  '/api/feed': apiFeed,
  '/api/sell': apiSell,
  '/api/kudos': apiKudos,
  '/api/sentiments': apiAddSentiment,
  '/api/decorate': apiDecorate,
  '/api/remove-decor': apiRemoveDecor,
  '/api/expand': apiExpand,
  '/api/buy-animal': apiBuyAnimal,
  '/api/reset-season': apiResetSeason
};

/* ============ HTTP plumbing ============ */
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = { '.html':'text/html; charset=utf-8', '.js':'application/javascript', '.css':'text/css' };

function sendJSON(res, statusCode, obj){
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    'Content-Type':'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control':'no-store'
  });
  res.end(body);
}
function readBody(req, cb){
  let data = '';
  req.on('data', chunk=>{ data += chunk; if(data.length > 3e6) req.destroy(); });
  req.on('end', ()=>{
    if(!data){ cb({}); return; }
    try{ cb(JSON.parse(data)); } catch(e){ cb({}); }
  });
}

const server = http.createServer((req,res)=>{
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if(req.method==='GET' && pathname==='/api/state'){
    sendJSON(res, 200, {ok:true, state});
    return;
  }
  if(req.method==='POST' && ROUTES[pathname]){
    readBody(req, body=>{
      const result = ROUTES[pathname](body);
      sendJSON(res, result.ok ? 200 : 400, {...result, state});
    });
    return;
  }
  if(req.method==='GET'){
    let filePath = pathname==='/' ? '/index.html' : pathname;
    filePath = path.join(PUBLIC_DIR, filePath);
    if(!filePath.startsWith(PUBLIC_DIR)){ res.writeHead(403); res.end('Forbidden'); return; }
    fs.readFile(filePath, (err,data)=>{
      if(err){ res.writeHead(404); res.end('Not found'); return; }
      const ext = path.extname(filePath);
      res.writeHead(200, {'Content-Type': MIME[ext] || 'application/octet-stream'});
      res.end(data);
    });
    return;
  }
  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, ()=>{
  console.log(`Team Farm Explorer multiplayer server running on port ${PORT}`);
  console.log(`Persisting state to: ${STATE_FILE}`);
});

function flushAndExit(){
  if(saveScheduled) saveStateToDisk();
  process.exit(0);
}
process.on('SIGINT', flushAndExit);
process.on('SIGTERM', flushAndExit);

module.exports = {
  server, CROP_GROWTH_MS, MAX_WATER_BOOSTS, REDUCTION_PER_WATER, CROP_IDS,
  STATE_FILE, saveStateToDisk, PEN_BOUNDS, tickAnimalWander,
  MAX_PHOTO_DATA_URL_LENGTH, SELL_PRICES, EXPANSION_ZONES, DECORATIONS_DEF,
  ANIMAL_TYPE_DEFS, MAX_ANIMALS_TOTAL, costForNextAnimal, countAnimalsOfType,
  ROWS, COLS, buildGrid
};
