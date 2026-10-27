// City Pursuit 3D — world builders (split from pursuit3d.html so each file
// stays small enough to ship): superblocks, block types, street signs, buildings.
// Loaded between part A and part B; everything here is called at build time.
const SUPER = { '4,1': 'bigpark', '1,-3': 'mall', '-2,-4': 'school', '-4,-2': 'hoodbig', '-5,-5': 'park2x2', '5,2': 'bigpark', '-3,2': 'hoodbig', '2,4': 'school2' };
const SUPER_SKIP = new Set(['4,2', '2,-3', '-1,-4', '-4,-1', '-4,-5', '-5,-4', '-4,-4', '5,3', '-3,3', '3,4']);
function parkSign(x, z, text) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), new THREE.MeshBasicMaterial({ map: makeSignTexture(text, '#4ade80'), side: THREE.DoubleSide }));
  m.position.set(x, 2.4, z); scene.add(m);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x4b3b28, roughness: 1 });
  for (const off of [-4, 4]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.4, 0.25), postMat);
    post.position.set(x + off, 1.2, z); scene.add(post);
  }
}
function parkedCar(x, z, ang) {
  const g = new THREE.Group();
  const col = [0xb91c1c, 0x1d4ed8, 0xd6d3cd, 0x374151, 0x0f766e][Math.floor(Math.random() * 5)];
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.65, 4.4), new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.5 }));
  body.position.y = 0.55; body.castShadow = true; g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.2, metalness: 0.4 }));
  cab.position.set(0, 1.12, -0.2); cab.castShadow = true; g.add(cab);
  g.position.set(x, 0, z); g.rotation.y = ang; scene.add(g);
  const along = Math.abs(Math.sin(ang)) > 0.5;
  colliders.push({ x1: x - (along ? 2.4 : 1.1), z1: z - (along ? 1.1 : 2.4), x2: x + (along ? 2.4 : 1.1), z2: z + (along ? 1.1 : 2.4) });
}
function makeMall(cx, cz) { // two blocks wide: big flat store + parking lot in front
  const ux = cx + PITCH / 2, uz = cz;
  const tex = FACES[Math.floor(Math.random() * FACES.length)];
  const mat = new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.glow, emissive: 0xffc37a, emissiveIntensity: 0.9, roughness: 0.85 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.95 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(100, 10, 30), [mat, mat, roofMat, roofMat, mat, mat]);
  b.position.set(ux, 5, uz - 12); b.castShadow = true; b.receiveShadow = true; scene.add(b);
  colliders.push({ x1: ux - 50, z1: uz - 27, x2: ux + 50, z2: uz + 3 });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(20, 5), new THREE.MeshBasicMaterial({ map: makeSignTexture('ARQADE MALL', '#4dd8ff') }));
  sign.position.set(ux, 8, uz + 3.2); scene.add(sign);
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(120, 24), new THREE.MeshStandardMaterial({ color: 0x26282c, roughness: 1 }));
  lot.rotation.x = -Math.PI / 2; lot.position.set(ux, 0.03, uz + 14); lot.receiveShadow = true; scene.add(lot);
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xd8d8d8 });
  for (let i = 0; i < 9; i++) {
    const st = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 9), stripeMat);
    st.rotation.x = -Math.PI / 2; st.position.set(ux - 52 + i * 13, 0.05, uz + 10); scene.add(st);
  }
  for (let i = 0; i < 4; i++) parkedCar(ux - 45 + i * 26 + Math.random() * 6, uz + 15, Math.PI / 2);
}
function makeSchool(cx, cz, name) { // two blocks wide: twin halls + a sports field
  const ux = cx + PITCH / 2, uz = cz;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd9cfc0, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8a4b3a, roughness: 0.95 });
  for (const off of [-26, 26]) {
    const bld = new THREE.Mesh(new THREE.BoxGeometry(38, 8, 22), [wallMat, wallMat, roofMat, roofMat, wallMat, wallMat]);
    bld.position.set(ux + off, 4, uz - 14); bld.castShadow = true; bld.receiveShadow = true; scene.add(bld);
    colliders.push({ x1: ux + off - 19, z1: uz - 25, x2: ux + off + 19, z2: uz - 3 });
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshBasicMaterial({ map: makeSignTexture(name || 'ARQADE HIGH', '#ffd95e') }));
  sign.position.set(ux, 6.5, uz - 2.6); scene.add(sign);
  const field = new THREE.Mesh(new THREE.PlaneGeometry(110, 22), new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 1 }));
  field.rotation.x = -Math.PI / 2; field.position.set(ux, 0.03, uz + 14); field.receiveShadow = true; scene.add(field);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf5f5f5 });
  for (const [lx, lz, lw, ld] of [[0, 3.6, 110, 0.35], [0, 24.4, 110, 0.35], [-54.8, 14, 0.35, 21], [54.8, 14, 0.35, 21], [0, 14, 0.35, 21]]) {
    const ln = new THREE.Mesh(new THREE.PlaneGeometry(lw, ld), lineMat);
    ln.rotation.x = -Math.PI / 2; ln.position.set(ux + lx, 0.05, uz + lz); scene.add(ln);
  }
}
function makeLake(x, z) { // a little pond in the middle of the 2x2 park
  const rim = new THREE.Mesh(new THREE.CircleGeometry(17, 24), new THREE.MeshStandardMaterial({ color: 0x8a6f45, roughness: 1 }));
  rim.rotation.x = -Math.PI / 2; rim.position.set(x, 0.04, z); rim.receiveShadow = true; scene.add(rim);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(15, 24), new THREE.MeshStandardMaterial({ color: 0x14507e, roughness: 0.1, metalness: 0.5 }));
  pond.rotation.x = -Math.PI / 2; pond.position.set(x, 0.055, z); scene.add(pond);
}
function makeParkingLot(cx, cz) {
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(52, 52), new THREE.MeshStandardMaterial({ color: 0x26282c, roughness: 1 }));
  lot.rotation.x = -Math.PI / 2; lot.position.set(cx, 0.03, cz); lot.receiveShadow = true; scene.add(lot);
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xd8d8d8 });
  for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) {
    const st = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 10), stripeMat);
    st.rotation.x = -Math.PI / 2; st.position.set(cx - 22 + i * 9, 0.05, cz - 14 + r * 26); scene.add(st);
  }
  const n = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) parkedCar(cx + (Math.random() - 0.5) * 40, cz + (Math.random() - 0.5) * 40, Math.random() < 0.5 ? 0 : Math.PI / 2);
}
function makePlaza(cx, cz) {
  flatBlock(cx, cz, 0x3d3f45, 0.03);
  for (const [ox, oz] of [[-22, -22], [22, -22], [-22, 22], [22, 22]]) addTree(cx + ox, cz + oz, true, 0);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.4, 1, 18), new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.7 }));
  base.position.set(cx, 0.5, cz); base.castShadow = true; scene.add(base);
  const water = new THREE.Mesh(new THREE.CircleGeometry(4.5, 18), new THREE.MeshStandardMaterial({ color: 0x2b6cb0, roughness: 0.15, metalness: 0.4 }));
  water.rotation.x = -Math.PI / 2; water.position.set(cx, 1.02, cz); scene.add(water);
  colliders.push({ x1: cx - 5.4, z1: cz - 5.4, x2: cx + 5.4, z2: cz + 5.4 });
}
const streetTexCache = new Map();
function streetTexture(name) {
  if (streetTexCache.has(name)) return streetTexCache.get(name);
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 72;
  const x = cv.getContext('2d');
  x.fillStyle = '#14532d'; x.fillRect(0, 0, 512, 72);
  x.strokeStyle = '#f8fafc'; x.lineWidth = 4; x.strokeRect(5, 5, 502, 62);
  x.font = 'bold 40px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#f8fafc'; x.fillText(name.toUpperCase(), 256, 38);
  const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding;
  streetTexCache.set(name, t);
  return t;
}
function addStreetSign(x, z, vName, hName) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.6, 6), new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.5, metalness: 0.7 }));
  pole.position.set(x, 1.8, z); pole.castShadow = true; scene.add(pole);
  const mk = (name, rotY, y) => {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.65), new THREE.MeshBasicMaterial({ map: streetTexture(name), side: THREE.DoubleSide }));
    b.position.set(x, y, z); b.rotation.y = rotY; scene.add(b);
  };
  mk(hName, 0, 3.35);
  mk(vName, Math.PI / 2, 2.95);
}
function makeBuilding(cx, cz, b) {
  let w = 15 + Math.random() * 17, d = 15 + Math.random() * 17;
  const centerBoost = Math.max(0, 1 - Math.hypot(cx, cz) / 330);
  const hgt = 11 + Math.pow(Math.random(), 1.6) * 44 + centerBoost * 24;
  // place the building only where its whole footprint is on dry land — coast
  // blocks get nudged inland, shrunk to fit, or skipped: no towers on the beach
  const fits = (px, pz) => {
    const m = 1.5;
    const cs = [[px - w / 2 - m, pz - d / 2 - m], [px + w / 2 + m, pz - d / 2 - m], [px - w / 2 - m, pz + d / 2 + m], [px + w / 2 + m, pz + d / 2 + m]];
    return cs.every(c => inIsland(c[0], c[1]) && distToPaths(c[0], c[1]) > 9.5); // on land AND fully off the curved roads (road half-width 6.5 + margin)
  };
  let bx = null, bz = null;
  for (let t = 0; t < 10 && bx === null; t++) {
    const px = cx + (Math.random() - 0.5) * (BLOCK - w - 6), pz = cz + (Math.random() - 0.5) * (BLOCK - d - 6);
    if (fits(px, pz)) { bx = px; bz = pz; }
  }
  if (bx === null) {
    w = Math.min(w, 20); d = Math.min(d, 20);
    if (!fits(cx, cz)) return; // this sliver of coast stays empty
    bx = cx; bz = cz;
  }
  const tex = FACES[Math.floor(Math.random() * FACES.length)];
  const glassy = Math.random() < 0.3;
  const mat = glassy
    ? new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.glow, emissive: 0xaad4ff, emissiveIntensity: 0.85, roughness: 0.22, metalness: 0.55, color: 0xcfe2f2 })
    : new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.glow, emissive: 0xffc37a, emissiveIntensity: 1.05, roughness: 0.88, metalness: 0.08, color: [0xffffff, 0xf3e9d6, 0xdfe7ee, 0xeeddcf, 0xe6e2d8][Math.floor(Math.random() * 5)] });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.95 });
  const grp = new THREE.Group(); grp.position.set(bx, 0, bz);
  const style = Math.random();
  if (style < 0.34) {
    // tiered tower: stacked slabs that step in as they rise
    const tiers = Math.random() < 0.5 ? 2 : 3;
    const fracs = tiers === 2 ? [0.62, 0.38] : [0.5, 0.3, 0.2];
    let cw = w, cd = d, y = 0;
    for (let t = 0; t < tiers; t++) {
      const th = hgt * fracs[t];
      const m = new THREE.Mesh(new THREE.BoxGeometry(cw, th, cd), [mat, mat, roofMat, roofMat, mat, mat]);
      m.position.y = y + th / 2; grp.add(m);
      y += th; cw *= 0.7; cd *= 0.7;
    }
  } else if (style < 0.55) {
    // round tower
    const r = Math.min(w, d) / 2;
    const cMap = tex.map.clone(); cMap.needsUpdate = true; cMap.wrapS = THREE.RepeatWrapping; cMap.repeat.set(3, 2);
    const cGlow = tex.glow.clone(); cGlow.needsUpdate = true; cGlow.wrapS = THREE.RepeatWrapping; cGlow.repeat.set(3, 2);
    const cm = new THREE.MeshStandardMaterial({ map: cMap, emissiveMap: cGlow, emissive: glassy ? 0xaad4ff : 0xffc37a, emissiveIntensity: 1.0, roughness: 0.7, metalness: 0.15 });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.07, hgt, 18), cm);
    m.position.y = hgt / 2; grp.add(m);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.38, r * 0.78, 2.4, 18), roofMat);
    cap.position.y = hgt + 1.2; grp.add(cap);
  } else if (style < 0.78) {
    // slab with a pyramid crown
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), [mat, mat, roofMat, roofMat, mat, mat]);
    m.position.y = hgt / 2; grp.add(m);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.7, 4.4, 4), roofMat);
    roof.rotation.y = Math.PI / 4; roof.position.y = hgt + 2.2; grp.add(roof);
  } else {
    // L-shaped block
    const m1 = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d * 0.6), [mat, mat, roofMat, roofMat, mat, mat]);
    m1.position.set(0, hgt / 2, -d * 0.2); grp.add(m1);
    const m2 = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, hgt * 0.78, d), [mat, mat, roofMat, roofMat, mat, mat]);
    m2.position.set(-w * 0.22, hgt * 0.39, 0); grp.add(m2);
  }
  grp.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(grp);
  if (hgt > 24 && Math.random() < 0.7) {
    const ac = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.2, 2.2), new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.6, metalness: 0.5 }));
    ac.position.set(bx + (Math.random() - 0.5) * w * 0.4, hgt + 0.6, bz + (Math.random() - 0.5) * d * 0.4);
    ac.castShadow = true; scene.add(ac);
  }
  if (hgt > 30 && Math.random() < 0.3) {
    const tw = new THREE.Group();
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 2.8, 10), new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 }));
    tank.position.y = 1.9; tw.add(tank);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.45, 1.1, 10), new THREE.MeshStandardMaterial({ color: 0x3d2f22, roughness: 0.9 }));
    cap.position.y = 3.8; tw.add(cap);
    tw.position.set(bx, hgt, bz);
    tw.traverse(o => { if (o.isMesh) o.castShadow = true; });
    scene.add(tw);
  }
  if (b === 0 && Math.random() < 0.35) {
    const words = [['HOTEL', '#ff5da2'], ['ARQADE', '#4dd8ff'], ['DINER', '#ffb84d'], ['PIZZA', '#ff6b4d'], ['CINEMA', '#c792ff'], ['GYM', '#7dff6b']];
    const [word, col] = words[Math.floor(Math.random() * words.length)];
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.75), new THREE.MeshBasicMaterial({ map: makeSignTexture(word, col) }));
    sign.position.set(bx, 8.5, bz + d / 2 + 0.09);
    scene.add(sign);
  }
  colliders.push({ x1: bx - w / 2, z1: bz - d / 2, x2: bx + w / 2, z2: bz + d / 2 });
}


// ===== curved roads + weather (moved out of pursuit3d.html: the page file hit the push size cap) =====
// ===== CURVED ROADS ===== the grid stays for traffic AI; these are true curves.
// Shore Drive: a ring road that follows the island's bean shape, inset from the
// rim. North Park Drive: an S-curve sweeping through the 2x2 park.
const RING_PTS = (() => {
  const poly = offsetIsland(-26), out = [];
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length];
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 7));
    for (let q = 0; q < n; q++) out.push([x1 + (x2 - x1) * q / n, z1 + (z2 - z1) * q / n]);
  }
  return out;
})();
const PARK_PTS = (() => {
  const out = [], P0 = [-216, -360], P1 = [-368, -368], P2 = [-360, -216];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    out.push([a * P0[0] + b * P1[0] + c * P2[0], a * P0[1] + b * P1[1] + c * P2[1]]);
  }
  return out;
})();
function distToPts(x, z, pts) {
  let d = 1e18;
  for (let i = 0; i < pts.length; i++) { const dx = x - pts[i][0], dz = z - pts[i][1], dd = dx * dx + dz * dz; if (dd < d) d = dd; }
  return Math.sqrt(d);
}
function distToPaths(x, z) { return Math.min(distToPts(x, z, RING_PTS), distToPts(x, z, PARK_PTS)); }
function ribbonMesh(pts, width, closed) { // a road ribbon that follows a curve
  const n = pts.length, pos = [], uv = [], idx = [];
  let dist = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const pP = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)];
    const pN = closed ? pts[(i + 1) % n] : pts[Math.min(n - 1, i + 1)];
    let dx = pN[0] - pP[0], dz = pN[1] - pP[1];
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    if (i > 0) dist += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    const hw = width / 2;
    pos.push(p[0] - dz * hw, 0.025, p[1] + dx * hw, p[0] + dz * hw, 0.025, p[1] - dx * hw);
    uv.push(0, dist / 16, 1, dist / 16);
    if (i < n - 1 || closed) { const a = i * 2, b = ((i + 1) % n) * 2; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: roadTextures(), roughness: 0.93, side: THREE.DoubleSide }));
  m.receiveShadow = true;
  return m;
}
// ===== WEATHER ===== cycles on its own: clear, cloudy, rain, storm, fog.
// Pure atmosphere (fog, light, rain, lightning) — handling never changes.
const WX_STATES = {
  clear:  { label: '☀️ Clear',  fog: [170, 980], fogC: new THREE.Color(0x2a2233), sun: 1.3,  hemi: 1.0,  rain: 0,    cloudC: new THREE.Color(0xd9a08a), cloudMul: 1 },
  cloudy: { label: '⛅ Cloudy', fog: [140, 800], fogC: new THREE.Color(0x2c2c38), sun: 0.85, hemi: 0.85, rain: 0,    cloudC: new THREE.Color(0xb9bcc4), cloudMul: 1.7 },
  rain:   { label: '🌧️ Rain',   fog: [110, 620], fogC: new THREE.Color(0x232833), sun: 0.55, hemi: 0.7,  rain: 0.55, cloudC: new THREE.Color(0x878e99), cloudMul: 2.4 },
  storm:  { label: '⛈️ Storm',  fog: [80, 470],  fogC: new THREE.Color(0x1d2129), sun: 0.42, hemi: 0.6,  rain: 0.9,  cloudC: new THREE.Color(0x6e757f), cloudMul: 2.8 },
  fog:    { label: '🌫️ Fog',    fog: [30, 250],  fogC: new THREE.Color(0x565d66), sun: 0.7,  hemi: 0.82, rain: 0,    cloudC: new THREE.Color(0xc9ccd2), cloudMul: 2.2 },
};
let wxName = 'clear', wxTimer = 55, wxCur = null, hemiL = null, rainPts = null, rainPos = null, boltT = 0, nextBolt = 7;
const wxHud = document.getElementById('wxHud'), wxFlash = document.getElementById('wxFlash');
function setWeather(name, silent) {
  wxName = name; wxTimer = 55 + Math.random() * 55;
  if (wxHud) wxHud.textContent = WX_STATES[name].label;
  if (!silent) { const msg = WX_STATES[name].label + ' rolling in'; if (typeof flashSmall === 'function') flashSmall(msg); }
}
function pickWeather() {
  const pool = ['clear', 'clear', 'cloudy', 'cloudy', 'rain', 'rain', 'fog', 'storm'];
  let n = wxName;
  while (n === wxName) n = pool[(Math.random() * pool.length) | 0];
  setWeather(n);
}
function updateWeather(dt) {
  if (!wxCur) { // first frame: snapshot the clear-day look and build the rain
    wxCur = { fogN: 170, fogF: 980, sun: 1.3, hemi: 1.0, rain: 0, fogC: new THREE.Color(0x2a2233), cloudC: new THREE.Color(0xd9a08a), cloudMul: 1 };
    scene.traverse(o => { if (o.isHemisphereLight) hemiL = o; });
    for (const c of clouds) c.userData.baseOp = c.material.opacity;
    const N = 1300; rainPos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { rainPos[i * 3] = (Math.random() - 0.5) * 130; rainPos[i * 3 + 1] = Math.random() * 55; rainPos[i * 3 + 2] = (Math.random() - 0.5) * 130; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    rainPts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xa8c4e0, size: 0.55, transparent: true, opacity: 0, depthWrite: false }));
    rainPts.frustumCulled = false; rainPts.visible = false;
    scene.add(rainPts);
  }
  wxTimer -= dt; if (wxTimer <= 0) pickWeather();
  const T = WX_STATES[wxName], k = 1 - Math.exp(-dt * 0.7);
  wxCur.fogN += (T.fog[0] - wxCur.fogN) * k; wxCur.fogF += (T.fog[1] - wxCur.fogF) * k;
  wxCur.sun += (T.sun - wxCur.sun) * k; wxCur.hemi += (T.hemi - wxCur.hemi) * k;
  wxCur.rain += (T.rain - wxCur.rain) * k; wxCur.cloudMul += (T.cloudMul - wxCur.cloudMul) * k;
  wxCur.fogC.lerp(T.fogC, k); wxCur.cloudC.lerp(T.cloudC, k);
  scene.fog.near = wxCur.fogN; scene.fog.far = wxCur.fogF; scene.fog.color.copy(wxCur.fogC);
  let bolt = 0;
  if (wxName === 'storm') { nextBolt -= dt; if (nextBolt <= 0) { boltT = 0.3 + Math.random() * 0.25; nextBolt = 5 + Math.random() * 9; } }
  if (boltT > 0) { boltT -= dt; bolt = Math.max(0, boltT) * (0.6 + Math.random() * 0.8); }
  if (sunLight) sunLight.intensity = wxCur.sun + bolt * 2.4;
  if (hemiL) hemiL.intensity = wxCur.hemi + bolt * 0.9;
  if (wxFlash) wxFlash.style.opacity = (bolt * 0.38).toFixed(2);
  for (const c of clouds) { c.material.color.copy(wxCur.cloudC); c.material.opacity = Math.min(0.85, (c.userData.baseOp || 0.2) * wxCur.cloudMul); }
  rainPts.material.opacity = wxCur.rain * 0.55;
  rainPts.visible = wxCur.rain > 0.02;
  if (rainPts.visible) {
    const a = mode === 'drive' && playerCar ? playerCar.mesh.position : (char ? char.position : { x: 0, z: 0 });
    rainPts.position.set(a.x, 0, a.z);
    const fall = 48 * dt;
    for (let i = 0; i < rainPos.length; i += 3) { rainPos[i + 1] -= fall * (0.8 + (i % 13) / 32); if (rainPos[i + 1] < 0) rainPos[i + 1] += 55; }
    rainPts.geometry.attributes.position.needsUpdate = true;
  }
}

// ===== buildCity (moved out of pursuit3d.html: page file size) =====
async function buildCity() {
  scene = new THREE.Scene();
  const skyTex = makeSkyTexture();
  scene.background = skyTex;
  scene.fog = new THREE.Fog(0x2a2233, 170, 980);
  camera = new THREE.PerspectiveCamera(66, 720 / 460, 0.1, 2600);
  renderer = await createRenderer();
  renderer.domElement.addEventListener('webglcontextlost', ev => {
    ev.preventDefault();
    try { if (!sessionStorage.getItem('cp_ctx')) { sessionStorage.setItem('cp_ctx', '1'); location.reload(); } } catch (e2) {}
  });
  renderer.setSize(720, 460);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('game3d').appendChild(renderer.domElement);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(skyTex).texture;
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xcdd8ff, 0x2a2419, 1.0));
  sunLight = new THREE.DirectionalLight(0xffd2a0, 1.3);
  sunLight.position.set(-60, 95, -50);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -105; sunLight.shadow.camera.right = 105;
  sunLight.shadow.camera.top = 105; sunLight.shadow.camera.bottom = -105;
  sunLight.shadow.camera.near = 10; sunLight.shadow.camera.far = 380;
  sunLight.shadow.bias = -0.0006; sunLight.shadow.normalBias = 0.03;
  scene.add(sunLight); scene.add(sunLight.target);
  // the island: one big ocean with an island-shaped hole, a sand apron, then the city ground
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x11395e, roughness: 0.12, metalness: 0.6, envMapIntensity: 1.2 });
  const shapeOf = pts => {
    const sh = new THREE.Shape();
    pts.forEach(([x, z], i) => { if (i === 0) sh.moveTo(x, -z); else sh.lineTo(x, -z); });
    sh.closePath();
    return sh;
  };
  const oceanShape = new THREE.Shape();
  oceanShape.moveTo(-1500, -1500); oceanShape.lineTo(1500, -1500); oceanShape.lineTo(1500, 1500); oceanShape.lineTo(-1500, 1500); oceanShape.closePath();
  const oceanHole = new THREE.Path();
  offsetIsland(8).forEach(([x, z], i) => { if (i === 0) oceanHole.moveTo(x, -z); else oceanHole.lineTo(x, -z); });
  oceanHole.closePath();
  oceanShape.holes.push(oceanHole);
  const oceanGeo = new THREE.ShapeGeometry(oceanShape); oceanGeo.rotateX(-Math.PI / 2);
  const ocean = new THREE.Mesh(oceanGeo, waterMat);
  ocean.position.y = -0.6; scene.add(ocean);
  const sandGeo = new THREE.ShapeGeometry(shapeOf(offsetIsland(13))); sandGeo.rotateX(-Math.PI / 2);
  const sand = new THREE.Mesh(sandGeo, new THREE.MeshStandardMaterial({ color: 0xb59a67, roughness: 1 }));
  sand.position.y = -0.16; sand.receiveShadow = true; scene.add(sand);
  const swTex = sidewalkTexture(); swTex.repeat.set(0.057, 0.057);
  const gShape = shapeOf(ISLAND);
  const gHole = new THREE.Path(); // garage entrance cut-out (shape Y maps to world -Z): world x 78..104, z 29..43
  gHole.moveTo(78, -43); gHole.lineTo(104, -43); gHole.lineTo(104, -29); gHole.lineTo(78, -29); gHole.closePath();
  gShape.holes.push(gHole);
  const groundGeo = new THREE.ShapeGeometry(gShape); groundGeo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ map: swTex, roughness: 1 }));
  ground.position.y = -0.06; ground.receiveShadow = true; scene.add(ground); groundMesh = ground;
  // beach dressing: trees and rocks dotted along the shoreline
  const shoreSpot = () => {
    for (let t = 0; t < 40; t++) {
      const a = Math.random() * Math.PI * 2, r = 280 + Math.random() * 230;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.max(Math.abs(x), Math.abs(z)) < 430) continue;   // stay off the city blocks
      if (!inIsland(x, z) && distToShore(x, z) > 9) continue;   // on the island or its sand apron
      if (distToShore(x, z) > 40) continue;                     // near the water
      return [x, z];
    }
    return null;
  };
  for (let i = 0; i < 15; i++) { const sp = shoreSpot(); if (sp) addTree(sp[0], sp[1], false, groundHeightAt(sp[0], sp[1])); }
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x707a84, roughness: 0.95, flatShading: true });
  for (let i = 0; i < 10; i++) {
    const sp = shoreSpot(); if (!sp) continue;
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 + Math.random() * 1.8, 0), rockMat);
    rock.position.set(sp[0], groundHeightAt(sp[0], sp[1]) + 0.3, sp[1]);
    rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    rock.castShadow = true; scene.add(rock);
  }
  // roads: built in runs between intersections, and only where they touch land —
  // streets run into the beach at the shore instead of floating over the sea
  const roadTex = roadTextures();
  const mkRoad = (w, l) => {
    const t = roadTex.clone(); t.needsUpdate = true; t.repeat.set(1, l / 16);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshStandardMaterial({ map: t, roughness: 0.93, metalness: 0.02 }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.01; m.receiveShadow = true;
    return m;
  };
  const mkRoadH = (w, l) => {
    // same tile as a vertical road, mesh spun 90° in-plane so the dashes run along x
    const t = roadTex.clone(); t.needsUpdate = true; t.repeat.set(1, l / 16);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshStandardMaterial({ map: t, roughness: 0.93, metalness: 0.02 }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = Math.PI / 2; m.position.y = 0.01; m.receiveShadow = true;
    return m;
  };
  // NOTE: the run tracker uses null for "no run open" — a numeric sentinel like -1
  // collides with real segment indices (j runs -6..5) and silently ate whole runs
  for (let k = -GRID; k <= GRID; k++) {
    let runStart = null;
    for (let j = -GRID; j <= GRID; j++) {
      const land = j < GRID && segClear('v', k, j);
      if (land && runStart === null) runStart = j;
      if ((!land || j === GRID) && runStart !== null) {
        const len = (j - runStart) * PITCH + 0.6;
        const m = mkRoad(k === 0 ? ROAD_W + 6 : ROAD_W, len); m.position.set(roadCoord(k), 0.01, roadCoord(runStart) + len / 2); scene.add(m);
        runStart = null;
      }
    }
    runStart = null;
    for (let j = -GRID; j <= GRID; j++) {
      const land = j < GRID && segClear('h', k, j);
      if (land && runStart === null) runStart = j;
      if ((!land || j === GRID) && runStart !== null) {
        const len = (j - runStart) * PITCH + 0.6;
        const m = mkRoadH(k === 0 ? ROAD_W + 6 : ROAD_W, len); m.position.set(roadCoord(runStart) + len / 2, 0.01, roadCoord(k)); scene.add(m);
        runStart = null;
      }
    }
  }
  // intersection patches (plain asphalt squares kill the double-line look)
  const patchMat = new THREE.MeshStandardMaterial({ map: crosswalkTexture(), roughness: 0.95 });
  for (let i = -GRID; i <= GRID; i++) for (let j = -GRID; j <= GRID; j++) {
    const anySeg = (j > -GRID && segClear('v', i, j - 1)) || (j < GRID && segClear('v', i, j)) ||
                   (i > -GRID && segClear('h', j, i - 1)) || (i < GRID && segClear('h', j, i));
    if (!anySeg) continue; // a junction only exists where real road segments meet
    const psz = (i === 0 || j === 0) ? 23 : ROAD_W + 0.5; // avenue crossings get an avenue-sized patch
    const p = new THREE.Mesh(new THREE.PlaneGeometry(psz, psz), patchMat);
    p.rotation.x = -Math.PI / 2; p.position.set(roadCoord(i), 0.02, roadCoord(j)); p.receiveShadow = true; scene.add(p);
    if (i === 0 || j === 0) addStreetSign(roadCoord(i) + ROAD_W / 2 + 2.2, roadCoord(j) + ROAD_W / 2 + 2.2, STREET_V[i + 6], STREET_H[j + 6]);
  }
  // buildings on blocks (skip center-south block = park)
  FACES = [
    buildingTexture('#3a4152', 0.5), buildingTexture('#4a3f35', 0.4), buildingTexture('#35424e', 0.6),
    buildingTexture('#463a52', 0.45), buildingTexture('#2f3a2e', 0.5),
    buildingTexture('#5a3d33', 0.35, 9, 7), buildingTexture('#6b6f75', 0.55, 18, 5), buildingTexture('#2e4048', 0.65, 15, 7)
  ];
  for (let bi = -GRID; bi < GRID; bi++) for (let bj = -GRID; bj < GRID; bj++) {
    const cx = roadCoord(bi) + PITCH / 2, cz = roadCoord(bj) + PITCH / 2;
    if (!inIsland(cx, cz)) continue; // open water — the island's edge cuts this block away
    if (bi === 0 && bj === 0) { makePark(cx, cz); continue; }
    if (bi === 1 && bj === 0) { buildGaragePlaza(cx, cz); continue; }
    if (bi === -1 && bj === 0) { buildParkingGarage(); continue; }
    const bk = bi + ',' + bj;
    if (PARKS_X.has(bk)) { makeParkPlain(cx, cz, bk === '2,2'); continue; }
    if (HOODS.has(bk)) { makeHouses(cx, cz); continue; }
    if (SHOPS.has(bk)) { makeAutoShop(cx, cz, bj >= 0 ? 1 : -1); continue; }
    if (STATIONS.has(bk)) { makePoliceStation(cx, cz); continue; }
    if (SUPER_SKIP.has(bk)) continue; // the other half of a superblock — built by its anchor
    if (SUPER[bk] === 'bigpark') { makeParkPlain(cx, cz, false); makeParkPlain(cx, cz + PITCH, false); parkSign(cx + 18, cz + PITCH + 24, 'BIG PARK'); continue; }
    if (SUPER[bk] === 'hoodbig') { makeHouses(cx, cz); makeHouses(cx, cz + PITCH); continue; }
    if (SUPER[bk] === 'mall') { makeMall(cx, cz); continue; }
    if (SUPER[bk] === 'school') { makeSchool(cx, cz); continue; }
    if (SUPER[bk] === 'school2') { makeSchool(cx, cz, 'SOUTH SCHOOL'); continue; }
    if (SUPER[bk] === 'park2x2') { makeParkPlain(cx, cz, false); makeParkPlain(cx + PITCH, cz, false); makeParkPlain(cx, cz + PITCH, false); makeParkPlain(cx + PITCH, cz + PITCH, false); makeLake(cx + PITCH / 2, cz + PITCH / 2); parkSign(cx + PITCH + 14, cz + PITCH + 22, 'NORTH PARK'); continue; }
    const deepLand = inIsland(cx - 28, cz - 28) && inIsland(cx + 28, cz - 28) && inIsland(cx - 28, cz + 28) && inIsland(cx + 28, cz + 28);
    const roll = Math.random();
    const clearOfCurves = distToPaths(cx, cz) > 36; // lots/plazas are wide — never let one straddle a curved road
    if (deepLand && clearOfCurves && roll < 0.10) { makeParkingLot(cx, cz); continue; }
    if (deepLand && clearOfCurves && roll < 0.20) { makePlaza(cx, cz); continue; }
    const n = 1 + Math.floor(Math.random() * 3);
    for (let b = 0; b < n; b++) makeBuilding(cx, cz, b);
    sprinkleProps(cx, cz);
  }
  // the curved roads get built as ribbons over the ground
  scene.add(ribbonMesh(RING_PTS, 13, true));
  scene.add(ribbonMesh(PARK_PTS, 12, false));
  // streetlights along roads
  for (let k = -GRID; k <= GRID; k++) for (let s = -GRID * PITCH; s <= GRID * PITCH; s += 54) {
    const lx1 = roadCoord(k) + ROAD_W / 2 + 1.5, lz1 = s + 10;
    if (inIsland(lx1, lz1)) addStreetlight(lx1, lz1);
    const lx2 = s + 10, lz2 = roadCoord(k) + ROAD_W / 2 + 1.5;
    if (inIsland(lx2, lz2)) addStreetlight(lx2, lz2);
  }
  // stunt ramps: four on the streets, one in the park
  addRamp(4, -40, 0);
  addRamp(-68, 30, Math.PI);
  addRamp(120, -68, -Math.PI / 2);
  addRamp(-160, 76, Math.PI / 2);
  addRamp(-30, 144, Math.PI / 2);
  // distant islets on the horizon — this city is an island now
  const silMat = new THREE.MeshBasicMaterial({ color: 0x101623 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.random() * 0.5;
    const r = 900 + Math.random() * 250;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(60 + Math.random() * 70, 16 + Math.random() * 22, 7), silMat);
    cone.position.set(Math.cos(a) * r, -2, Math.sin(a) * r);
    scene.add(cone);
  }
  // drifting sunset clouds
  const cloudTex = glowTexture();
  for (let i = 0; i < 11; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: 0xd9a08a, transparent: true, opacity: 0.13 + Math.random() * 0.12, depthWrite: false }));
    sp.scale.set(150 + Math.random() * 160, 34 + Math.random() * 26, 1);
    sp.position.set((Math.random() - 0.5) * 1700, 95 + Math.random() * 60, (Math.random() - 0.5) * 1700);
    scene.add(sp); clouds.push(sp);
  }
  // one real headlight beam that follows whatever car you drive
  headlight = new THREE.SpotLight(0xffd9a0, 0, 62, 0.46, 0.55, 1);
  scene.add(headlight); scene.add(headlight.target);
  // smoke pool
  const st = smokeTexture();
  for (let i = 0; i < 70; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: st, transparent: true, opacity: 0, depthWrite: false }));
    sp.scale.set(1, 1, 1); sp.visible = false;
    scene.add(sp);
    smokePool.push({ sp, life: 0, max: 1 });
  }
  clock = new THREE.Clock();
}
