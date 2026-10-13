/* =========================================================================
 * Miner Cat 2 — standalone browser game
 * Canvas digging game: 25 stages (50 blocks each, stage 25 infinite),
 * 21-block-wide world, health/lava, upgrades, achievements, backpack.
 * Progress persists on the server (autosave every 60s).
 * All art is drawn programmatically on canvas — no external assets.
 * ========================================================================= */
'use strict';

/* ------------------------------- constants ----------------------------- */
const COLS = 21;                 // world width in blocks
const SPAWN_X = 10;              // middle column (0-based)
const STAGE_ROWS = 50;           // rows per stage (stages 1..24)
const STAGES = 100;
const MP_STAGE = 1001;       // multiplayer world
const LOUNGE_STAGE = 1002;   // admin's lounge
const SAVE_INTERVAL_MS = 60 * 1000;
const LAVA_DPS = 25;
const MAX_HP = 100;

const STAGE_NAMES = [
  'Meadow Mine', 'Pebble Depths', 'Copper Hollow', 'Rustic Burrows',
  'Iron Tunnels', 'Ember Veins', 'Golden Grotto', 'Shadow Shafts',
  'Molten Maze', 'Diamond Deep', 'Echo Caverns', 'Basalt Halls',
  'Amber Abyss', 'Fossil Flats', 'Magma Channels', 'Obsidian Outpost',
  'Quartz Crossing', 'Slate Sanctum', 'Pyrite Pass', 'Onyx Hollow',
  'Ember Deep', 'Fathom Falls', 'Core Corridors', 'Abyssal Plain',
  'The Endless Dark',
];
// Generate names for stages 26-100
{
  const adj = ['Crimson', 'Azure', 'Silent', 'Howling', 'Glimmering', 'Ancient', 'Frozen', 'Burning', 'Whispering', 'Thundering',
    'Misty', 'Radiant', 'Umbral', 'Prismatic', 'Jagged', 'Serene', 'Savage', 'Luminous', 'Hollow', 'Eternal',
    'Forgotten', 'Sunken', 'Rising', 'Falling', 'Twisted'];
  const noun = ['Depths', 'Tunnels', 'Caverns', 'Mines', 'Shafts', 'Grotto', 'Abyss', 'Hollow', 'Pass', 'Corridors',
    'Warrens', 'Vaults', 'Pits', 'Labyrinth', 'Sanctum'];
  for (let i = 26; i <= 100; i++) {
    STAGE_NAMES.push(`${adj[(i * 7) % adj.length]} ${noun[(i * 13) % noun.length]} ${i}`);
  }
}

// Block definitions: hp (hits), coin value, display name, base color.
const BLOCKS = {
  air:     { hp: 0,        value: 0,  name: 'Air' },
  grass:   { hp: 2,        value: 1,  name: 'Dirt' },
  dirt:    { hp: 2,        value: 1,  name: 'Dirt' },
  stone:   { hp: 6,        value: 2,  name: 'Stone' },
  coal:    { hp: 8,        value: 4,  name: 'Coal' },
  copper:  { hp: 10,       value: 6,  name: 'Copper' },
  iron:    { hp: 14,       value: 10, name: 'Iron' },
  gold:    { hp: 20,       value: 20, name: 'Gold' },
  diamond: { hp: 30,       value: 50, name: 'Diamond' },
  lava:    { hp: 12,       value: 15, name: 'Lava' },
  bedrock: { hp: Infinity, value: 0,  name: 'Bedrock' },
};
const ORE_ORDER = ['dirt', 'stone', 'coal', 'copper', 'iron', 'gold', 'diamond', 'lava'];
const ORE_COLORS = {
  dirt: '#8a5a33', stone: '#8d8d94', coal: '#4a4a52', copper: '#b0703a',
  iron: '#9aa4ad', gold: '#e3b93a', diamond: '#5fd0e8', lava: '#ff6a1f',
};

const ACHIEVEMENTS = [
  { id: 'rock-rookie', name: 'Rock rookie', desc: 'Break 10 blocks', coins: 50 },
  { id: 'block-buster', name: 'Block buster', desc: 'Break 100 blocks', coins: 200 },
  { id: 'mining-mogul', name: 'Mining mogul', desc: 'Break 1,000 blocks', coins: 1000 },
  { id: 'deep-paws',   name: 'Deep paws',   desc: 'Reach depth 25', coins: 150 },
  { id: 'deep-diver',  name: 'Deep diver',  desc: 'Reach depth 100', coins: 500 },
  { id: 'stage-explorer', name: 'Stage explorer', desc: 'Reach stage 10', coins: 300 },
  { id: 'big-swing',   name: 'Big swing',   desc: 'Reach 20 tap power', coins: 250 },
  { id: 'maxed-out',   name: 'Maxed out',   desc: 'Max all upgrades', coins: 2000 },
  { id: 'coin-starter', name: 'Coin starter', desc: 'Hold 1,000 coins', coins: 100 },
  { id: 'coin-tycoon', name: 'Coin tycoon', desc: 'Hold 100,000 coins', coins: 1000 },
  { id: 'gem-hunter',  name: 'Gem hunter',  desc: 'Find 10 gems', coins: 500 },
];

/* ------------------------------- API client ---------------------------- */
const api = {
  async req(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  },
  me: () => api.req('GET', '/api/me'),
  signup: (u, p, d) => api.req('POST', '/api/signup', { username: u, password: p, displayName: d }),
  signin: (u, p) => api.req('POST', '/api/signin', { username: u, password: p }),
  signout: () => api.req('POST', '/api/signout'),
  getSave: () => api.req('GET', '/api/save'),
  postSave: (save) => api.req('POST', '/api/save', { save }),
  leaderboard: () => api.req('GET', '/api/leaderboard'),
  updateAccount: (patch) => api.req('PATCH', '/api/account', patch),
  admin: (command, extra) => api.req('POST', '/api/admin', { command, ...(extra || {}) }),
};

/* --------------------------- deterministic RNG ------------------------- */
function hash4(a, b, c, d) {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) +
           Math.imul(c, 2246822519) + Math.imul(d, 3266489917)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* ------------------------------- game state ---------------------------- */
const S = {
  user: null,
  // persistent save fields:
  coins: 0, gems: 0, blocksMined: 0,
  pickLevel: 1, armorLevel: 1, bagLevel: 1,
  stage: 1, depth: 0, maxDepth: 0,
  px: SPAWN_X + 0.5, py: -0.5,   // player pos in tiles (x=center, y=feet)
  health: MAX_HP, god: false,
  backpack: {},                  // oreType -> count
  achievements: [],
  seeds: {},                     // stage -> seed
  cleared: new Set(),            // "stage:x:y" of mined blocks
  // transient:
  vx: 0, vy: 0, onGround: false, facing: 1,
  inMp: false,                   // in multiplayer world?
  inLounge: false,               // in admin lounge?
  dmg: new Map(),                // "stage:x:y" -> hp remaining
  lastHurtAt: 0,
  started: false,
};
const tapPower = () => S.pickLevel * 2;
const bagCapacity = () => 20 + (S.bagLevel - 1) * 15;
const bagCount = () => Object.values(S.backpack).reduce((a, b) => a + b, 0);
const armorReduction = () => Math.min(0.75, (S.armorLevel - 1) * 0.05);

function stateToSave() {
  return {
    version: 1,
    coins: S.coins, gems: S.gems, blocksMined: S.blocksMined,
    pickLevel: S.pickLevel, armorLevel: S.armorLevel, bagLevel: S.bagLevel,
    stage: S.stage, depth: S.depth, maxDepth: S.maxDepth,
    px: S.px, py: S.py, health: S.health, god: !!S.god,
    backpack: S.backpack, achievements: S.achievements,
    seeds: S.seeds, cleared: [...S.cleared].slice(-20000),
  };
}
function loadSave(save) {
  S.coins = save.coins | 0; S.gems = save.gems | 0; S.blocksMined = save.blocksMined | 0;
  S.pickLevel = save.pickLevel || 1; S.armorLevel = save.armorLevel || 1; S.bagLevel = save.bagLevel || 1;
  S.stage = save.stage || 1; S.depth = save.depth | 0; S.maxDepth = save.maxDepth | 0;
  S.px = (typeof save.px === 'number') ? save.px : SPAWN_X + 0.5;
  S.py = (typeof save.py === 'number') ? save.py : -0.5;
  S.health = (typeof save.health === 'number') ? Math.min(MAX_HP, save.health) : MAX_HP;
  S.god = !!save.god;
  S.backpack = save.backpack || {};
  S.achievements = Array.isArray(save.achievements) ? save.achievements : [];
  S.seeds = save.seeds || {};
  S.cleared = new Set(Array.isArray(save.cleared) ? save.cleared : []);
  S.dmg.clear();
}

/* ------------------------------ world gen ------------------------------ */
function stageSeed(stage) {
  if (!S.seeds[stage]) S.seeds[stage] = (Math.random() * 1e9) | 0;
  return S.seeds[stage];
}
// Rarity multiplier: ores get progressively rarer in deeper stages.
function rarityMult(stage) { return Math.pow(0.985, stage - 1); }

function genBlock(stage, x, y) {
  if (y < 0) return 'air';
  const seed = stageSeed(stage);
  if (stage === 1 && y === 0) return 'grass';
  if (stage > 1 && y === 0) return (x >= 9 && x <= 11) ? 'air' : 'stone'; // entry shaft
  const r = (salt) => hash4(seed, stage * 100003 + y, x * 31 + 7, salt);
  const m = rarityMult(stage);
  if (y >= 30 && r(1) < 0.020 * m) return 'diamond';
  if (y >= 22 && r(2) < 0.035 * m) return 'gold';
  if (y >= 14 && r(3) < 0.060 * m) return 'iron';
  if (y >= 8  && r(4) < 0.070 * m) return 'copper';
  if (y >= 3  && r(5) < 0.080 * m) return 'coal';
  if (y >= 18 && r(6) < 0.030) return 'lava';
  return y < 6 ? 'dirt' : 'stone';
}

function blockAt(stage, x, y) {
  if (x <= 0 || x >= COLS - 1) return 'bedrock';       // world borders
  if (stage === 1 && x === SPAWN_X && y === 0) return 'bedrock'; // spawn block
  if (y < 0) return 'air';
  // Admin's Lounge: flat wooden floor, no mining
  if (stage === LOUNGE_STAGE) return y === 0 ? 'wood' : 'air';
  const key = stage + ':' + x + ':' + y;
  // Multiplayer and lounge worlds use shared cleared set
  if (stage === MP_STAGE || stage === LOUNGE_STAGE) return MP.cleared.has(key) ? 'air' : genBlock(stage, x, y);
  if (S.cleared.has(key)) return 'air';
  return genBlock(stage, x, y);
}
const isSolid = (t) => t !== 'air';
const isMineable = (t) => t !== 'air' && t !== 'bedrock' && t !== 'wood';

/* ------------------------------ physics -------------------------------- */
const P = { w: 0.7, h: 0.95, speed: 6.5, jumpV: 12.5, grav: 32 };

function solidTile(tx, ty) {
  return isSolid(blockAt(S.stage, tx, ty));
}

function movePlayer(dt) {
  // horizontal input
  const left = input.left, right = input.right;
  const target = (right ? P.speed : 0) - (left ? P.speed : 0);
  S.vx += (target - S.vx) * Math.min(1, dt * 14);
  if (target !== 0) S.facing = target > 0 ? 1 : -1;

  // X axis
  S.px += S.vx * dt;
  {
    const edge = S.px + (S.vx >= 0 ? P.w / 2 : -P.w / 2);
    const tx = Math.floor(edge);
    for (const oy of [0.08, P.h - 0.08]) {
      const ty = Math.floor(S.py - oy);
      if (solidTile(tx, ty)) {
        S.px = S.vx >= 0 ? tx - P.w / 2 - 0.001 : tx + 1 + P.w / 2 + 0.001;
        S.vx = 0;
        break;
      }
    }
  }
  // Y axis
  S.vy += P.grav * dt;
  if (S.vy > 24) S.vy = 24;
  S.py += S.vy * dt;
  S.onGround = false;
  if (S.vy >= 0) {
    const ty = Math.floor(S.py);
    for (const ox of [-P.w / 2 + 0.08, P.w / 2 - 0.08]) {
      if (solidTile(Math.floor(S.px + ox), ty)) {
        S.py = ty - 0.001; S.vy = 0; S.onGround = true;
        break;
      }
    }
  } else {
    const ty = Math.floor(S.py - P.h);
    for (const ox of [-P.w / 2 + 0.08, P.w / 2 - 0.08]) {
      if (solidTile(Math.floor(S.px + ox), ty)) {
        S.py = ty + 1 + P.h + 0.001; S.vy = 0;
        break;
      }
    }
  }
  // jump
  if (input.jumpQueued && S.onGround) {
    S.vy = -P.jumpV; S.onGround = false;
  }
  input.jumpQueued = false;

  // stage transitions
  const ty = Math.floor(S.py);
  const rows = S.stage >= STAGES ? Infinity : STAGE_ROWS;
  if (ty >= rows && S.stage < STAGES) {
    S.stage++; S.py = -1.5; S.vy = 0;
    unlockAch('stage-explorer');
    toast(`Stage ${S.stage} / 100 · ${STAGE_NAMES[S.stage - 1]}`);
    refreshStageHeader();
  } else if (S.py < -4 && S.stage > 1) {
    S.stage--; S.py = STAGE_ROWS - 1.5; S.vy = 0;
    toast(`Stage ${S.stage} / 100 · ${STAGE_NAMES[S.stage - 1]}`);
    refreshStageHeader();
  }
  // clamp inside borders
  S.px = Math.max(1 + P.w / 2 + 0.01, Math.min(COLS - 2 - P.w / 2 - 0.01, S.px));

  // depth tracking + achievement
  const depth = (S.stage - 1) * STAGE_ROWS + Math.max(0, ty);
  S.depth = depth;
  if (depth > S.maxDepth) {
    S.maxDepth = depth;
    unlockAch('deep-paws');
    unlockAch('deep-diver');
  }

  // lava damage (25 dps, reduced by armor)
  const touchingLava = tilesOverlap('lava');
  if (touchingLava) {
    hurt(LAVA_DPS * (1 - armorReduction()) * dt);
  } else if (performance.now() - S.lastHurtAt > 4000 && S.health < MAX_HP) {
    S.health = Math.min(MAX_HP, S.health + 3 * dt); // regen out of danger
  }
}

function tilesOverlap(type) {
  const x0 = Math.floor(S.px - P.w / 2), x1 = Math.floor(S.px + P.w / 2);
  const y0 = Math.floor(S.py - P.h), y1 = Math.floor(S.py);
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      if (blockAt(S.stage, x, y) === type) return true;
  return false;
}

function hurt(amount) {
  if (S.god) return; // god mode: no damage
  S.health -= amount;
  S.lastHurtAt = performance.now();
  if (S.health <= 0) {
    S.health = MAX_HP;
    goToSpawn(false);
    toast('You melted! Respawned at spawn.');
  }
}

/* ------------------------------- mining -------------------------------- */
function mineTarget() {
  // mouse/touch pointer target first
  if (pointer.active) {
    const t = screenToTile(pointer.x, pointer.y);
    const dx = (t.x + 0.5) - S.px, dy = (t.y + 0.5) - (S.py - P.h / 2);
    if (Math.hypot(dx, dy) <= 3.5) {
      const b = blockAt(S.stage, t.x, t.y);
      if (isMineable(b)) return { x: t.x, y: t.y, type: b };
    }
  }
  // otherwise: block under feet first (dig down), then adjacent in facing direction
  const px = Math.floor(S.px);
  const fx = px + S.facing;
  const fy = Math.floor(S.py);
  const cands = [
    [px, fy + 1],
    [fx, fy], [fx, fy - 1],
    [fx, fy + 1],
  ];
  for (const [x, y] of cands) {
    const b = blockAt(S.stage, x, y);
    if (isMineable(b)) return { x, y, type: b };
  }
  return null;
}

let mineCooldown = 0;
function updateMining(dt) {
  mineCooldown -= dt;
  if (!input.mineHeld || mineCooldown > 0) return;
  const t = mineTarget();
  if (!t) return;
  mineCooldown = 0.22;
  const key = S.stage + ':' + t.x + ':' + t.y;
  const def = BLOCKS[t.type];
  const remain = S.dmg.has(key) ? S.dmg.get(key) : def.hp;
  const left = remain - tapPower();
  if (left <= 0) {
    S.dmg.delete(key);
    if (S.inMp || S.inLounge) {
      MP.cleared.add(key);
    } else {
      S.cleared.add(key);
    }
    // Tell other players about the break (multiplayer/lounge only)
    if (MP.ws && MP.ws.readyState === 1 && (S.inMp || S.inLounge)) {
      MP.ws.send(JSON.stringify({ t: 'break', stage: S.stage, x: t.x, y: t.y }));
    }
    S.blocksMined++;
    if (bagCount() < bagCapacity()) {
      S.backpack[t.type] = (S.backpack[t.type] || 0) + 1;
      if (t.type === 'diamond') { S.gems++; unlockAch('gem-hunter'); }
    } else {
      toast('Backpack full! Tap "Sell backpack" to sell anywhere.');
    }
    unlockAch('rock-rookie');
    unlockAch('block-buster');
    unlockAch('mining-mogul');
    refreshUI();
  } else {
    S.dmg.set(key, left);
  }
  S.swingAt = performance.now();
}

/* ----------------------------- progression ---------------------------- */
function upgradeCost(kind) {
  const lvl = kind === 'pick' ? S.pickLevel : kind === 'armor' ? S.armorLevel : S.bagLevel;
  const base = kind === 'pick' ? 35 : kind === 'armor' ? 30 : 25;
  return Math.round(base * Math.pow(lvl, 1.5));
}
function buyUpgrade(kind) {
  if ((kind === 'pick' && S.pickLevel >= 50) ||
      (kind === 'armor' && S.armorLevel >= 50) ||
      (kind === 'bag' && S.bagLevel >= 50)) { toast('Max level!'); return; }
  const cost = upgradeCost(kind);
  if (S.coins < cost) { toast('Not enough coins!'); return; }
  S.coins -= cost;
  if (kind === 'pick') { S.pickLevel++; unlockAch('big-swing'); }
  if (kind === 'armor') S.armorLevel++;
  if (kind === 'bag') S.bagLevel++;
  unlockAch('maxed-out');
  toast('Upgrade purchased!');
  refreshUI();
}
function sellBackpack() {
  let total = 0;
  for (const [type, n] of Object.entries(S.backpack)) total += (BLOCKS[type]?.value || 0) * n;
  if (total === 0) { toast('Backpack is empty.'); return; }
  S.coins += total;
  S.backpack = {};
  unlockAch('coin-starter');
  unlockAch('coin-tycoon');
  toast(`Sold for ${total} coins!`);
  refreshUI();
}
function goToSpawn(sell = true) {
  if (sell) {
    let total = 0;
    for (const [type, n] of Object.entries(S.backpack)) total += (BLOCKS[type]?.value || 0) * n;
    if (total > 0) { S.coins += total; toast(`Teleported to spawn — sold backpack for ${total} coins!`); }
    else toast('Teleported to spawn.');
    S.backpack = {};
    unlockAch('coin-starter');
    unlockAch('coin-tycoon');
  }
  S.stage = 1; S.px = SPAWN_X + 0.5; S.py = -0.5;
  S.vx = 0; S.vy = 0; S.health = MAX_HP;
  refreshStageHeader(); refreshUI();
}
function unlockAch(id) {
  if (id === 'rock-rookie' && S.blocksMined < 10) return;
  if (id === 'block-buster' && S.blocksMined < 100) return;
  if (id === 'mining-mogul' && S.blocksMined < 1000) return;
  if (id === 'deep-paws' && S.maxDepth < 25) return;
  if (id === 'deep-diver' && S.maxDepth < 100) return;
  if (id === 'stage-explorer' && S.stage < 10) return;
  if (id === 'big-swing' && tapPower() < 20) return;
  if (id === 'maxed-out' && (S.pickLevel < 50 || S.armorLevel < 50 || S.bagLevel < 50)) return;
  if (id === 'coin-starter' && S.coins < 1000) return;
  if (id === 'coin-tycoon' && S.coins < 100000) return;
  if (id === 'gem-hunter' && S.gems < 10) return;
  if (S.achievements.includes(id)) return;
  S.achievements.push(id);
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (a && a.coins) {
    S.coins += a.coins;
    toast(`🏆 ${a.name}! +${a.coins} 🪙`);
  } else {
    toast(`🏆 Achievement: ${a.name}!`);
  }
  refreshUI();
}

/* ------------------------------ rendering ------------------------------ */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let TILE = 40, camY = 0, dpr = 1;

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  // Set canvas size directly via JS (authoritative; bypasses any CSS/cache issues).
  // Width: game column width, clamped to the viewport so it can never overflow.
  const colW = document.getElementById('game-col').clientWidth || window.innerWidth;
  const w = Math.max(100, Math.min(colW, window.innerWidth - 16));
  // Height: fill the window while leaving room for topbar + controls.
  const h = Math.max(280, Math.min(window.innerHeight * 0.72, window.innerHeight - 340));
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  // HiDPI: scale drawing so CSS-pixel coordinates map to the backing store.
  // (Setting width/height resets the transform, so this must come after.)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // zoom: entire 21-block width (borders) always visible; clamp tile size so
  // blocks stay tappable on tiny screens and sane on huge ones
  TILE = Math.max(14, Math.min(72, w / COLS));
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
// Recompute whenever the canvas layout size changes for any reason
// (flex layout settling, panels toggling, split-view, etc.) so the
// 21-block world always fills the full canvas width.
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => resize()).observe(canvas);
}

function screenToTile(sx, sy) {
  const r = canvas.getBoundingClientRect();
  const cx = sx - r.left, cy = sy - r.top;
  return { x: Math.floor(cx / TILE), y: Math.floor(cy / TILE + camY) };
}

function blockColor(type, x, y, t) {
  switch (type) {
    case 'grass': return '#7c5230';
    case 'dirt': return '#8a5a33';
    case 'stone': return '#8d8d94';
    case 'coal': return '#55555e';
    case 'copper': return '#b0703a';
    case 'iron': return '#9aa4ad';
    case 'gold': return '#dfae2e';
    case 'diamond': return '#54c8e8';
    case 'lava': {
      const f = 0.5 + 0.5 * Math.sin(t / 180 + x * 1.7 + y * 2.3);
      return f > 0.5 ? '#ff6a1f' : '#ff3d00';
    }
    case 'bedrock': return '#2b2b31';
    default: return '#000';
  }
}

function drawBlock(bx, by, type, t) {
  const px = bx * TILE, py = (by - camY) * TILE;
  if (py + TILE < -TILE || py > canvas.height / dpr + TILE) return;
  ctx.fillStyle = blockColor(type, bx, by, t);
  ctx.fillRect(px, py, TILE, TILE);
  // deterministic speckles
  const n = type === 'bedrock' ? 3 : 4;
  for (let i = 0; i < n; i++) {
    const r = hash4(bx * 7 + 1, by * 13 + 2, i * 5 + 3, S.seeds[S.stage] || 1);
    const sx = px + r * (TILE - 5) + 2, sy = py + hash4(i, bx, by, 9) * (TILE - 5) + 2;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    const s = Math.max(2, TILE * 0.09);
    ctx.fillRect(sx, sy, s, s);
  }
  if (type === 'grass') { // grassy top strip
    ctx.fillStyle = '#6fbf5a';
    ctx.fillRect(px, py, TILE, Math.max(3, TILE * 0.18));
  }
  if (type === 'diamond') { // sparkle
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const sx = px + TILE * 0.3, sy = py + TILE * 0.3, s = Math.max(2, TILE * 0.08);
    ctx.fillRect(sx, sy, s, s * 2.4);
    ctx.fillRect(sx - s * 0.7, sy + s * 0.7, s * 2.4, s);
  }
  if (type === 'lava') {
    ctx.fillStyle = 'rgba(255,220,120,0.5)';
    const w = TILE * (0.3 + 0.2 * Math.sin(t / 240 + bx + by));
    ctx.fillRect(px + TILE * 0.2, py + TILE * 0.35, w, TILE * 0.3);
  }
  if (type === 'bedrock') { // rivets
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(px + TILE * 0.3, py + TILE * 0.3, TILE * 0.12, TILE * 0.12);
    ctx.fillRect(px + TILE * 0.6, py + TILE * 0.6, TILE * 0.12, TILE * 0.12);
  }
  // mining cracks
  const key = S.stage + ':' + bx + ':' + by;
  if (S.dmg.has(key)) {
    const frac = S.dmg.get(key) / BLOCKS[type].hp;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = Math.max(1, TILE * 0.05);
    ctx.beginPath();
    ctx.moveTo(px + TILE * 0.2, py + TILE * 0.2);
    ctx.lineTo(px + TILE * (0.5 + frac * 0.3), py + TILE * 0.6);
    ctx.lineTo(px + TILE * 0.75, py + TILE * 0.3);
    ctx.stroke();
  }
  // subtle grid
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
}

function drawCat(t) {
  const s = TILE;
  const cx = S.px * s;
  const feetY = (S.py - camY) * s;
  const u = s / 40; // unit scaled to tile
  ctx.save();
  ctx.translate(cx, feetY);
  if (S.facing < 0) ctx.scale(-1, 1);
  const swing = S.swingAt && (performance.now() - S.swingAt < 220)
    ? Math.sin((performance.now() - S.swingAt) / 220 * Math.PI) * 0.9 : 0;

  // tail
  ctx.strokeStyle = '#e8933c'; ctx.lineWidth = 5 * u; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-11 * u, -14 * u);
  ctx.quadraticCurveTo(-20 * u, -18 * u, -17 * u, -28 * u); ctx.stroke();
  // body
  ctx.fillStyle = '#f0a04b';
  roundRect(-12 * u, -26 * u, 24 * u, 18 * u, 7 * u); ctx.fill();
  // feet
  ctx.fillStyle = '#d97f2e';
  ctx.fillRect(-11 * u, -10 * u, 9 * u, 6 * u);
  ctx.fillRect(2 * u, -10 * u, 9 * u, 6 * u);
  // head
  ctx.fillStyle = '#f0a04b';
  roundRect(-10 * u, -42 * u, 24 * u, 19 * u, 6 * u); ctx.fill();
  // ears
  ctx.beginPath();
  ctx.moveTo(-8 * u, -42 * u); ctx.lineTo(-5 * u, -50 * u); ctx.lineTo(0 * u, -43 * u); ctx.fill();
  ctx.moveTo(8 * u, -42 * u); ctx.lineTo(11 * u, -50 * u); ctx.lineTo(14 * u, -43 * u); ctx.fill();
  // eyes + nose
  ctx.fillStyle = '#2b2118';
  ctx.beginPath(); ctx.arc(0 * u, -34 * u, 2.2 * u, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(9 * u, -34 * u, 2.2 * u, 0, 7); ctx.fill();
  ctx.fillStyle = '#c96a6a';
  ctx.fillRect(3.4 * u, -30 * u, 3 * u, 2.4 * u);
  // stripes
  ctx.fillStyle = 'rgba(180,100,30,0.6)';
  ctx.fillRect(-6 * u, -42 * u, 3 * u, 6 * u);
  ctx.fillRect(9 * u, -42 * u, 3 * u, 6 * u);

  // pickaxe (visible, swings when mining)
  ctx.save();
  ctx.translate(13 * u, -24 * u);
  ctx.rotate(-0.5 + swing);
  ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 4 * u;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(16 * u, -14 * u); ctx.stroke();
  ctx.strokeStyle = '#9aa4ad'; ctx.lineWidth = 5 * u;
  ctx.beginPath(); ctx.moveTo(10 * u, -19 * u); ctx.lineTo(22 * u, -9 * u); ctx.stroke();
  ctx.restore();

  ctx.restore();
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function render(t) {
  // Self-heal: if the canvas CSS size changed without resize() running
  // (missed resize/observer event), re-sync backing store and tile size.
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) resize();
  const W = canvas.width / dpr, H = canvas.height / dpr;
  // Admin's Lounge — draw the cozy room instead of blocks
  if (S.inLounge) {
    drawLounge(t);
    drawCat(t);
    drawMpPlayers();
    return;
  }
  // background
  if (S.stage === 1 && camY < 6) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#8fd0f0'); g.addColorStop(1, '#d8f0fa');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // mountains
    ctx.fillStyle = '#b9d4c8';
    const baseY = (0 - camY) * TILE;
    ctx.beginPath(); ctx.moveTo(0, baseY);
    for (let x = 0; x <= W; x += W / 6) ctx.lineTo(x + W / 12, baseY - H * 0.16 - (x % (W / 3)) * 0.02);
    ctx.lineTo(W, baseY); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillStyle = '#171310'; ctx.fillRect(0, 0, W, H);
  }

  const yStart = Math.max(0, Math.floor(camY) - 1);
  const yEnd = Math.ceil(camY + H / TILE) + 1;
  for (let y = yStart; y <= yEnd; y++) {
    for (let x = 0; x < COLS; x++) {
      const b = blockAt(S.stage, x, y);
      if (b !== 'air') drawBlock(x, y, b, t);
    }
  }
  // spawn flag (stage 1)
  if (S.stage === 1) {
    const fx = SPAWN_X * TILE + TILE / 2, fy = (0 - camY) * TILE;
    ctx.strokeStyle = '#5a4632'; ctx.lineWidth = Math.max(2, TILE * 0.06);
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - TILE * 1.6); ctx.stroke();
    ctx.fillStyle = '#e14b4b';
    ctx.beginPath(); ctx.moveTo(fx, fy - TILE * 1.6);
    ctx.lineTo(fx + TILE * 0.9, fy - TILE * 1.35); ctx.lineTo(fx, fy - TILE * 1.1);
    ctx.closePath(); ctx.fill();
  }
  drawCat(t);
  drawMpPlayers();
}

// Admin's Lounge — a cozy room with couch and chairs (no mining here)
function drawLounge(t) {
  const W = canvas.width / dpr, H = canvas.height / dpr;
  // Wall
  const wg = ctx.createLinearGradient(0, 0, 0, H);
  wg.addColorStop(0, '#3a2c22'); wg.addColorStop(1, '#2a2018');
  ctx.fillStyle = wg; ctx.fillRect(0, 0, W, H);
  // Wooden floor (bottom 30%)
  const floorY = H * 0.7;
  ctx.fillStyle = '#6b4a2f'; ctx.fillRect(0, floorY, W, H - floorY);
  ctx.strokeStyle = '#5a3d26'; ctx.lineWidth = 2;
  for (let y = floorY + 12; y < H; y += 18) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  // Rug
  ctx.fillStyle = '#8b2e2e';
  const rugW = TILE * 8, rugH = TILE * 3;
  ctx.fillRect(W / 2 - rugW / 2, floorY + 10, rugW, rugH);
  ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 3;
  ctx.strokeRect(W / 2 - rugW / 2, floorY + 10, rugW, rugH);
  // Sign
  ctx.fillStyle = '#c9a227';
  ctx.font = `bold ${Math.max(16, TILE * 0.5)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText("👑 Admin's Lounge", W / 2, H * 0.15);
  // Couch (left)
  drawCouch(W * 0.18, floorY);
  // Chairs (right)
  drawChair(W * 0.72, floorY, -1);
  drawChair(W * 0.85, floorY, 1);
  // Coffee table (center)
  const tx = W / 2, ty = floorY + rugH / 2;
  ctx.fillStyle = '#4a3320';
  ctx.fillRect(tx - TILE * 1.2, ty - TILE * 0.25, TILE * 2.4, TILE * 0.5);
  ctx.fillStyle = '#5a3d26';
  ctx.fillRect(tx - TILE * 1.3, ty - TILE * 0.35, TILE * 2.6, TILE * 0.15);
  // Lamp glow
  const lg = ctx.createRadialGradient(W * 0.5, H * 0.3, 10, W * 0.5, H * 0.3, TILE * 4);
  lg.addColorStop(0, 'rgba(255, 220, 130, 0.25)');
  lg.addColorStop(1, 'rgba(255, 220, 130, 0)');
  ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
}
function drawCouch(x, floorY) {
  const w = TILE * 3.2, h = TILE * 1.4;
  const y = floorY - h;
  // Base
  ctx.fillStyle = '#7a3b2e';
  ctx.fillRect(x - w / 2, y + TILE * 0.4, w, h - TILE * 0.4);
  // Backrest
  ctx.fillStyle = '#8b4a3a';
  ctx.fillRect(x - w / 2, y, w, TILE * 0.6);
  // Armrests
  ctx.fillStyle = '#6b3327';
  ctx.fillRect(x - w / 2 - TILE * 0.25, y + TILE * 0.3, TILE * 0.35, h - TILE * 0.3);
  ctx.fillRect(x + w / 2 - TILE * 0.1, y + TILE * 0.3, TILE * 0.35, h - TILE * 0.3);
  // Cushions
  ctx.fillStyle = '#9b5a4a';
  ctx.fillRect(x - w / 2 + TILE * 0.15, y + TILE * 0.65, w / 2 - TILE * 0.2, TILE * 0.45);
  ctx.fillRect(x + TILE * 0.05, y + TILE * 0.65, w / 2 - TILE * 0.2, TILE * 0.45);
}
function drawChair(x, floorY, dir) {
  const w = TILE * 1.2, h = TILE * 1.6;
  const y = floorY - h;
  // Backrest
  ctx.fillStyle = '#5a4a6b';
  ctx.fillRect(x - w / 2 + (dir * TILE * 0.2), y, w * 0.3, h * 0.6);
  // Seat
  ctx.fillStyle = '#6b5a7b';
  ctx.fillRect(x - w / 2, y + h * 0.55, w, TILE * 0.35);
  // Legs
  ctx.fillStyle = '#3a2f45';
  ctx.fillRect(x - w / 2 + 2, y + h * 0.55 + TILE * 0.35, 4, floorY - (y + h * 0.55 + TILE * 0.35));
  ctx.fillRect(x + w / 2 - 6, y + h * 0.55 + TILE * 0.35, 4, floorY - (y + h * 0.55 + TILE * 0.35));
}

/* -------------------------------- input -------------------------------- */
const input = { left: false, right: false, mineHeld: false, jumpQueued: false };
const pointer = { active: false, x: 0, y: 0 };

window.addEventListener('keydown', (e) => {
  if (e.repeat) { if (['ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault(); return; }
  switch (e.key) {
    case 'ArrowLeft': case 'a': case 'A': input.left = true; break;
    case 'ArrowRight': case 'd': case 'D': input.right = true; break;
    case 'ArrowUp': case 'w': case 'W': case ' ':
      input.jumpQueued = true; e.preventDefault(); break;
  }
  if (['ArrowDown', 'ArrowUp', ' '].includes(e.key)) e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  switch (e.key) {
    case 'ArrowLeft': case 'a': case 'A': input.left = false; break;
    case 'ArrowRight': case 'd': case 'D': input.right = false; break;
  }
});

function bindHold(el, on, off) {
  const start = (e) => { e.preventDefault(); on(); };
  const end = (e) => { e.preventDefault(); off(); };
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('pointerleave', end);
}
bindHold(document.getElementById('ctl-left'), () => input.left = true, () => input.left = false);
bindHold(document.getElementById('ctl-right'), () => input.right = true, () => input.right = false);
bindHold(document.getElementById('ctl-jump'), () => input.jumpQueued = true, () => {});
bindHold(document.getElementById('ctl-mine'), () => input.mineHeld = true, () => input.mineHeld = false);
function togglePanel(id) {
  const panel = document.getElementById(id);
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
document.getElementById('ctl-ach').addEventListener('click', () => togglePanel('ach-panel'));
document.getElementById('ctl-bag').addEventListener('click', () => togglePanel('bag-panel'));
document.getElementById('ctl-up').addEventListener('click', () => togglePanel('up-panel'));
document.getElementById('ctl-lb').addEventListener('click', () => togglePanel('lb-panel'));
document.getElementById('ctl-admin').addEventListener('click', () => togglePanel('admin-panel'));

canvas.addEventListener('pointerdown', (e) => {
  pointer.active = true; pointer.x = e.clientX; pointer.y = e.clientY;
  input.mineHeld = true;
  canvas.setPointerCapture(e.pointerId);
});
const pointerEnd = () => { pointer.active = false; input.mineHeld = false; };
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);
canvas.addEventListener('pointermove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/* --------------------------------- UI ---------------------------------- */
const $ = (id) => document.getElementById(id);
let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}
function refreshStageHeader() {
  if (S.inLounge) {
    $('stage-title').textContent = `👑 Admin's Lounge`;
    $('stage-sub').textContent = 'Admins only!';
    return;
  }
  if (S.inMp) {
    $('stage-title').textContent = `🌐 Multiplayer World`;
    $('stage-sub').textContent = 'Mining with friends!';
    return;
  }
  $('stage-title').textContent = `Stage ${S.stage} / 100 · ${STAGE_NAMES[S.stage - 1]}`;
  $('stage-sub').textContent = S.stage === 1 ? 'Surface flag · Stage 1 begins below'
    : S.stage === 25 ? 'Endless depths below…' : `Stage ${S.stage} begins below`;
}
function refreshUI() {
  $('stat-coins').textContent = S.coins;
  $('stat-gems').textContent = S.gems;
  $('stat-blocks').textContent = S.blocksMined;
  $('stat-pick').textContent = S.pickLevel;
  $('stat-hp').textContent = Math.ceil(S.health);
  $('health-fill').style.width = (S.health / MAX_HP * 100) + '%';
  $('health-fill').style.background = S.health > 50 ? 'var(--green)' : S.health > 25 ? 'var(--accent)' : 'var(--red)';
  $('hud-text').textContent = `Stage ${S.stage} · Depth ${S.depth} · Bag ${bagCount()}/${bagCapacity()}`;

  // backpack
  const grid = $('bag-grid'); grid.innerHTML = '';
  $('bag-count').textContent = `${bagCount()} / ${bagCapacity()} items`;
  let sellVal = 0;
  for (const ore of ORE_ORDER) {
    const n = S.backpack[ore] || 0;
    sellVal += n * (BLOCKS[ore]?.value || 0);
    const cell = document.createElement('div');
    cell.className = 'ore-cell';
    cell.innerHTML = `<div class="ore-dot" style="background:${ORE_COLORS[ore]}"></div><b>${n}</b>${(BLOCKS[ore]?.name || ore).toUpperCase()}`;
    grid.appendChild(cell);
  }
  $('sell-value').textContent = sellVal;

  // upgrades
  const ul = $('upgrade-list'); ul.innerHTML = '';
  const ups = [
    { kind: 'pick', name: 'Pickaxe', sub: `Tap power ${tapPower()}`, lvl: S.pickLevel },
    { kind: 'armor', name: 'Armor', sub: `${Math.round(armorReduction() * 100)}% lava protection`, lvl: S.armorLevel },
    { kind: 'bag', name: 'Backpack', sub: `Capacity ${bagCapacity()}`, lvl: S.bagLevel },
  ];
  for (const u of ups) {
    const row = document.createElement('div');
    row.className = 'upg-row';
    const maxed = u.lvl >= 50;
    row.innerHTML = `<div class="uinfo"><b>${u.name} <span class="muted">Lv ${u.lvl}</span></b><small>${u.sub}</small></div>`;
    const btn = document.createElement('button');
    btn.className = 'btn small' + (maxed ? '' : ' primary');
    btn.textContent = maxed ? 'MAX' : `🪙 ${upgradeCost(u.kind)}`;
    btn.disabled = maxed;
    btn.onclick = () => buyUpgrade(u.kind);
    row.appendChild(btn);
    ul.appendChild(row);
  }

  // achievements
  const al = $('ach-list'); al.innerHTML = '';
  let done = 0;
  ACHIEVEMENTS.forEach((a, i) => {
    const has = S.achievements.includes(a.id);
    if (has) done++;
    const row = document.createElement('div');
    row.className = 'ach-row' + (has ? ' done' : '');
    row.innerHTML = `<div class="ach-num">${has ? '✓' : i + 1}</div><div><b>${a.name}</b><small>${a.desc}${a.coins ? ` · +${a.coins} 🪙` : ''}</small></div>`;
    al.appendChild(row);
  });
  $('ach-count').textContent = `${done} / ${ACHIEVEMENTS.length}`;
}
async function refreshLeaderboard() {
  try {
    const { leaderboard } = await api.leaderboard();
    const el = $('leaderboard');
    if (!leaderboard.length) { el.innerHTML = '<p class="muted">No miners yet.</p>'; return; }
    el.innerHTML = '<ol>' + leaderboard.map((r) =>
      `<li><b>${escapeHtml(r.displayName)}</b> ${tagHtml({ isOwner: r.tags.owner, isAdmin: r.tags.admin, isModerator: r.tags.moderator, isDeveloper: r.tags.developer })} — 🪙 ${r.coins}</li>`
    ).join('') + '</ol>';
  } catch { /* leaderboard is best-effort */ }
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ------------------------------ save / load ---------------------------- */
let saveTimer = null;
async function saveNow(silent) {
  if (!S.user || !S.started) return;
  try {
    await api.postSave(stateToSave());
    if (!silent) toast('Progress saved!');
  } catch (e) {
    if (!silent) toast('Save failed — check connection.');
  }
}
function startAutosave() {
  clearInterval(saveTimer);
  saveTimer = setInterval(() => saveNow(true), SAVE_INTERVAL_MS);
}
window.addEventListener('pagehide', () => {
  if (!S.user || !S.started) return;
  try {
    navigator.sendBeacon('/api/save', new Blob([JSON.stringify({ save: stateToSave() })], { type: 'application/json' }));
  } catch { /* best effort */ }
});

/* ------------------------------ game loop ------------------------------ */
let lastT = 0;
function loop(t) {
  requestAnimationFrame(loop);
  if (!S.started) return;
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;
  movePlayer(dt);
  updateMining(dt);
  mpSendPos();
  // smooth camera follows player downward (and slightly horizontally)
  const targetCamY = S.py - P.h / 2 - (canvas.height / dpr / TILE) * 0.42;
  camY += (targetCamY - camY) * Math.min(1, dt * 6);
  if (S.stage === 1) camY = Math.min(camY, 2); // don't scroll far above surface... actually allow some sky
  render(t);
  // cheap per-frame HUD numbers
  $('stat-hp').textContent = Math.ceil(S.health);
  $('health-fill').style.width = (S.health / MAX_HP * 100) + '%';
}

/* ------------------------------- wiring -------------------------------- */
$('btn-sell').onclick = sellBackpack;
$('btn-spawn').onclick = () => goToSpawn(true);
document.getElementById('btn-mp').addEventListener('click', () => mpJoin());
document.getElementById('btn-solo').addEventListener('click', () => mpLeave());
document.getElementById('btn-lounge').addEventListener('click', () => {
  if (S.inLounge) loungeLeave(); else loungeJoin();
});
document.getElementById('btn-voice').addEventListener('click', () => voiceToggle());
// Touch controls: hidden on keyboard/mouse devices via CSS; show if touch is used.
const controlsEl = document.getElementById('controls');
window.addEventListener('touchstart', () => controlsEl.classList.add('force-show'), { passive: true });
window.addEventListener('keydown', (e) => {
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','a','d','w','A','D','W'].includes(e.key)) {
    controlsEl.classList.remove('force-show');
  }
});
$('btn-save').onclick = () => saveNow(false);
$('btn-signout').onclick = async () => { await saveNow(true); await api.signout(); location.reload(); };
$('btn-settings').onclick = () => {
  $('set-displayname').value = S.user.displayName;
  $('set-username').value = S.user.username;
  $('set-newpassword').value = '';
  $('set-currentpassword').value = '';
  $('settings-error').classList.add('hidden');
  $('settings-overlay').classList.remove('hidden');
};
$('btn-close-settings').onclick = () => $('settings-overlay').classList.add('hidden');
// Theme changer (light/dark), persisted in localStorage
function setTheme(dark) {
  document.body.classList.toggle('dark', dark);
  try { localStorage.setItem('mc2-theme', dark ? 'dark' : 'light'); } catch (e) {}
}
document.getElementById('theme-light').addEventListener('click', () => setTheme(false));
document.getElementById('theme-dark').addEventListener('click', () => setTheme(true));
try { if (localStorage.getItem('mc2-theme') === 'dark') document.body.classList.add('dark'); } catch (e) {}
$('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('settings-error');
  err.classList.add('hidden');
  try {
    const { user } = await api.updateAccount({
      displayName: $('set-displayname').value.trim(),
      username: $('set-username').value.trim(),
      newPassword: $('set-newpassword').value || undefined,
      currentPassword: $('set-currentpassword').value,
    });
    S.user = user;
    updatePlayerTag();
    $('settings-overlay').classList.add('hidden');
    toast('Account updated!');
    refreshLeaderboard();
  } catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); }
});

// admin buttons
document.querySelectorAll('[data-admin]').forEach((btn) => {
  btn.onclick = async () => {
    const cmd = btn.dataset.admin;
    if (cmd === 'wipe') {
      if (!confirm('Delete ALL accounts and all saved progress? This cannot be undone.')) return;
      if (!confirm('Really wipe everything? You will be signed out.')) return;
      try { await api.admin('wipe', {}); } catch (ex) { toast(ex.message); return; }
      location.reload();
      return;
    }
    try {
      const extra = cmd === 'coins' ? { amount: 1000000 }
        : cmd === 'gems' ? { amount: 100 }
        : cmd === 'upgrades' ? { pick: 50, armor: 50, bag: 50 } : {};
      const { save } = await api.admin(cmd, extra);
      loadSave(save);
      refreshStageHeader(); refreshUI(); refreshGodBtn();
      toast('Admin power used!');
    } catch (ex) { toast(ex.message); }
  };
});
// Ban / unban accounts
document.getElementById('ban-btn').addEventListener('click', () => banUser(true));
document.getElementById('unban-btn').addEventListener('click', () => banUser(false));
async function banUser(ban) {
  const target = document.getElementById('ban-input').value.trim();
  if (!target) { toast('Enter a username.'); return; }
  if (!confirm(`${ban ? 'Ban' : 'Unban'} "${target}"?`)) return;
  try {
    const r = await api.admin(ban ? 'ban' : 'unban', { target });
    toast(r.banned ? `Banned ${r.username}.` : `Unbanned ${r.username}.`);
    document.getElementById('ban-input').value = '';
  } catch (ex) { toast(ex.message); }
}
// Global broadcast message
document.getElementById('broadcast-btn').addEventListener('click', async () => {
  const message = document.getElementById('broadcast-input').value.trim();
  try {
    await api.admin('broadcast', { message });
    document.getElementById('broadcast-input').value = '';
    toast(message ? 'Broadcast sent!' : 'Broadcast cleared.');
    checkBroadcast();
  } catch (ex) { toast(ex.message); }
});
// Gift coins/gems to a friend (admin)
document.getElementById('gift-btn').addEventListener('click', async () => {
  const target = document.getElementById('gift-input').value.trim();
  const coins = Math.max(0, Math.floor(Number(document.getElementById('gift-coins').value) || 0));
  const gems = Math.max(0, Math.floor(Number(document.getElementById('gift-gems').value) || 0));
  if (!target) { toast('Enter a username.'); return; }
  if (!coins && !gems) { toast('Enter an amount.'); return; }
  if (!confirm(`Gift ${coins} 🪙 and ${gems} 💎 to "${target}"?`)) return;
  try {
    const r = await api.admin('gift', { target, coins, gems });
    toast(`Gifted ${r.coins} 🪙 + ${r.gems} 💎 to ${r.username}!`);
    document.getElementById('gift-input').value = '';
    document.getElementById('gift-coins').value = '';
    document.getElementById('gift-gems').value = '';
  } catch (ex) { toast(ex.message); }
});
// Reset a player's progress (admin)
async function resetProgress(target, isSelf) {
  if (!target && !isSelf) { toast('Enter a username.'); return; }
  const label = isSelf ? 'your own' : `"${target}"'s`;
  if (!confirm(`Reset ${label} progress? Coins, gems, upgrades, achievements — everything. Cannot be undone.`)) return;
  if (!confirm(`Really wipe ${label} progress?`)) return;
  try {
    const r = await api.admin('reset', { target: isSelf ? S.user.username : target });
    toast(`Reset ${r.username}'s progress.`);
    if (r.self) location.reload(); // re-login with fresh save
    else document.getElementById('reset-input').value = '';
  } catch (ex) { toast(ex.message); }
}
document.getElementById('reset-btn').addEventListener('click', () => {
  resetProgress(document.getElementById('reset-input').value.trim(), false);
});
document.getElementById('reset-self-btn').addEventListener('click', () => {
  resetProgress(null, true);
});
// Gift/remove tags (admin/moderator/developer — owner is exclusive)
async function changeTag(grant) {
  const target = document.getElementById('tag-input').value.trim();
  const tag = document.getElementById('tag-select').value;
  if (!target) { toast('Enter a username.'); return; }
  const action = grant ? 'GIVE' : 'REMOVE';
  if (!confirm(`${action} the ${tag.toUpperCase()} tag ${grant ? 'to' : 'from'} "${target}"?`)) return;
  try {
    const r = await api.admin('tag', { target, tag, grant });
    toast(r.granted ? `Gave ${r.tag} tag to ${r.username}!` : `Removed ${r.tag} tag from ${r.username}.`);
    document.getElementById('tag-input').value = '';
  } catch (ex) { toast(ex.message); }
}
document.getElementById('tag-grant-btn').addEventListener('click', () => changeTag(true));
document.getElementById('tag-revoke-btn').addEventListener('click', () => changeTag(false));
async function checkBroadcast() {
  try {
    const r = await fetch('/api/broadcast').then((x) => x.json());
    const bar = document.getElementById('broadcast-bar');
    if (r.message) {
      document.getElementById('broadcast-text').textContent = r.message;
      bar.classList.remove('hidden');
    } else {
      bar.classList.add('hidden');
    }
  } catch (e) { /* ignore */ }
}
setInterval(checkBroadcast, 60000);
function refreshGodBtn() {
  const b = document.querySelector('[data-admin="god"]');
  if (b) b.textContent = S.god ? '😇 God: ON' : '😇 God mode';
}

function tagHtml(u) {
  let h = '';
  if (u.isOwner) h += '<span class="tag owner">👑 OWNER</span> ';
  if (u.isAdmin) h += '<span class="tag dev">🛠️ ADMIN</span> ';
  if (u.isModerator) h += '<span class="tag mod">🛡️ MODERATOR</span> ';
  if (u.isDeveloper) h += '<span class="tag coder">💻 DEVELOPER</span>';
  return h.trim();
}
function updatePlayerTag() {
  const tag = $('player-tag');
  if (S.user && (S.user.isOwner || S.user.isAdmin || S.user.isModerator || S.user.isDeveloper)) {
    tag.innerHTML = tagHtml(S.user);
    tag.classList.remove('hidden');
  } else {
    tag.classList.add('hidden');
  }
  const hasTag = S.user && (S.user.isOwner || S.user.isAdmin || S.user.isModerator || S.user.isDeveloper);
  if (hasTag) {
    document.getElementById('ctl-admin').classList.remove('hidden');
    document.getElementById('btn-lounge').classList.remove('hidden');
  } else {
    document.getElementById('ctl-admin').classList.add('hidden');
    document.getElementById('btn-lounge').classList.add('hidden');
    $('admin-panel').classList.add('hidden');
  }
  // Tag gifting UI is owner-only
  const canGive = S.user && S.user.canGiveTags;
  document.querySelectorAll('.tag-admin-row').forEach((el) => {
    el.classList.toggle('hidden', !canGive);
  });
}

/* ------------------------------ multiplayer ---------------------------- */
const MP = { ws: null, id: null, players: new Map(), lastPos: 0, cleared: new Set(), soloStage: 1, soloX: 10.5, soloY: -0.5 };
// Admin lounge — separate world (stage 1002) for admins only
function loungeJoin() {
  if (S.inLounge) return;
  if (!S.user || !(S.user.isAdmin || S.user.isModerator || S.user.isDeveloper || S.user.isOwner)) {
    toast('Admins only!');
    return;
  }
  if (S.inMp) mpLeave();
  // Remember solo position
  MP.soloStage = S.stage; MP.soloX = S.px; MP.soloY = S.py;
  S.inLounge = true;
  S.stage = LOUNGE_STAGE;
  S.px = 10.5; S.py = -0.5; S.vx = 0; S.vy = 0;
  S.dmg.clear();
  refreshStageHeader(); refreshUI();
  toast('🛋️ Welcome to the admin lounge!');
  document.getElementById('btn-voice').classList.remove('hidden');
}
function loungeLeave() {
  if (!S.inLounge) return;
  voiceLeave();
  S.inLounge = false;
  S.stage = MP.soloStage; S.px = MP.soloX; S.py = MP.soloY;
  S.vx = 0; S.vy = 0; S.dmg.clear();
  refreshStageHeader(); refreshUI();
  toast('Left the lounge.');
  document.getElementById('btn-voice').classList.add('hidden');
}
function mpJoin() {
  if (S.inMp) return;
  if (S.inLounge) loungeLeave();
  // Remember solo position
  MP.soloStage = S.stage; MP.soloX = S.px; MP.soloY = S.py;
  S.inMp = true;
  S.stage = MP_STAGE; // multiplayer world
  S.px = 10.5; S.py = -0.5; S.vx = 0; S.vy = 0;
  S.dmg.clear();
  refreshStageHeader(); refreshUI();
  toast('🌐 Joined multiplayer world!');
}
function mpLeave() {
  if (!S.inMp) return;
  S.inMp = false;
  S.stage = MP.soloStage; S.px = MP.soloX; S.py = MP.soloY;
  S.vx = 0; S.vy = 0; S.dmg.clear();
  refreshStageHeader(); refreshUI();
  toast('Back to solo.');
}
function mpConnect() {
  if (MP.ws) { try { MP.ws.close(); } catch (e) {} }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(proto + '//' + location.host + '/ws');
  MP.ws = ws;
  ws.onopen = () => console.log('[mp] connected');
  ws.onclose = () => {
    console.log('[mp] disconnected, retrying in 5s');
    setTimeout(() => { if (S.started) mpConnect(); }, 5000);
  };
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.t === 'welcome') {
      MP.id = msg.id;
      MP.players.clear();
      for (const p of msg.players) MP.players.set(p.id, p);
      updateMpCount();
    } else if (msg.t === 'join') {
      MP.players.set(msg.player.id, msg.player);
      toast(`🟢 ${msg.player.displayName} joined!`);
      updateMpCount();
    } else if (msg.t === 'leave') {
      MP.players.delete(msg.id);
      updateMpCount();
    } else if (msg.t === 'pos') {
      const p = MP.players.get(msg.id);
      if (p) { p.x = msg.x; p.y = msg.y; p.stage = msg.stage; }
    } else if (msg.t === 'break') {
      // Someone else broke a block in multiplayer/lounge — remove it locally (no loot)
      if ((msg.stage === MP_STAGE || msg.stage === LOUNGE_STAGE) && (S.inMp || S.inLounge)) {
        MP.cleared.add(msg.stage + ':' + msg.x + ':' + msg.y);
      }
    } else if (msg.t === 'voice-join' || msg.t === 'voice-offer' || msg.t === 'voice-answer' || msg.t === 'voice-ice' || msg.t === 'voice-leave') {
      msg.from = msg.from || msg.id;
      voiceHandle(msg);
    }
  };
}
function mpSendPos() {
  if (!MP.ws || MP.ws.readyState !== 1 || (!S.inMp && !S.inLounge)) return;
  const now = performance.now();
  if (now - MP.lastPos < 100) return; // 10 updates/sec max
  MP.lastPos = now;
  MP.ws.send(JSON.stringify({ t: 'pos', x: S.px, y: S.py, stage: S.stage }));
}
function updateMpCount() {
  const el = document.getElementById('mp-count');
  if (el) el.textContent = MP.players.size + 1;
}
// Draw other players (multiplayer/lounge only)
function drawMpPlayers() {
  if (!S.inMp && !S.inLounge) return;
  const myStage = S.inLounge ? LOUNGE_STAGE : MP_STAGE;
  for (const p of MP.players.values()) {
    if (p.stage !== myStage) continue;
    const sx = (p.x - camX) * TILE, sy = (p.y - camY) * TILE;
    if (sx < -50 || sy < -50 || sx > W + 50 || sy > H + 50) continue;
    // Simple cat: orange body with name
    ctx.fillStyle = '#e8a33d';
    ctx.beginPath();
    ctx.arc(sx, sy - TILE * 0.3, TILE * 0.28, 0, Math.PI * 2);
    ctx.fill();
    // Ears
    ctx.fillStyle = '#e8a33d';
    ctx.beginPath();
    ctx.moveTo(sx - TILE * 0.22, sy - TILE * 0.5);
    ctx.lineTo(sx - TILE * 0.12, sy - TILE * 0.72);
    ctx.lineTo(sx - TILE * 0.02, sy - TILE * 0.5);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sx + TILE * 0.02, sy - TILE * 0.5);
    ctx.lineTo(sx + TILE * 0.12, sy - TILE * 0.72);
    ctx.lineTo(sx + TILE * 0.22, sy - TILE * 0.5);
    ctx.fill();
    // Name
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(10, TILE * 0.28)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(p.displayName, sx, sy - TILE * 0.85);
  }
}

/* ------------------------------ voice chat ---------------------------- */
const Voice = { on: false, stream: null, peers: new Map(), audioEls: new Map() };
async function voiceToggle() {
  if (Voice.on) { voiceLeave(); return; }
  if (!S.inLounge) { toast('Join the lounge first!'); return; }
  try {
    Voice.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    toast('Microphone blocked.');
    return;
  }
  Voice.on = true;
  document.getElementById('btn-voice').textContent = '🔴 Mute';
  // Tell others we're on voice
  if (MP.ws && MP.ws.readyState === 1) MP.ws.send(JSON.stringify({ t: 'voice-join' }));
  toast('🎤 Voice on!');
}
function voiceLeave() {
  if (!Voice.on) return;
  Voice.on = false;
  if (MP.ws && MP.ws.readyState === 1) MP.ws.send(JSON.stringify({ t: 'voice-leave' }));
  for (const [id, pc] of Voice.peers) { try { pc.close(); } catch (e) {} }
  Voice.peers.clear();
  for (const [id, el] of Voice.audioEls) { try { el.remove(); } catch (e) {} }
  Voice.audioEls.clear();
  if (Voice.stream) { Voice.stream.getTracks().forEach((t) => t.stop()); Voice.stream = null; }
  const vb = document.getElementById('btn-voice');
  if (vb) vb.textContent = '🎤 Voice';
}
function voiceGetPeer(id, createOffer) {
  if (Voice.peers.has(id)) return Voice.peers.get(id);
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  Voice.peers.set(id, pc);
  if (Voice.stream) Voice.stream.getTracks().forEach((t) => pc.addTrack(t, Voice.stream));
  pc.onicecandidate = (e) => {
    if (e.candidate && MP.ws && MP.ws.readyState === 1) {
      MP.ws.send(JSON.stringify({ t: 'voice-ice', to: id, candidate: e.candidate }));
    }
  };
  pc.ontrack = (e) => {
    let el = Voice.audioEls.get(id);
    if (!el) {
      el = document.createElement('audio');
      el.autoplay = true;
      document.body.appendChild(el);
      Voice.audioEls.set(id, el);
    }
    el.srcObject = e.streams[0];
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      try { pc.close(); } catch (e) {}
      Voice.peers.delete(id);
      const el = Voice.audioEls.get(id);
      if (el) { el.remove(); Voice.audioEls.delete(id); }
    }
  };
  if (createOffer) {
    pc.createOffer().then((offer) => pc.setLocalDescription(offer)).then(() => {
      if (MP.ws && MP.ws.readyState === 1) {
        MP.ws.send(JSON.stringify({ t: 'voice-offer', to: id, offer: pc.localDescription }));
      }
    }).catch(() => {});
  }
  return pc;
}
async function voiceHandle(msg) {
  if (!Voice.on) return;
  const from = msg.from;
  if (msg.t === 'voice-join') {
    // New voice user — we initiate the offer
    voiceGetPeer(from, true);
  } else if (msg.t === 'voice-offer') {
    const pc = voiceGetPeer(from, false);
    await pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    if (MP.ws && MP.ws.readyState === 1) {
      MP.ws.send(JSON.stringify({ t: 'voice-answer', to: from, answer: pc.localDescription }));
    }
  } else if (msg.t === 'voice-answer') {
    const pc = Voice.peers.get(from);
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(msg.answer)).catch(() => {});
  } else if (msg.t === 'voice-ice') {
    const pc = Voice.peers.get(from);
    if (pc) await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
  } else if (msg.t === 'voice-leave') {
    const pc = Voice.peers.get(from);
    if (pc) { try { pc.close(); } catch (e) {} Voice.peers.delete(from); }
    const el = Voice.audioEls.get(from);
    if (el) { el.remove(); Voice.audioEls.delete(from); }
  }
}
function setAuthMode(mode) {
  authMode = mode;
  $('tab-signup').classList.toggle('active', mode === 'signup');
  $('tab-signin').classList.toggle('active', mode === 'signin');
  $('field-displayname').style.display = mode === 'signup' ? '' : 'none';
  $('auth-submit').textContent = mode === 'signup' ? 'Create & play' : 'Sign in & play';
  $('auth-error').classList.add('hidden');
}
$('tab-signup').onclick = () => setAuthMode('signup');
$('tab-signin').onclick = () => setAuthMode('signin');

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('auth-error');
  err.classList.add('hidden');
  const username = $('auth-username').value.trim();
  const password = $('auth-password').value;
  try {
    const { user } = authMode === 'signup'
      ? await api.signup(username, password, $('auth-displayname').value.trim())
      : await api.signin(username, password);
    S.user = user;
    await startGame();
  } catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); }
});

async function startGame() {
  $('auth-overlay').classList.add('hidden');
  $('game-root').classList.remove('hidden');
  try {
    const { save } = await api.getSave();
    loadSave(save);
    toast('Save loaded — welcome back!');
  } catch {
    loadSave({}); // fresh game
  }
  updatePlayerTag(); refreshGodBtn();
  refreshStageHeader();
  refreshUI();
  refreshLeaderboard();
  setInterval(refreshLeaderboard, 60000);
  checkBroadcast();
  resize();
  startAutosave();
  S.started = true;
  mpConnect();
  requestAnimationFrame(loop);
}

(async function boot() {
  resize();
  setAuthMode('signup');
  try {
    const { user } = await api.me();
    S.user = user;
    await startGame();
  } catch {
    $('auth-overlay').classList.remove('hidden'); // not signed in -> show auth
  }
})();
