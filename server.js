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
        This is the only way to get seeds — it directly ties
        recognizing teammates to being able to grow anything.
     2. Planting a tilled plot SPENDS one seed of the chosen
        type from the shared Seed Bank. If the team has none of
        that type, planting is rejected.
     3. Harvested crops go into a shared Harvest Basket
        (the `inventory` object).
     4. Animals are picky: each only accepts its OWN liked crop
        (chicken/corn, cow/carrot, sheep/strawberry) — no
        fallback to other crops. This makes raising animals
        require deliberately growing the right crop for them.
     5. Leaderboards (kudos givers / growers / caretakers) keep
        the team accountable for remembering to recognize each
        other, not just play the farming minigame.
   ------------------------------------------------------------
   Design notes:
   - State lives only in memory: it resets if the server restarts
     or (on free hosting tiers) spins down from inactivity. This
     is fine for a single team-social "season" but is NOT durable
     long-term storage.
   - Single shared farm per deployment (no multi-room support).
   - Server re-validates every action so concurrent actions from
     different players can't corrupt state (e.g. double-harvest,
     double-spend a seed).
   ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

/* ============ Game constants (mirrors client) ============ */
const ROWS = 12, COLS = 18;
const WATER_NEEDED = 4;
const HAPPY_MAX = 5;
const FEED_GAIN = 2; // animals now only ever eat their liked crop, so this is fixed

const CROP_IDS = ['sunflower','carrot','strawberry','corn','pumpkin','tomato'];

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
    crops:{},                 // "r,c" -> {stage,type,water,plantedBy}
    animals: ANIMALS_DEF.map(a=>({...a, happiness:0})),
    seeds: emptySeedBank(),           // shared seed bank, earned only via kudos
    inventory:{carrot:0,corn:0,strawberry:0,pumpkin:0,tomato:0,sunflower:0, egg:0, milk:0, wool:0}, // harvested crops + animal products
    kudosLog:[],
    stats:{givers:{}, contributors:{}, caretakers:{}},
    totalHarvests:0,
    totalProducts:0,
    totalKudos:0,
    decorations:{},
    version:0
  };
}
let state = defaultState();
function bump(){ state.version++; }
function points(){ return state.totalHarvests + state.totalProducts; }

const MAX_KUDOS_LOG = 300;

/* ============ Helpers ============ */
function uid(){ return 'f' + Math.random().toString(36).slice(2,10); }
function cellKey(r,c){ return r+','+c; }
function getOrCreateCell(r,c){
  const key = cellKey(r,c);
  let cell = state.crops[key];
  if(!cell){ cell = {stage:0, type:null, water:0, plantedBy:null}; state.crops[key]=cell; }
  return cell;
}
function findFarmer(id){ return state.farmers.find(f=>f.id===id); }
function animalById(id){ return state.animals.find(a=>a.id===id); }
function isValidCoord(r,c){ return Number.isInteger(r) && Number.isInteger(c) && r>=0 && r<ROWS && c>=0 && c<COLS; }
function randomCropId(){ return CROP_IDS[Math.floor(Math.random()*CROP_IDS.length)]; }

/* ============ API handlers ============ */
/* Each handler receives the parsed JSON body and returns
   { ok: bool, error?: string, ...extra } — the caller always
   responds with the full current state alongside this result. */

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

/* Planting now SPENDS a seed of the chosen type from the shared
   seed bank — seeds only come from sending kudos, so this is the
   step that ties recognition directly to being able to grow food. */
function apiPlant(body){
  const f = findFarmer(body.playerId);
  if(!f) return {ok:false, error:'Unknown player.'};
  const {r,c,cropId} = body;
  if(!isValidCoord(r,c) || tileAt(r,c)!=='farmland') return {ok:false, error:'Not farmland.'};
  if(!CROP_IDS.includes(cropId)) return {ok:false, error:'Bad crop.'};
  const cell = getOrCreateCell(r,c);
  if(cell.stage!==1) return {ok:false, error:'Not ready to plant.'};
  if((state.seeds[cropId]||0) <= 0) return {ok:false, error:'No seeds of that type in the team\'s seed bank — send a kudos to earn one!'};
  state.seeds[cropId]--;
  cell.type = cropId; cell.stage = 2; cell.water = 0; cell.plantedBy = f.name;
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
  cell.water++;
  if(cell.water>=WATER_NEEDED) cell.stage = 3;
  bump();
  return {ok:true};
}

function apiHarvest(body){
  const f = findFarmer(body.playerId);
  if(!f) return {ok:false, error:'Unknown player.'};
  const {r,c} = body;
  if(!isValidCoord(r,c)) return {ok:false, error:'Bad coordinates.'};
  const cell = getOrCreateCell(r,c);
  if(cell.stage!==3) return {ok:false, error:'Not ready to harvest.'};
  state.inventory[cell.type] = (state.inventory[cell.type]||0) + 1;
  state.totalHarvests++;
  state.stats.contributors[f.name] = (state.stats.contributors[f.name]||0) + 1;
  cell.stage = 1; cell.type = null; cell.water = 0;
  bump();
  return {ok:true};
}

/* Animals are picky eaters: they ONLY accept their own liked crop
   (no fallback to whatever's in the basket). This makes raising
   each animal require deliberately growing its specific crop. */
function apiFeed(body){
  const f = findFarmer(body.playerId);
  if(!f) return {ok:false, error:'Unknown player.'};
  const animal = animalById(body.animalId);
  if(!animal) return {ok:false, error:'Unknown animal.'};
  const likedCrop = animal.likes;
  if((state.inventory[likedCrop]||0) <= 0){
    const cropName = likedCrop.charAt(0).toUpperCase()+likedCrop.slice(1);
    return {ok:false, error:`${capitalize(animal.type)}s only eat ${cropName}! Grow and harvest some first.`};
  }
  state.inventory[likedCrop]--;
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
function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

/* Sending a kudos is the ONLY source of seeds — awards one random
   crop type to the shared seed bank. Self-kudos is blocked so
   people can't farm seeds without actually recognizing a teammate. */
function apiKudos(body){
  const fromName = (body.fromName||'').toString().trim().slice(0,40);
  const toName = (body.toName||'').toString().trim().slice(0,40);
  const cropId = CROP_IDS.includes(body.cropId) ? body.cropId : CROP_IDS[0];
  const message = (body.message||'').toString().trim().slice(0,500);
  if(!fromName || !toName) return {ok:false, error:'From/To required.'};
  if(fromName.toLowerCase() === toName.toLowerCase()) return {ok:false, error:"You can't send yourself a kudos — recognize a teammate instead!"};
  state.kudosLog.push({fromName, toName, cropId, message, when:new Date().toLocaleString()});
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
  state = defaultState();
  state.farmers = keepFarmers;
  state.teamName = keepTeamName;
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
});

module.exports = server; // exported for local testing
