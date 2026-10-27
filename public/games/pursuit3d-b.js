// ============================== MULTIPLAYER ==============================
let mpWs = null, mpOn = false, mpSendT = 0;
const remotes = new Map();
function tagPrefix(tags) {
  if (!tags) return '';
  return (tags.owner ? '👑' : '') + (tags.admin ? '🛠️' : '') + (tags.moderator ? '🛡️' : '') + (tags.developer ? '💻' : '');
}
function makeNameSprite(name, tags, cop) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 56;
  const c = cv.getContext('2d');
  c.font = 'bold 25px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const label = (cop ? '🚓 ' : '') + (tagPrefix(tags) ? tagPrefix(tags) + ' ' : '') + name;
  c.lineWidth = 6; c.strokeStyle = 'rgba(0,0,0,.85)'; c.strokeText(label, 128, 28);
  c.fillStyle = '#fff'; c.fillText(label, 128, 28);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
  spr.scale.set(6.6, 1.45, 1);
  return spr;
}
function spawnRemote(id, displayName, tags) {
  let r = remotes.get(id);
  if (r) return r;
  const group = new THREE.Group();
  const carMesh = makeCarMesh(0x3b82f6, { premium: true });
  const pedMesh = makePedMesh(0x2563eb, 0x1f2937);
  const nameSpr = makeNameSprite(displayName || 'Player', tags);
  group.add(carMesh); group.add(pedMesh); group.add(nameSpr);
  scene.add(group);
  r = { id, group, carMesh, pedMesh, nameSpr, displayName: displayName || 'Player', tags: tags || {}, copRole: false, builtColor: null, builtCop: null, espd: 0, pinT: 0, mode: 'drive', tx: 0, ty: 0, tz: 0, ta: 0, gx: 0, gy: 0, gz: 0, ga: 0, px: 0, pz: 0, color: null, phase: 0, mv: 0, hideName: false, seen: false };
  remotes.set(id, r);
  return r;
}
function removeRemote(id) {
  const r = remotes.get(id);
  if (!r) return;
  scene.remove(r.group);
  remotes.delete(id);
}
function setRemoteState(r, st) {
  if (!st) return;
  r.mode = st.mode === 'foot' ? 'foot' : 'drive';
  r.tx = +st.x || 0; r.ty = +st.y || 0; r.tz = +st.z || 0; r.ta = +st.a || 0; r.mv = st.mv ? 1 : 0; r.hideName = !!st.hide;
  if (!r.seen) { r.gx = r.tx; r.gy = r.ty; r.gz = r.tz; r.ga = r.ta; r.px = r.gx; r.pz = r.gz; r.seen = true; }
  if (st.c) r.color = st.c;
  const copNow = !!st.cop;
  if (r.mode === 'drive' && (r.builtColor !== r.color || r.builtCop !== copNow)) {
    r.builtColor = r.color; r.builtCop = copNow;
    const nm = makeCarMesh(copNow ? 0x1f2937 : (r.color || 0x3b82f6), { premium: true, cop: copNow });
    r.group.remove(r.carMesh); r.carMesh = nm; r.group.add(nm);
  }
  if (copNow !== r.copRole) {
    r.copRole = copNow;
    const ns = makeNameSprite(r.displayName, r.tags, copNow);
    ns.position.y = r.nameSpr.position.y;
    r.group.remove(r.nameSpr); r.nameSpr = ns; r.group.add(ns);
  }
}
function updateRemotes(dt) {
  if (!remotes.size) return;
  const k = 1 - Math.exp(-11 * dt);
  for (const r of remotes.values()) {
    r.gx += (r.tx - r.gx) * k; r.gy += (r.ty - r.gy) * k; r.gz += (r.tz - r.gz) * k;
    r.ga += wrapA(r.ta - r.ga) * k;
    r.group.position.set(r.gx, r.gy, r.gz);
    const driving = r.mode === 'drive';
    r.carMesh.visible = driving; r.pedMesh.visible = !driving;
    r.carMesh.rotation.y = r.ga;
    r.pedMesh.rotation.y = r.ga;
    r.nameSpr.position.y = driving ? 2.55 : 2.35;
    r.nameSpr.visible = !hideName && !r.hideName;
    if (!driving) {
      if (r.mv) r.phase += dt * 9;
      r.espd = 0;
      animatePerson(r.pedMesh, r.phase, r.mv ? 1 : 0.15);
    } else if (r.carMesh.userData.wheels) {
      const wspd = Math.hypot(r.gx - r.px, r.gz - r.pz) / Math.max(dt, 0.001);
      r.espd = wspd;
      for (const w of r.carMesh.userData.wheels) w.rotation.x += wspd * dt / 0.37;
    }
    if (driving && r.copRole && r.carMesh.userData.red) {
      const ph = Math.floor(performance.now() / 160) % 2 === 0;
      r.carMesh.userData.red.material.color.setHex(ph ? 0xff2222 : 0x551111);
      r.carMesh.userData.blue.material.color.setHex(ph ? 0x112255 : 0x2266ff);
    }
    // if I'm a player cop holding this robber still, I'm busting them
    if (state === 'play' && mode === 'drive' && playerCar && playerCar.isCop && driving && !r.copRole) {
      const ppp = playerCar.mesh.position;
      const dd = Math.hypot(r.gx - ppp.x, r.gz - ppp.z);
      if (dd < 7 && r.espd < 3 && Math.abs(r.gy - ppp.y) < 3.5) {
        r.pinT += dt;
        if (r.pinT > 0.4 && r.pinT <= 0.4 + dt) flashSmall('🚔 Busting ' + r.displayName + ' — keep them pinned!');
      } else r.pinT = Math.max(0, r.pinT - dt * 2);
    } else r.pinT = Math.max(0, r.pinT - dt * 2);
    r.px = r.gx; r.pz = r.gz;
    // bump into remote players' cars instead of driving through them
    if (driving && mode === 'drive' && playerCar && state === 'play') {
      const pp = playerCar.mesh.position;
      const dx = pp.x - r.gx, dz = pp.z - r.gz, d2 = dx * dx + dz * dz;
      if (d2 < 2.3 * 2.3 && d2 > 0.0001 && Math.abs(pp.y - r.gy) < 3) {
        const d = Math.sqrt(d2), push = 2.3 - d;
        pp.x += dx / d * push; pp.z += dz / d * push;
        const vn = playerCar.vx * (dx / d) + playerCar.vz * (dz / d);
        if (vn < 0) { playerCar.vx -= vn * (dx / d); playerCar.vz -= vn * (dz / d); }
      }
    }
  }
}
function mpUi() {
  $('mpBtn').textContent = mpOn ? '🌐 Multiplayer: ON (' + (remotes.size + 1) + ' in the city) — tap to leave' : '🌐 Multiplayer: OFF';
  $('mpBtn').style.background = mpOn ? '#16a34a' : '#2563eb';
}
function mpEvent(kind) {
  if (mpOn && mpWs && mpWs.readyState === 1) { try { mpWs.send(JSON.stringify({ t: 'pevent', kind })); } catch (e) {} }
}
function mpTick(dt) {
  if (!mpOn || !mpWs || mpWs.readyState !== 1) return;
  mpSendT -= dt;
  if (mpSendT > 0) return;
  mpSendT = 0.09;
  let st = null;
  if (mode === 'drive' && playerCar) {
    const pp = playerCar.mesh.position;
    st = { t: 'ppos', mode: 'drive', x: +pp.x.toFixed(2), y: +pp.y.toFixed(2), z: +pp.z.toFixed(2), a: +playerCar.angle.toFixed(3), c: playerCar.colorHex || 0xe11d48, mv: 0, cop: playerCar.isCop ? 1 : 0, hide: hideName ? 1 : 0 };
  } else if (char) {
    const pp = char.position;
    st = { t: 'ppos', mode: 'foot', x: +pp.x.toFixed(2), y: +pp.y.toFixed(2), z: +pp.z.toFixed(2), a: +charAngle.toFixed(3), c: 0, mv: charBlend > 0.15 ? 1 : 0, hide: hideName ? 1 : 0 };
  }
  if (st) { try { mpWs.send(JSON.stringify(st)); } catch (e) {} }
}
function mpConnect() {
  if (mpWs) { try { mpWs.close(); } catch (e) {} return; }
  $('mpBtn').textContent = '🌐 Connecting…';
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(proto + '//' + location.host + '/ws?game=pursuit');
  mpWs = ws;
  ws.onmessage = ev => {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.t === 'pwelcome') {
      mpOn = true;
      for (const pl of m.players) { const r = spawnRemote(pl.id, pl.displayName, pl.tags); if (pl.state) setRemoteState(r, pl.state); }
      mpUi();
      flash('🌐 Multiplayer ON — ' + (m.players.length + 1) + ' in the city');
    } else if (m.t === 'pjoin') {
      const r = spawnRemote(m.player.id, m.player.displayName, m.player.tags);
      if (m.player.state) setRemoteState(r, m.player.state);
      flash('🌐 ' + m.player.displayName + ' joined the city');
      mpUi();
    } else if (m.t === 'ppos') {
      let r = remotes.get(m.id);
      if (!r) r = spawnRemote(m.id, m.displayName, m.tags);
      setRemoteState(r, m);
    } else if (m.t === 'pleave') {
      removeRemote(m.id);
      flash('👋 A player left the city');
      mpUi();
    } else if (m.t === 'pevent') {
      if (m.kind === 'busted') {
        const rr = remotes.get(m.id);
        if (rr && rr.pinT > 0.25 && playerCar && playerCar.isCop) { cash += 300; flash('🚔 YOUR BUST! ' + m.displayName + ' is going downtown +$300'); }
        else flash('🚔 ' + m.displayName + ' got BUSTED!');
      } else flash('💥 ' + m.displayName + ' got WASTED!');
    }
  };
  ws.onclose = ev => {
    if (mpWs === ws) mpWs = null;
    mpOn = false;
    for (const id of [...remotes.keys()]) removeRemote(id);
    mpUi();
    if (ev.code === 4001) $('msg').textContent = '🌐 Multiplayer needs an account — sign in on the Arqade home page first, then tap Multiplayer again.';
  };
  ws.onerror = () => { try { ws.close(); } catch (e) {} };
}
// ============================== GARAGE / CHANGE CAR ==============================
const GARAGE = [
  { name: '🔴 Street Racer', color: 0xe11d48, opts: { premium: true, spoiler: true }, power: 1.04 },
  { name: '🔵 Midnight', color: 0x2563eb, opts: { premium: true }, power: 1.04 },
  { name: '🟢 Viper', color: 0x16a34a, opts: { premium: true, spoiler: true }, power: 1.06 },
  { name: '🟣 Purple Haze', color: 0x9333ea, opts: { premium: true }, power: 1.04 },
  { name: '🟠 Sunset', color: 0xea580c, opts: { premium: true, spoiler: true }, power: 1.05 },
  { name: '⚫ Blackout', color: 0x111318, opts: { premium: true }, power: 1.07 },
  { name: '🟡 Taxi', color: 0xfacc15, opts: { taxi: true }, power: 1.0 },
  { name: '🚓 POLICE', color: 0x1f2937, opts: { premium: true, cop: true }, power: 1.13, cop: true },
];
let garageIdx = 0;
try { garageIdx = Math.min(GARAGE.length - 1, Math.max(0, parseInt(localStorage.getItem('cp_garage') || '0', 10) || 0)); } catch (e) {}
function applyRole() {
  if (playerCar && playerCar.isCop) { heat = 0; wanted = 0; health = 100; }
}
function carUi() { $('carBtn').textContent = '🚗 Car: ' + GARAGE[garageIdx].name; }
function changeCar() {
  garageIdx = (garageIdx + 1) % GARAGE.length;
  try { localStorage.setItem('cp_garage', String(garageIdx)); } catch (e) {}
  const spec = GARAGE[garageIdx];
  carUi();
  if (playerCar) {
    const old = playerCar.mesh;
    const nm = makeCarMesh(spec.color, spec.opts);
    nm.position.copy(old.position);
    nm.rotation.copy(old.rotation);
    scene.remove(old); scene.add(nm);
    playerCar.mesh = nm;
    playerCar.colorHex = spec.color;
    playerCar.isCop = !!spec.cop;
    playerCar.power = spec.power;
    playerCar.topSpd = spec.cop ? VMAX_COP : VMAX_REG;
    applyRole();
    mpSendT = 0;
  }
  flash(spec.cop ? '🚓 ON DUTY! Infinite health — AI cops are friendly, go bust your friends!' : '🚗 New ride: ' + spec.name);
}
$('carBtn').onclick = changeCar;
carUi();

let hideName = false;
try { hideName = localStorage.getItem('cp_hidename') === '1'; } catch (e) {}
function tagUi() {
  $('tagBtn').textContent = hideName ? '🏷️ Name Tags: OFF' : '🏷️ Name Tags: ON';
  $('tagBtn').style.background = hideName ? '#6b7280' : '#2563eb';
}
$('tagBtn').onclick = () => {
  hideName = !hideName;
  try { localStorage.setItem('cp_hidename', hideName ? '1' : '0'); } catch (e) {}
  tagUi();
  mpSendT = 0; // tell the room right away
  flash(hideName ? '🏷️ Stealth ON — your name tag AND map dot are hidden from everyone' : '🏷️ Name tags shown');
};
tagUi();
$('mpBtn').onclick = mpConnect;

// ============================== FULLSCREEN MAP ==============================
let bigMapOn = false;
function toggleMap(force) {
  bigMapOn = force !== undefined ? !!force : !bigMapOn;
  $('bigMapWrap').classList.toggle('on', bigMapOn);
  $('mapBtn').textContent = bigMapOn ? '🗺️ Close Map' : '🗺️ Full Map';
}
$('mapBtn').onclick = () => toggleMap();
$('bigMapWrap').onclick = () => toggleMap(false);
$('minimapWrap').addEventListener('click', () => toggleMap(true));
const bm = $('bigMap').getContext('2d');
function drawBigMap() {
  const S = 920 / 780, cx = 460, cy = 460, now = performance.now();
  bm.fillStyle = '#17351a'; bm.fillRect(0, 0, 920, 920); // countryside
  bm.fillStyle = '#2a2e36'; bm.fillRect(cx - CITY * S, cy - CITY * S, CITY * 2 * S, CITY * 2 * S); // city ground
  bm.fillStyle = '#1e4620'; bm.fillRect(cx + 8 * S, cy + 8 * S, 56 * S, 56 * S); // park
  bm.fillStyle = '#4b5563'; // roads
  for (let k = -GRID; k <= GRID; k++) {
    bm.fillRect(cx + (roadCoord(k) - ROAD_W / 2) * S, cy - CITY * S, ROAD_W * S, CITY * 2 * S);
    bm.fillRect(cx - CITY * S, cy + (roadCoord(k) - ROAD_W / 2) * S, CITY * 2 * S, ROAD_W * S);
  }
  bm.fillStyle = '#3f4a5a'; bm.fillRect(cx + 80 * S, cy + 8 * S, 56 * S, 56 * S); // underground garage block
  bm.fillStyle = '#5b4a2f'; bm.fillRect(cx - 64 * S, cy + 8 * S, 56 * S, 56 * S); // parking garage block
  const blk = (bx, bz, col) => { bm.fillStyle = col; bm.fillRect(cx + (bx - 28) * S, cy + (bz - 28) * S, 56 * S, 56 * S); };
  for (const [bx, bz] of [[180, 180], [-180, -108], [252, -180], [-108, 252]]) blk(bx, bz, '#1e4620');
  for (const [bx, bz] of [[180, -36], [252, -36], [-180, 108], [-252, 108]]) blk(bx, bz, '#4a4232');
  blk(108, 180, '#7c2d12'); blk(-108, -180, '#7c2d12');
  blk(36, -108, '#1e3a8a'); blk(252, 36, '#1e3a8a'); blk(-180, 180, '#1e3a8a');
  bm.fillStyle = '#fff'; bm.font = 'bold 17px sans-serif'; bm.textAlign = 'center';
  bm.fillText('🌳 PARK', cx + 36 * S, cy + 40 * S);
  bm.fillText('🅿️ GARAGE ↓', cx + 108 * S, cy + 40 * S);
  bm.fillText('🅿️ PARKING', cx - 36 * S, cy + 40 * S);
  bm.font = 'bold 15px sans-serif';
  bm.fillText('🔧 SHOP', cx + 108 * S, cy + 184 * S);
  bm.fillText('🔧 SHOP', cx - 108 * S, cy - 176 * S);
  bm.fillText('🚔 POLICE', cx + 36 * S, cy - 104 * S);
  bm.fillText('🚔 POLICE', cx + 252 * S, cy + 40 * S);
  bm.fillText('🚔 POLICE', cx - 180 * S, cy + 184 * S);
  bm.fillText('🏠 HOODS', cx + 216 * S, cy - 32 * S);
  bm.fillText('🏠 HOODS', cx - 216 * S, cy + 112 * S);
  const dot = (x, z, col, r) => { bm.fillStyle = col; bm.beginPath(); bm.arc(cx + x * S, cy + z * S, r, 0, 7); bm.fill(); };
  const flashRB = Math.floor(now / 280) % 2 ? '#ef4444' : '#3b82f6';
  for (const c of cars) {
    if (c === playerCar && mode === 'drive') continue;
    if (c.kind === 'cop') dot(c.mesh.position.x, c.mesh.position.z, flashRB, 5);
    else dot(c.mesh.position.x, c.mesh.position.z, '#9ca3af', 3.5);
  }
  if (heli) dot(heliSpot.x, heliSpot.z, '#facc15', 5);
  for (const r of remotes.values()) {
    if (r.hideName) continue; // stealth stays stealthy here too
    dot(r.gx, r.gz, r.copRole ? flashRB : '#22d3ee', 6);
  }
  // you-are-here arrow
  const anchor = mode === 'drive' && playerCar ? playerCar.mesh.position : char.position;
  const ang = mode === 'drive' && playerCar ? playerCar.angle : charAngle;
  const px = cx + anchor.x * S, py = cy + anchor.z * S;
  const a2 = Math.atan2(-Math.cos(ang), -Math.sin(ang));
  bm.save(); bm.translate(px, py); bm.rotate(a2);
  bm.fillStyle = '#fff'; bm.strokeStyle = '#000'; bm.lineWidth = 2;
  bm.beginPath(); bm.moveTo(11, 0); bm.lineTo(-8, -7); bm.lineTo(-8, 7); bm.closePath(); bm.fill(); bm.stroke();
  bm.restore();
  bm.fillStyle = 'rgba(255,255,255,.85)'; bm.font = 'bold 22px sans-serif'; bm.fillText('N', cx, 28);
  bm.font = '15px sans-serif'; bm.fillText('tap the map or press M to close', cx, 920 - 16);
}

const phys = {};
function syncKeys() {
  keys.w = !!phys.KeyW; keys.up = !!phys.ArrowUp;
  keys.s = !!phys.KeyS; keys.down = !!phys.ArrowDown;
  keys.a = !!phys.KeyA; keys.left = !!phys.ArrowLeft;
  keys.d = !!phys.KeyD; keys.right = !!phys.ArrowRight;
  keys[' '] = !!phys.Space;
  keys.shift = !!(phys.ShiftLeft || phys.ShiftRight);
}
addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  phys[e.code] = true; syncKeys();
  if (e.code === 'KeyF' && state === 'play') { if (mode === 'drive') exitCar(); else enterCar(); }
  if (e.code === 'KeyM') toggleMap();
  if ((e.code === 'Space' || e.code === 'Enter') && state !== 'play') start();
});
addEventListener('keyup', e => { phys[e.code] = false; syncKeys(); });
addEventListener('blur', () => { for (const c in phys) phys[c] = false; syncKeys(); });
const tch = {};
const ptrBtn = new Map(); // pointerId -> {flag, id}: every finger currently down, tracked at window level
const btnFlag = new Map(); // button element id -> flag name
let tchSteerT = 0, tchSteerDir = 0;
function refreshTch() {
  for (const f of ['left', 'right', 'up', 'down', 'drift', 'run']) tch[f] = false;
  for (const v of ptrBtn.values()) tch[v.flag] = true;
  for (const [id] of btnFlag) {
    const el = $(id);
    if (!el) continue;
    let on = false;
    for (const v of ptrBtn.values()) if (v.id === id) { on = true; break; }
    el.classList.toggle('on', on);
  }
}
function hold(id, name) {
  btnFlag.set(id, name);
  $(id).addEventListener('pointerdown', e => {
    e.preventDefault();
    if (state !== 'play') start();
  });
}
window.addEventListener('pointerdown', e => {
  let t = e.target;
  while (t && t !== document.body) {
    if (t.id && btnFlag.has(t.id)) { ptrBtn.set(e.pointerId, { flag: btnFlag.get(t.id), id: t.id }); refreshTch(); return; }
    t = t.parentElement;
  }
}, true);
window.addEventListener('pointerup', e => { if (ptrBtn.delete(e.pointerId)) refreshTch(); }, true);
window.addEventListener('pointercancel', e => { if (ptrBtn.delete(e.pointerId)) refreshTch(); }, true);
function releaseAllTch() { if (ptrBtn.size) { ptrBtn.clear(); refreshTch(); } }
window.addEventListener('blur', releaseAllTch);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { releaseAllTch(); for (const k in phys) phys[k] = false; syncKeys(); }
});
function tap(id, fn) {
  $(id).addEventListener('pointerdown', e => { e.preventDefault(); if (state === 'play') fn(); });
}
hold('d-left', 'left');
hold('d-right', 'right');
hold('d-gas', 'up');
hold('d-brake', 'down');
hold('d-drift', 'drift');
tap('d-exit', exitCar);
hold('f-up', 'up');
hold('f-down', 'down');
hold('f-left', 'left');
hold('f-right', 'right');
hold('f-run', 'run');
tap('f-enter', enterCar);
$('restart').onclick = async () => { if (!await bootGame()) return; if (state === 'play') reset(); start(); };
// --- Site account (the Miner Cat account works everywhere) ---
let ME = null;
const esc = s => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
async function loadLb() {
  try {
    const d = await (await fetch('/api/scores/pursuit3d')).json();
    $('lb').innerHTML = '<b>🏆 Leaderboard</b>' + (d.scores.length ? d.scores.map((s, i) => `<br>${i + 1}. ${esc(s.displayName)} — ${s.score}`).join('') : '<br>No scores yet — be the first!');
  } catch (e) {}
}
async function submitScore(s) {
  if (!ME || !s) return;
  try { await fetch('/api/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game: 'pursuit3d', score: s }) }); loadLb(); } catch (e) {}
}
(async () => {
  try { const r = await fetch('/api/me'); if (r.ok) ME = (await r.json()).user; } catch (e) {}
  $('acct').innerHTML = ME ? `👤 Playing as <b>${esc(ME.displayName)}</b> — your best cash haul saves to your account` : '👤 <a href="/miner-cat-2" style="color:#f5c542;">Sign in</a> to save scores to your account';
  loadLb();
})();
let booted = false, booting = false, bootRetrySafe = false, bootRetries = 0;
async function bootGame() {
  if (booted) return true;
  if (booting) return false;
  if (!window.THREE) return false;
  booting = true;
  bootRetrySafe = false;
  try {
    await buildCity();
    reset();
    syncTouch();
    animate();
    booted = true;
    booting = false;
    return true;
  } catch (err) {
    booting = false;
    // Only auto-retry when the 3D canvas never appeared (renderer creation failed);
    // retrying a half-built city could duplicate it.
    bootRetrySafe = !$('game3d').querySelector('canvas');
    $('msg').textContent = '⚠️ 3D could not start: ' + (err.message || err) + ' — tap Start to retry.';
    if (bootRetrySafe && bootRetries < 2) { bootRetries++; setTimeout(() => bootGame(), 1800); }
    return false;
  }
}
bootGame();
window.addEventListener('pageshow', () => { if (bootRetrySafe) bootGame(); });
window.addEventListener('focus', () => { if (bootRetrySafe) bootGame(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && bootRetrySafe) bootGame(); });