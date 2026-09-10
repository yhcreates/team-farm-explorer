/* ============================================================
   Team Farm Explorer — Multiplayer Server
   ------------------------------------------------------------
   Zero-dependency Node.js server (built-in `http` module only)
   that holds one shared farm's state in memory and exposes a
   small REST API. Clients poll GET /api/state every ~900ms and
   call POST /api/* endpoints to act (move, till, plant, water,
   harvest, feed, kudos, decorate, join).

   ------------------------------------------------------------
   GAME ECONOMY (kudos-driven):
     1. Sending a Kudos to a teammate awards the TEAM a random
        seed (one of 6 crop types) into a shared Seed Bank.
     2. Planting a tilled plot SPENDS one seed of the chosen
        type from the shared Seed Bank.
     3. Harvested crops go into a shared Harvest Basket.
     4. Animals are picky: each only accepts its OWN liked crop.
     5. Leaderboards keep the team accountable for kudos.

   ------------------------------------------------------------
   GROWTH TIMING (real calendar time, multi-day, max ~1 week):
     Each crop takes real DAYS to grow — this is a persistent
     "check in over the week" farm, not a single-sitting game.
     Durations preserve the same relative order as real-world
     "days to maturity" horticultural data (fast root veggies
     quicker, large vine fruit slower), compressed so the
     slowest crop (pumpkin) tops out at 7 days:
       Carrot      1.0 day
       Corn        1.5 days
       Tomato      2.0 days
       Sunflower   3.0 days
       Strawberry  4.5 days
       Pumpkin     7.0 days
     Watering is an OPTIONAL booster (not a hard requirement):
     each watering (up to 3 times) shaves 10% off the remaining
     grow time (30% max), rewarding attentiveness, but real time
     always has to pass — nobody can rush a crop to ripeness by
     clicking.

   ------------------------------------------------------------
   PERSISTENCE (required for multi-day growth to survive restarts):
     Since crops can now take up to a week, the server persists
     its full state to a local JSON file after every change, and
     reloads it on startup. This is ESSENTIAL wherever this is
     hosted: a free-tier host that spins down after 15 minutes of
     inactivity (and has no persistent disk) will otherwise lose
     all in-progress crops the first time nobody visits for 15
     minutes. See README.md for hosting guidance that keeps this
     data alive for the full week.
   ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

/* ============ Game constants (mirrors client) ============ */
const ROWS = 12, COLS = 18;
const HAPPY_MAX = 5;

const CROP_IDS = ['sunflower','carrot','strawberry','corn','pumpkin','tomato'];

/* ============ Kudos Sentiments ============
   Sentiments (why you're recognizing someone) are now fully
   DECOUPLED from crops/seeds. Sending a kudos always awards a
   uniformly random seed regardless of which sentiment was picked
   — the sentiment is purely about WHY you're giving recognition,
   the seed is a random surprise reward for doing so. Teams can
   also add their own custom sentiment tags (e.g. to match company
   values), which persist for everyone to reuse afterward. */
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
const MAX_SENTIMENTS = 40; // generous cap so custom tags can't grow unbounded

/* Grow durations in milliseconds, scaled to real DAYS (max ~1 week
   for the slowest crop). This object is intentionally mutable —
   never mutated in production, but a local test harness can shrink
   these values (preserving ratios) to verify time-gating logic
   without waiting real days — see the exports at the bottom of
   this file. */
const DAY_MS = 24 * 60 * 60 * 1000;
const CROP_GROWTH_MS = {
  carrot:     1.0 * DAY_MS,
  corn:       1.5 * DAY_MS,
  tomato:     2.0 * DAY_MS,
  sunflower:  3.0 * DAY_MS,
  strawberry: 4.5 * DAY_MS,
  pumpkin:    7.0 * DAY_MS
};

const REDUCTION_PER_WATER = 0.10; // each watering shaves 10% off the base duration
const MAX_WATER_BOOSTS = 3;       // capped at 3 waterings (max 30% faster)

const ANIMALS_DEF = [
  {id:'chicken1', type:'chicken', r:5, c:11, likes:'corn',       product:'egg',  productName:'eggs'},
  {id:'chicken2', type:'chicken', r:5, c:14, likes:'corn',       product:'egg',  productName:'eggs'},
  {id:'cow',      type:'cow',     r:7, c:12, likes:'carrot',     product:'milk', productName:'milk'},
  {id:'sheep',    type:'sheep',   r:7, c:14, likes:'strawberry', product:'wool', productName:'wool'}
];

const DECORATION_IDS = {
  flowerpatch:0, rock:0, haybale:8, scarecrow:8,
  fountain:20, bench:20, lantern:40, tent:40,
  rainbow:70, statue:70
};

const OBSTACLE_TYPES = new Set(['tree','house','barn','fence','water']);

/* Rebuild the same tile grid used by the client, so the server can
   validate that a tile is really farmland/grass/kudos before acting. */
function buildGrid(){
  const g = [];
  for(let r=0;r<ROWS;r++) g.push(new Array(COLS).fill('grass'));
  for(let r=0;r<ROWS;r++){ g[r][0]='tree'; g[r][COLS-1]='tree'; }
  for(let c=0;c<COLS;c++){ g[0][c]='tree'; g[ROWS-1][c]='tree'; }
  for(let r=1;r<=2;r++) for(let c=1;c<=3;c++) g[r][c]='house';
  for(let r=1;r<=2;r++) for(let c=13;c<=15;c++) g[r][c]='barn';
  g[1][8]='kudos';
  for(let c=4;c<=7;c++) g[1][c]='path';
  g[1][12]='path'; g[2][12]='path';
  for(let c=1;c<=8;c++){ g[3][c]='fence'; g[8][c]='fence'; }
  for(let r=3;r<=8;r++){ g[r][1]='fence'; g[r][8]='fence'; }
  for(let r=4;r<=7;r++) for(let c=2;c<=7;c++) g[r][c]='farmland';
  g[3][2]='path'; g[8][4]='path';
  for(let c=9;c<=16;c++){ g[3][c]='fence'; g[9][c]='fence'; }
  for(let r=3;r<=9;r++){ g[r][9]='fence'; g[r][16]='fence'; }
  for(let r=4;r<=8;r++) for(let c=10;c<=15;c++) g[r][c]='pen';
  g[3][12]='path'; g[9][12]='path';
  g[9][2]='water'; g[9][3]='water'; g[10][2]='water'; g[10][3]='water';
  return g;
}
const GRID = buildGrid();
function tileAt(r,c){ return GRID[r] && GRID[r][c]; }

const SPAWN_SPOTS = [[1,5],[1,4],[1,6],[1,7],[2,6]];

/* ============ Shared in-memory state ============ */
function emptySeedBank(){
  const bank = {};
  CROP_IDS.forEach(id=> bank[id]=0);
  return bank;
}
function defaultState(){
  return {
    teamName:'',
    farmers:[],               // {id,name,skin,hair,shirt,pants,hat,r,c}
    crops:{},                 // "r,c" -> {stage,type,plantedAt,waterCount,plantedBy}
    animals: ANIMALS_DEF.map(a=>({...a, happiness:0})),
    seeds: emptySeedBank(),
    inventory:{carrot:0,corn:0,strawberry:0,pumpkin:0,tomato:0,sunflower:0, egg:0, milk:0, wool:0},
    sentiments: DEFAULT_SENTIMENTS.map(s=>({...s})), // team's kudos sentiment tags — default set + any custom ones added later
    kudosLog:[],
    stats:{givers:{}, contributors:{}, caretakers:{}},
    totalHarvests:0,
    totalProducts:0,
    totalKudos:0,
    decorations:{},
    version:0
  };
}
/* ============ Persistence ============
   Since crops now take real days to grow, the server's in-memory
   state MUST survive process restarts, or a host that spins the
   server down after a period of inactivity (common on free tiers)
   would silently wipe out days of progress. We persist the full
   state to a local JSON file after every mutation, and reload it
   on startup. This only actually protects the data if the
   underlying filesystem itself persists across restarts/redeploys
   — see README.md for hosting guidance (this generally requires a
   paid host with a persistent disk, or a self-hosted always-on
   machine; most free tiers wipe local files on every restart). */
const STATE_FILE = path.join(__dirname, 'farm-state.json');

function loadStateFromDisk(){
  try{
    if(fs.existsSync(STATE_FILE)){
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const loaded = JSON.parse(raw);
      // Merge onto a fresh defaultState() so any new fields added in
      // future versions still get sensible defaults instead of undefined.
      return Object.assign(defaultState(), loaded);
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
  try{
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  }catch(e){
    console.error('Failed to persist state to disk:', e.message);
  }
}
/* Debounced so a rapid burst of actions (several players acting in
   the same second) collapses into a single disk write shortly after,
   rather than writing synchronously on every single request. */
function scheduleSave(){
  if(saveScheduled) return;
  saveScheduled = true;
  setTimeout(saveStateToDisk, 250);
}

function bump(){ state.version++; scheduleSave(); }
function points(){ return state.totalHarvests + state.totalProducts; }

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

/* Growth-timing helpers. Effective duration shrinks by
   REDUCTION_PER_WATER for each watering, capped at MAX_WATER_BOOSTS. */
function effectiveDurationMs(cell){
  const base = CROP_GROWTH_MS[cell.type] || 0;
  const boosts = Math.min(cell.waterCount||0, MAX_WATER_BOOSTS);
  return base * (1 - REDUCTION_PER_WATER*boosts);
}
function readyAtMs(cell){ return (cell.plantedAt||0) + effectiveDurationMs(cell); }
function isReady(cell){ return !!cell.type && Date.now() >= readyAtMs(cell); }
function remainingMs(cell){ return Math.max(0, readyAtMs(cell) - Date.now()); }
/* Human-readable remaining-time label for error messages, e.g.
   "2d 5h", "3h 20m", "12m" — mirrors the client's formatDuration(). */
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

/* ============ API handlers ============ */
function apiJoin(body){
  const name = (body.name || '').toString().trim().slice(0,40);
  if(!name) return {ok:false, error:'Name is required.'};
  const spawn = SPAWN_SPOTS[state.farmers.length % SPAWN_SPOTS.length];
  const farmer = {
    id: uid(),
    name,
    skin: (body.skin||'#ffdbac').toString().slice(0,20),
    hair: (body.hair||'#2d2d2d').toString().slice(0,20),
    shirt: (body.shirt||'#54a0ff').toString().slice(0,20),
    pants: (body.pants||'#3b3b58').toString().slice(0,20),
    hat: (body.hat||'none').toString().slice(0,20),
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
  if(!isValidCoord(r,c) || tileAt(r,c)!=='farmland') return {ok:false, error:'Not farmland.'};
  const cell = getOrCreateCell(r,c);
  if(cell.stage!==0) return {ok:false, error:'Already tilled.'};
  cell.stage = 1;
  bump();
  return {ok:true};
}

/* Planting SPENDS a seed of the chosen type from the shared seed
   bank, and starts the real-time growth clock for this plot. */
function apiPlant(body){
  const f = findFarmer(body.playerId);
  if(!f) return {ok:false, error:'Unknown player.'};
  const {r,c,cropId} = body;
  if(!isValidCoord(r,c) || tileAt(r,c)!=='farmland') return {ok:false, error:'Not farmland.'};
  if(!CROP_IDS.includes(cropId)) return {ok:false, error:'Bad crop.'};
  const cell = getOrCreateCell(r,c);
  if(cell.stage!==1) return {ok:false, error:'Not ready to plant.'};
  if((state.seeds[cropId]||0) <= 0) return {ok:false, error:"No seeds of that type in the team's seed bank — send a kudos to earn one!"};
  state.seeds[cropId]--;
  cell.type = cropId; cell.stage = 2; cell.waterCount = 0; cell.plantedAt = Date.now(); cell.plantedBy = f.name;
  bump();
  return {ok:true};
}

/* Watering is an optional booster: reduces effective grow time by
   REDUCTION_PER_WATER, up to MAX_WATER_BOOSTS times. It can no
   longer instantly finish a crop — real time always has to pass. */
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
  if(!isReady(cell)){
    return {ok:false, error:`Still growing — ${formatRemaining(remainingMs(cell))} left!`};
  }
  state.inventory[cell.type] = (state.inventory[cell.type]||0) + 1;
  state.totalHarvests++;
  state.stats.contributors[f.name] = (state.stats.contributors[f.name]||0) + 1;
  cell.stage = 1; cell.type = null; cell.plantedAt = null; cell.waterCount = 0;
  bump();
  return {ok:true};
}

/* Animals are picky eaters: they ONLY accept their own liked crop. */
function apiFeed(body){
  const f = findFarmer(body.playerId);
  if(!f) return {ok:false, error:'Unknown player.'};
  const animal = animalById(body.animalId);
  if(!animal) return {ok:false, error:'Unknown animal.'};
  const likedCrop = animal.likes;
  if((state.inventory[likedCrop]||0) <= 0){
    const cropName = capitalize(likedCrop);
    return {ok:false, error:`${capitalize(animal.type)}s only eat ${cropName}! Grow and harvest some first.`};
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

/* Adds a new custom kudos sentiment tag (e.g. to match a company's
   values), or returns the existing one if an equivalent label
   already exists (case-insensitive match) — this prevents teams
   from accidentally creating near-duplicate tags. Persists so the
   whole team can reuse it going forward. */
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

/* Sending a kudos is the ONLY source of seeds. Self-kudos blocked.
   The sentiment picked (why you're recognizing someone) is stored
   as a snapshot (emoji+label at time of sending) so the kudos wall
   stays accurate even if a sentiment is edited/removed later. The
   seed awarded is ALWAYS uniformly random and fully independent of
   the sentiment chosen — recognition and reward are decoupled by
   design. */
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
  // The random seed reward is intentionally decoupled from the sentiment above.
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
  if(!(decorId in DECORATION_IDS)) return {ok:false, error:'Unknown decoration.'};
  if(DECORATION_IDS[decorId] > points()) return {ok:false, error:'Not unlocked yet.'};
  const key = cellKey(r,c);
  if(state.decorations[key]) return {ok:false, error:'Tile already decorated.'};
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

function apiResetSeason(){
  const keepFarmers = state.farmers;
  const keepTeamName = state.teamName;
  const keepSentiments = state.sentiments; // the team's kudos vocabulary carries over between seasons
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
  '/api/kudos': apiKudos,
  '/api/sentiments': apiAddSentiment,
  '/api/decorate': apiDecorate,
  '/api/remove-decor': apiRemoveDecor,
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
  req.on('data', chunk=>{ data += chunk; if(data.length > 1e6) req.destroy(); });
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

/* Flush any pending debounced save immediately on graceful shutdown,
   so a deploy/restart doesn't lose the last few seconds of actions. */
function flushAndExit(){
  if(saveScheduled) saveStateToDisk();
  process.exit(0);
}
process.on('SIGINT', flushAndExit);
process.on('SIGTERM', flushAndExit);

/* Exported for local testing only: CROP_GROWTH_MS is intentionally
   mutable so a test harness can shrink grow durations (e.g. to a
   couple of seconds) to verify time-gating logic without waiting
   real days. Never mutated in production. STATE_FILE is exported
   so tests can clean up the persisted file between runs. */
module.exports = { server, CROP_GROWTH_MS, MAX_WATER_BOOSTS, REDUCTION_PER_WATER, CROP_IDS, STATE_FILE, saveStateToDisk };
