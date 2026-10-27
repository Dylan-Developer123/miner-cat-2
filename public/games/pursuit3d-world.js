// City Pursuit 3D — world builders (split from pursuit3d.html so each file
// stays small enough to ship): superblocks, block types, street signs, buildings.
// Loaded between part A and part B; everything here is called at build time.
const SUPER = { '4,1': 'bigpark', '1,-3': 'mall', '-2,-4': 'school', '-4,-2': 'hoodbig' };
const SUPER_SKIP = new Set(['4,2', '2,-3', '-1,-4', '-4,-1']);
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
function makeSchool(cx, cz) { // two blocks wide: twin halls + a sports field
  const ux = cx + PITCH / 2, uz = cz;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd9cfc0, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8a4b3a, roughness: 0.95 });
  for (const off of [-26, 26]) {
    const bld = new THREE.Mesh(new THREE.BoxGeometry(38, 8, 22), [wallMat, wallMat, roofMat, roofMat, wallMat, wallMat]);
    bld.position.set(ux + off, 4, uz - 14); bld.castShadow = true; bld.receiveShadow = true; scene.add(bld);
    colliders.push({ x1: ux + off - 19, z1: uz - 25, x2: ux + off + 19, z2: uz - 3 });
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshBasicMaterial({ map: makeSignTexture('ARQADE HIGH', '#ffd95e') }));
  sign.position.set(ux, 6.5, uz - 2.6); scene.add(sign);
  const field = new THREE.Mesh(new THREE.PlaneGeometry(110, 22), new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 1 }));
  field.rotation.x = -Math.PI / 2; field.position.set(ux, 0.03, uz + 14); field.receiveShadow = true; scene.add(field);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf5f5f5 });
  for (const [lx, lz, lw, ld] of [[0, 3.6, 110, 0.35], [0, 24.4, 110, 0.35], [-54.8, 14, 0.35, 21], [54.8, 14, 0.35, 21], [0, 14, 0.35, 21]]) {
    const ln = new THREE.Mesh(new THREE.PlaneGeometry(lw, ld), lineMat);
    ln.rotation.x = -Math.PI / 2; ln.position.set(ux + lx, 0.05, uz + lz); scene.add(ln);
  }
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
    return inIsland(px - w / 2 - m, pz - d / 2 - m) && inIsland(px + w / 2 + m, pz - d / 2 - m) &&
           inIsland(px - w / 2 - m, pz + d / 2 + m) && inIsland(px + w / 2 + m, pz + d / 2 + m);
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

