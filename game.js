// Ember Isle - rendering, UI and input. All game rules live in sim.js.
import * as THREE from 'three';
import { createSim, TYPES, TYPE_NAME, MAX_LEVEL, SPAWN_POS, POND_Z, POND_R } from './sim.js';

const sim = createSim();
const S = sim.state;
const $ = (id) => document.getElementById(id);
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const wrapPi = (a) => { while (a > PI) a -= TAU; while (a < -PI) a += TAU; return a; };
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const VR = mulberry32(4242); // visual rng (seeded -> same island every load)

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (e) { renderer = null; }

if (!renderer) {
  $('nogl').style.display = 'flex';
  window.__ember = { sim, error: 'WebGL unavailable' };
} else {
  main(renderer);
}

function main(renderer) {
  // =====================================================================
  // Renderer / scene / camera
  // =====================================================================
  const view = $('view');
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  view.appendChild(renderer.domElement);
  const canvas = renderer.domElement;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbcd6e6);
  scene.fog = new THREE.Fog(0xbcd6e6, 60, 130);

  const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 300);
  const camState = { tx: 0, tz: 0, zoom: 1 };
  const YAW = PI / 4, PITCH = 35 * PI / 180, CAM_DIST = 70;
  let viewW = 1, viewH = 1, frustumH = 20;
  function updateCamera() {
    const aspect = viewW / viewH;
    frustumH = aspect >= 1 ? 20 : Math.min(40, 15 / aspect);
    const hh = frustumH / 2;
    cam.left = -hh * aspect; cam.right = hh * aspect; cam.top = hh; cam.bottom = -hh;
    cam.zoom = camState.zoom;
    cam.updateProjectionMatrix();
    cam.position.set(camState.tx + Math.sin(YAW) * Math.cos(PITCH) * CAM_DIST, Math.sin(PITCH) * CAM_DIST,
      camState.tz + Math.cos(YAW) * Math.cos(PITCH) * CAM_DIST);
    cam.lookAt(camState.tx, 0, camState.tz);
    cam.updateMatrixWorld();
  }
  function resize() {
    viewW = Math.max(1, window.innerWidth); viewH = Math.max(1, window.innerHeight);
    renderer.setSize(viewW, viewH, false);
    canvas.style.width = viewW + 'px'; canvas.style.height = viewH + 'px';
    updateCamera();
  }
  window.addEventListener('resize', resize);
  resize();

  // Lights
  const sun = new THREE.DirectionalLight(0xfff2dc, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 80;
  sc.updateProjectionMatrix();
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
  sun.position.set(-10, 20, 8);
  scene.add(sun); scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xcfe6f5, 0x8c9aa5, 1.0);
  scene.add(hemi);
  const plazaLight = new THREE.PointLight(0xffb347, 0, 16, 2);
  plazaLight.position.set(0, 2.2, 0);
  scene.add(plazaLight);

  // =====================================================================
  // Materials / geometry tables
  // =====================================================================
  const std = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, flatShading: true, roughness: 0.9, metalness: 0 }, extra));
  const MAT = {
    snow: std(0xe8eef2), rock: std(0x6b7280), darkRock: std(0x3f4652), stone: std(0x8a93a0),
    wood: std(0x8b5a2b), woodL: std(0xa06c38), darkWood: std(0x5a3a1e), roof: std(0xb5452f), canvas: std(0xd9c7a0),
    canvas2: std(0xcdb88c), pine: std(0x2f5d50), water: std(0x7fb3c8, { roughness: 0.5 }), black: std(0x15171c),
    fish: std(0xa9c9d9), gold: std(0xe0a530), ember: std(0xb5452f), sack: std(0xb59a6a), sackFish: std(0x7fa3b5), sackMeal: std(0xd18a3c),
    glow: std(0xffb347, { emissive: 0xffb347, emissiveIntensity: 0.3 }),
    vcol: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0 }),
    skin: std(0xf0c8a0), shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
    ice: std(0xdff0f7, { roughness: 0.4 }), invisible: new THREE.MeshBasicMaterial({ visible: false }),
    pond: std(0x4c9ab8, { roughness: 0.3 }), bobber: std(0xe0452f, { emissive: 0x401008, emissiveIntensity: 0.35 }),
    fishShadow: new THREE.MeshBasicMaterial({ color: 0x1f5a74, transparent: true, opacity: 0.4, depthWrite: false }),
  };
  const COATS = [0xc8553d, 0x3d7a9e, 0xd9a441, 0x6a9955, 0x8e5ca8].map((c) => std(c));
  const HATS = [0x5a3a1e, 0xb5452f, 0x2f5d50, 0xd9c7a0].map((c) => std(c));
  const GEO = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl5: new THREE.CylinderGeometry(1, 1, 1, 5), cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
    cyl7: new THREE.CylinderGeometry(1, 1, 1, 7), cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
    cyl10: new THREE.CylinderGeometry(1, 1, 1, 10), cyl12: new THREE.CylinderGeometry(1, 1, 1, 12),
    cone4: new THREE.ConeGeometry(1, 1, 4), cone5: new THREE.ConeGeometry(1, 1, 5), cone8: new THREE.ConeGeometry(1, 1, 8),
    sphere: new THREE.SphereGeometry(1, 6, 4), ico: new THREE.IcosahedronGeometry(1, 0),
    circle8: new THREE.CircleGeometry(1, 8),
  };

  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
  const _c = new THREE.Color();
  // position-hashed vertex jitter (shared vertices move together -> no cracks)
  function hash3(x, y, z, seed) {
    let h = (Math.round(x * 100) * 73856093) ^ (Math.round(y * 100) * 19349663) ^ (Math.round(z * 100) * 83492791) ^ (seed * 2654435761);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function jit(geo, amt, seed, keepTop) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (keepTop !== undefined && y >= keepTop) continue;
      p.setXYZ(i, x + (hash3(x, y, z, seed) - 0.5) * 2 * amt, y + (hash3(x, y, z, seed + 7) - 0.5) * 2 * amt, z + (hash3(x, y, z, seed + 13) - 0.5) * 2 * amt);
    }
    g.computeVertexNormals();
    return g;
  }
  function mergeParts(parts) {
    const P = [], N = [], C = [];
    for (const p of parts) {
      const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
      _e.set(...(p.rot || [0, 0, 0])); _q.setFromEuler(_e);
      _m4.compose(_v.set(...(p.pos || [0, 0, 0])), _q, _s.set(...(p.scl || [1, 1, 1])));
      g.applyMatrix4(_m4); g.computeVertexNormals();
      const pa = g.attributes.position.array, na = g.attributes.normal.array;
      _c.set(p.color === undefined ? 0xffffff : p.color);
      for (let i = 0; i < pa.length; i++) { P.push(pa[i]); N.push(na[i]); }
      for (let i = 0; i < pa.length / 3; i++) C.push(_c.r, _c.g, _c.b);
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    return out;
  }
  function gableGeo(l, w, h) { // ridge along x
    const A = [-l, 0, -w], B = [l, 0, -w], Cc = [l, 0, w], D = [-l, 0, w], R1 = [-l, h, 0], R2 = [l, h, 0];
    const tris = [[A, R2, B], [A, R1, R2], [D, Cc, R2], [D, R2, R1], [A, D, R1], [B, R2, Cc]];
    const pos = []; for (const t of tris) for (const v of t) pos.push(...v);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }
  GEO.roofLumber = gableGeo(1.65, 1.35, 0.95);
  GEO.roofShed = gableGeo(1.25, 1.05, 0.6);
  // pine (trunk + 3 jittered cones, vertex coloured)
  GEO.pine = mergeParts([
    { geo: GEO.cyl5, pos: [0, 0.3, 0], scl: [0.13, 0.6, 0.13], color: 0x5a3a1e },
    { geo: jit(GEO.cone5, 0.06, 1), pos: [0, 1.0, 0], scl: [0.95, 1.2, 0.95], color: 0x2f5d50 },
    { geo: jit(GEO.cone5, 0.06, 2), pos: [0, 1.65, 0], scl: [0.74, 1.05, 0.74], color: 0x37695a },
    { geo: jit(GEO.cone5, 0.05, 3), pos: [0, 2.25, 0], scl: [0.48, 0.9, 0.48], color: 0x3f7765 },
  ]);
  GEO.rock = jit(GEO.ico, 0.22, 5);
  GEO.mound = jit(GEO.ico, 0.18, 9);

  // Tool geometries (vertex-coloured, held in right hand, pointing along arm -y, blade toward +z)
  GEO.axe = mergeParts([
    { geo: GEO.box, pos: [0, -0.22, 0.02], scl: [0.04, 0.42, 0.04], color: 0x8b5a2b },
    { geo: GEO.box, pos: [0, -0.4, 0.1], scl: [0.04, 0.12, 0.16], color: 0x9aa3ad },
  ]);
  // Fishing rod: long thin rod pointing along +z of the tool (tip at z = 1.15), tilted up in the hand (see updateUnits)
  GEO.rod = mergeParts([
    { geo: GEO.box, pos: [0, 0, 0.1], scl: [0.05, 0.05, 0.28], color: 0x6b4423 },
    { geo: GEO.box, pos: [0, 0, 0.55], scl: [0.026, 0.026, 0.7], color: 0xcaa46a },
    { geo: GEO.box, pos: [0, 0, 0.98], scl: [0.016, 0.016, 0.34], color: 0xe6d3a3 },
    { geo: GEO.sphere, pos: [0.045, -0.05, 0.2], scl: [0.04, 0.04, 0.04], color: 0x2a2f36 },
  ]);
  // Low-poly fish (head toward +z), two colourways
  const makeFish = (body, belly) => mergeParts([
    { geo: GEO.sphere, pos: [0, 0, 0], scl: [0.075, 0.085, 0.21], color: body },
    { geo: GEO.sphere, pos: [0, -0.03, 0.02], scl: [0.06, 0.05, 0.17], color: belly },
    { geo: GEO.cone4, pos: [0, 0, -0.27], rot: [PI / 2, 0, 0], scl: [0.025, 0.2, 0.17], color: body },
    { geo: GEO.cone4, pos: [0, 0.09, -0.02], rot: [0, 0, 0], scl: [0.02, 0.12, 0.14], color: body },
  ]);
  GEO.fishA = makeFish(0x7fa3b5, 0xdfe9ee);
  GEO.fishB = makeFish(0xe0925a, 0xf3d9b8);
  GEO.ladle = mergeParts([
    { geo: GEO.box, pos: [0, -0.2, 0.05], scl: [0.04, 0.4, 0.04], color: 0x5a3a1e },
    { geo: GEO.sphere, pos: [0, -0.42, 0.06], scl: [0.09, 0.07, 0.09], color: 0xaab0b8 },
  ]);
  GEO.eyes = mergeParts([
    { geo: GEO.box, pos: [-0.09, 0, 0], scl: [0.05, 0.06, 0.03], color: 0x111111 },
    { geo: GEO.box, pos: [0.09, 0, 0], scl: [0.05, 0.06, 0.03], color: 0x111111 },
  ]);

  const mk = (geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    if (shadow) { m.castShadow = true; m.receiveShadow = true; }
    return m;
  };

  // =====================================================================
  // Island, sea, props
  // =====================================================================
  const world = new THREE.Group(); scene.add(world);
  // slab: top face flat (snow), jittered sides (rock)
  const slabGeo = jit(new THREE.CylinderGeometry(14, 13.2, 2, 8, 1), 0.18, 21, -0.01);
  const slab = new THREE.Mesh(slabGeo, MAT.rock);
  // re-split into top/side by face normal: use a second thin top disc for snow instead
  slab.position.y = -1; slab.castShadow = true; slab.receiveShadow = true; world.add(slab);
  const topGeo = new THREE.CylinderGeometry(14, 14, 0.06, 8, 1);
  const top = new THREE.Mesh(topGeo, MAT.snow);
  top.position.y = 0; top.receiveShadow = true; world.add(top);
  const skirt = new THREE.Mesh(jit(new THREE.CylinderGeometry(13.1, 6.5, 4.2, 8, 1), 0.5, 33), MAT.darkRock);
  skirt.position.y = -4.1; skirt.castShadow = true; skirt.receiveShadow = true; world.add(skirt);
  // sea
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: 0x7fb3c8, roughness: 0.55, metalness: 0 }));
  sea.rotation.x = -PI / 2; sea.position.y = -3; sea.receiveShadow = true; scene.add(sea);
  // ice floes
  const floes = [];
  for (let i = 0; i < 9; i++) {
    const a = VR() * TAU, r = 18 + VR() * 14;
    const f = new THREE.Mesh(jit(GEO.cyl6, 0.08, 40 + i), MAT.ice);
    f.scale.set(1.2 + VR() * 1.8, 0.35, 1.2 + VR() * 1.8);
    f.position.set(Math.cos(a) * r, -3 + 0.05, Math.sin(a) * r); f.rotation.y = VR() * TAU;
    f.receiveShadow = true; scene.add(f); floes.push({ m: f, ph: VR() * TAU, y0: f.position.y });
  }
  // plaza
  const plaza = mk(GEO.cyl10, MAT.stone, 0, 0.06, 0, 3.5, 0.12, 3.5); plaza.castShadow = false; world.add(plaza);
  const plazaRing = mk(GEO.cyl10, MAT.rock, 0, 0.04, 0, 3.75, 0.08, 3.75); plazaRing.castShadow = false; world.add(plazaRing);

  const slotLocal = (slot) => slot; // alias for readability
  // Scatter props (pines, rocks, mounds, snow) keep clear of slot centres, tree sites, ponds and tents of EVERY slot,
  // because the player can build any type on any empty slot.
  const farFromSlots = (x, z, d) => S.slots.every((s) => {
    if (Math.hypot(s.pos.x - x, s.pos.z - z) <= d) return false;
    const pc = sim.layout.pondCenter(s);
    if (Math.hypot(pc.x - x, pc.z - z) <= POND_R + 1.0) return false;
    for (let k = 0; k < 6; k++) {
      const t = sim.layout.treeSite(s, k);
      if (Math.hypot(t.x - x, t.z - z) <= d * 0.5) return false; // big props (pines, d=4.6) keep ~2.3 from a grove tree
      const tp = sim.layout.tentPos(s, k);
      if (Math.hypot(tp.x - x, tp.z - z) <= 1.8) return false;
    }
    return true;
  });

  // pines (instanced) on the rim
  {
    const spots = [];
    let guard = 0;
    while (spots.length < 30 && guard++ < 2000) {
      const a = VR() * TAU, r = 10 + VR() * 3;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!farFromSlots(x, z, 4.6)) continue;
      if (Math.hypot(x - SPAWN_POS.x, z - SPAWN_POS.z) < 2.6) continue;
      if (spots.some((p) => Math.hypot(p.x - x, p.z - z) < 1.15)) continue;
      if (Math.hypot(x, z) > 12.4 + 0.0) { /* keep inside octagon apothem */ if (r > 12.6) continue; }
      spots.push({ x, z });
    }
    const im = new THREE.InstancedMesh(GEO.pine, MAT.vcol, spots.length);
    im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    const dummy = new THREE.Object3D();
    spots.forEach((p, i) => {
      const s = 0.75 + VR() * 0.6;
      dummy.position.set(p.x, 0, p.z); dummy.rotation.set(0, VR() * TAU, 0); dummy.scale.set(s, s * (0.9 + VR() * 0.3), s);
      dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
      _c.setRGB(0.85 + VR() * 0.25, 0.9 + VR() * 0.2, 0.85 + VR() * 0.25); im.setColorAt(i, _c);
    });
    world.add(im);
  }
  // rocks (instanced)
  {
    const spots = [];
    let guard = 0;
    while (spots.length < 15 && guard++ < 2000) {
      const a = VR() * TAU, r = 7 + VR() * 6;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!farFromSlots(x, z, 3.6)) continue;
      if (Math.hypot(x, z) < 5.2 || r > 12.6) continue;
      if (Math.hypot(x - SPAWN_POS.x, z - SPAWN_POS.z) < 2) continue;
      spots.push({ x, z });
    }
    const im = new THREE.InstancedMesh(GEO.rock, MAT.rock, spots.length);
    im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    const dummy = new THREE.Object3D();
    spots.forEach((p, i) => {
      const s = 0.35 + VR() * 0.55;
      dummy.position.set(p.x, s * 0.25, p.z); dummy.rotation.set(VR() * 0.5, VR() * TAU, VR() * 0.5); dummy.scale.set(s * 1.2, s * 0.7, s);
      dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
      const v = 0.75 + VR() * 0.5; _c.setRGB(v, v, v * 1.05); im.setColorAt(i, _c);
    });
    world.add(im);
  }
  // snow mounds + patches
  {
    const mounds = new THREE.InstancedMesh(GEO.mound, MAT.snow, 14);
    mounds.receiveShadow = true; mounds.castShadow = true; mounds.frustumCulled = false;
    const dummy = new THREE.Object3D(); let n = 0, guard = 0;
    while (n < 14 && guard++ < 500) {
      const a = VR() * TAU, r = 6 + VR() * 6.5;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!farFromSlots(x, z, 3.4) || r > 12.5) continue;
      const s = 0.8 + VR() * 1.1;
      dummy.position.set(x, -0.05, z); dummy.rotation.set(0, VR() * TAU, 0); dummy.scale.set(s, s * 0.32, s);
      dummy.updateMatrix(); mounds.setMatrixAt(n, dummy.matrix);
      const v = 0.95 + VR() * 0.1; _c.setRGB(v, v, v); mounds.setColorAt(n, _c); n++;
    }
    mounds.count = n; world.add(mounds);
    const patchMat = std(0xcfdbe3);
    for (let i = 0; i < 10; i++) {
      const a = VR() * TAU, r = 4.5 + VR() * 8;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!farFromSlots(x, z, 2.6) || r > 12.4) continue;
      const p = mk(GEO.circle8, patchMat, x, 0.045, z, 0.8 + VR() * 1.2, 1, 0.8 + VR() * 1.2, false);
      p.rotation.x = -PI / 2; p.receiveShadow = true; world.add(p);
    }
  }
  // stockpile (crate pile) + lantern
  {
    const g = new THREE.Group();
    g.add(mk(GEO.box, MAT.wood, 0.45, 0.3, 0.2, 0.6, 0.6, 0.6));
    g.add(mk(GEO.box, MAT.woodL, -0.35, 0.3, 0.4, 0.6, 0.6, 0.6));
    g.add(mk(GEO.box, MAT.wood, 0.1, 0.3, -0.5, 0.6, 0.6, 0.6));
    g.add(mk(GEO.box, MAT.woodL, 0.1, 0.85, 0.25, 0.5, 0.5, 0.5));
    g.add(mk(GEO.cyl7, MAT.darkWood, -0.7, 0.3, -0.35, 0.26, 0.6, 0.26));
    for (let i = 0; i < 4; i++) { const l = mk(GEO.cyl5, MAT.wood, 0.9, 0.12 + (i > 2 ? 0.2 : 0), -0.4 + i * 0.22 - (i > 2 ? 0.7 : 0), 0.1, 0.9, 0.1); l.rotation.x = PI / 2; g.add(l); }
    g.add(mk(GEO.cyl5, MAT.darkWood, -0.95, 0.7, 0.75, 0.04, 1.4, 0.04));
    g.add(mk(GEO.sphere, MAT.glow, -0.95, 1.45, 0.75, 0.13, 0.13, 0.13, false));
    g.rotation.y = 0.4;
    world.add(g);
  }
  // eating ring stools
  {
    const im = new THREE.InstancedMesh(GEO.cyl6, MAT.wood, 18);
    im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    const dummy = new THREE.Object3D();
    sim.layout.eatSpots.forEach((p, i) => {
      dummy.position.set(p.x, 0.11, p.z); dummy.rotation.set(0, i, 0); dummy.scale.set(0.2, 0.22, 0.2);
      dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
      const v = 0.85 + VR() * 0.3; _c.setRGB(v, v, v); im.setColorAt(i, _c);
    });
    world.add(im);
  }

  // =====================================================================
  // Particles (pooled sprites, no per-frame allocation)
  // =====================================================================
  function canvasTex(w, h, draw) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d'); draw(ctx, w, h);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const FONT = 'system-ui, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  const TEX = {};
  TEX.soft = canvasTex(64, 64, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  TEX.spark = canvasTex(64, 64, (c, w, h) => {
    c.translate(w / 2, h / 2); c.fillStyle = '#fff'; c.beginPath();
    for (let i = 0; i < 8; i++) { const r = i % 2 ? 7 : 30, a = i * PI / 4; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.closePath(); c.fill();
  });
  TEX.z = canvasTex(64, 64, (c, w, h) => {
    c.font = `bold 52px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 6; c.strokeStyle = 'rgba(20,30,70,0.9)'; c.strokeText('Z', w / 2, h / 2 + 3);
    c.fillStyle = '#e8f0ff'; c.fillText('Z', w / 2, h / 2 + 3);
  });
  TEX.plus = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = 'rgba(255,179,71,0.95)'; c.beginPath(); c.arc(64, 64, 52, 0, TAU); c.fill();
    c.fillStyle = '#2a1a05'; c.fillRect(34, 56, 60, 16); c.fillRect(56, 34, 16, 60);
  });
  const labelCache = new Map();
  function labelTex(text) {
    let t = labelCache.get(text);
    if (!t) {
      t = canvasTex(160, 64, (c, w, h) => {
        c.font = `bold 38px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineWidth = 7; c.strokeStyle = 'rgba(20,24,32,0.9)'; c.strokeText(text, w / 2, h / 2);
        c.fillStyle = '#ffe2a8'; c.fillText(text, w / 2, h / 2);
      });
      labelCache.set(text, t);
    }
    return t;
  }
  const emoteTex = {};
  function makeEmote(key, glyph, color) {
    emoteTex[key] = canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = 'rgba(255,255,255,0.93)'; c.strokeStyle = 'rgba(30,36,48,0.9)'; c.lineWidth = 6;
      c.beginPath(); c.arc(64, 60, 50, 0, TAU); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(52, 104); c.lineTo(64, 122); c.lineTo(76, 104); c.closePath(); c.fill();
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `bold 70px ${FONT}`; c.fillStyle = color || '#222';
      c.fillText(glyph, 64, 64);
    });
  }
  makeEmote('wood', '🪵'); makeEmote('fish', '🐟'); makeEmote('meals', '🍲'); makeEmote('zzz', 'Zz', '#3a5aa8');
  makeEmote('!', '!', '#d9722a'); makeEmote('?', '?', '#3a6aa8'); makeEmote('sad', '😞');

  const POOL = 360;
  const parts = [];
  for (let i = 0; i < POOL; i++) {
    const mat = new THREE.SpriteMaterial({ map: TEX.soft, transparent: true, depthWrite: false, fog: false, opacity: 0 });
    const sp = new THREE.Sprite(mat); sp.visible = false; sp.renderOrder = 10; scene.add(sp);
    parts.push({ sp, mat, life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 1, s1: 1, a0: 1, g: 0, sy: 1 });
  }
  let pCursor = 0;
  function spawnP(map, x, y, z, vx, vy, vz, life, s0, s1, a0, hex, grav, aspect) {
    let p = null;
    for (let k = 0; k < POOL; k++) { const q = parts[(pCursor + k) % POOL]; if (q.life <= 0) { p = q; pCursor = (pCursor + k + 1) % POOL; break; } }
    if (!p) { p = parts[pCursor]; pCursor = (pCursor + 1) % POOL; }
    p.mat.map = map; p.mat.color.setHex(hex); p.mat.opacity = a0;
    p.sp.position.set(x, y, z); p.sp.visible = true; p.sp.scale.set(s0 * (aspect || 1), s0, 1);
    p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.max = life; p.s0 = s0; p.s1 = s1; p.a0 = a0; p.g = grav || 0; p.sy = aspect || 1;
  }
  function updateParticles(dt) {
    for (let i = 0; i < POOL; i++) {
      const p = parts[i]; if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.sp.visible = false; p.mat.opacity = 0; continue; }
      const k = 1 - p.life / p.max;
      p.vy += p.g * dt;
      p.sp.position.x += p.vx * dt; p.sp.position.y += p.vy * dt; p.sp.position.z += p.vz * dt;
      const s = lerp(p.s0, p.s1, k); p.sp.scale.set(s * p.sy, s, 1);
      p.mat.opacity = p.a0 * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
    }
  }
  const burstSpark = (x, y, z, n) => {
    for (let i = 0; i < n; i++) {
      const a = VR() * TAU, sp = 1 + VR() * 2.2;
      spawnP(TEX.spark, x, y, z, Math.cos(a) * sp, 2 + VR() * 2.5, Math.sin(a) * sp, 0.9 + VR() * 0.5, 0.35, 0.1, 1, i % 2 ? 0xffd27a : 0xffb347, -5);
    }
  };
  const burstDust = (x, z, hex) => {
    for (let i = 0; i < 4; i++) {
      const a = VR() * TAU;
      spawnP(TEX.soft, x, 0.12, z, Math.cos(a) * 0.7, 0.5 + VR() * 0.5, Math.sin(a) * 0.7, 0.55, 0.22, 0.6, 0.7, hex, -0.5);
    }
  };

  // =====================================================================
  // Buildings
  // =====================================================================
  const toLocal = (slot, p) => {
    const dx = p.x - slot.pos.x, dz = p.z - slot.pos.z;
    return { x: -(dx * slot.perp.x + dz * slot.perp.z), z: dx * slot.dir.x + dz * slot.dir.z };
  };
  const pineMesh = (x, z, s, ry) => { const m = new THREE.Mesh(GEO.pine, MAT.vcol); m.position.set(x, 0, z); m.scale.setScalar(s); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; return m; };
  const log = (g, mat, x, y, z, len, r, axis) => {
    const m = mk(GEO.cyl5, mat, x, y, z, r, len, r);
    if (axis === 'x') m.rotation.z = PI / 2; else if (axis === 'z') m.rotation.x = PI / 2;
    g.add(m); return m;
  };
  function addFlag(g, x, z, L) {
    g.add(mk(GEO.cyl5, MAT.darkWood, x, 0.9, z, 0.04, 1.8, 0.04));
    g.add(mk(GEO.box, MAT.ember, x + 0.32, 1.52, z, 0.6, 0.34, 0.03));
    for (let k = 0; k < L; k++) g.add(mk(GEO.box, MAT.gold, x, 0.35 + k * 0.17, z, 0.11, 0.06, 0.11));
  }
  const smokeSpots = []; // {root, lx, ly, lz}
  const pondFish = []; // {root, grp, a, r, sp}  fish shadows circling in the pond
  function buildLumber(g, L) {
    for (let r = 0; r < 5; r++) {
      const y = 0.16 + 0.3 * r, mat = r % 2 ? MAT.wood : MAT.woodL;
      log(g, mat, 0, y, -1, 2.6, 0.16, 'x'); log(g, mat, 0, y, 1, 2.6, 0.16, 'x');
      log(g, mat, -1.25, y, 0, 2.1, 0.16, 'z'); log(g, mat, 1.25, y, 0, 2.1, 0.16, 'z');
    }
    g.add(mk(GEO.box, MAT.darkWood, 0, 0.55, -1.12, 0.5, 1.1, 0.1));
    g.add(mk(GEO.box, MAT.glow, 0.85, 0.95, -1.14, 0.3, 0.3, 0.04, false));
    g.add(mk(GEO.roofLumber, MAT.roof, 0, 1.6, 0));
    // chopping block + axe
    g.add(mk(GEO.cyl6, MAT.woodL, 0, 0.19, 3.0, 0.28, 0.38, 0.28));
    const axe = mk(GEO.box, MAT.darkWood, 0.05, 0.5, 3.0, 0.04, 0.3, 0.04); axe.rotation.z = 0.5; g.add(axe);
    // log pile grows with L
    const n = 2 + 2 * L, layers = [4, 3, 3, 2]; let k = 0;
    for (let ly = 0; ly < layers.length && k < n; ly++) for (let i = 0; i < layers[ly] && k < n; i++, k++)
      log(g, k % 2 ? MAT.wood : MAT.woodL, -2.6 + (i - (layers[ly] - 1) / 2) * 0.28, 0.13 + ly * 0.24, -0.4, 1.2, 0.13, 'z');
    // (the choppable trees live in the grove, see makeTree: they fall and grow back)
    addFlag(g, -2.3, -2.0, L);
  }
  // Fishing Dock = shed + drying racks + a stone-rimmed pond (centre POND_Z out along +z) that the fishermen fish in.
  function buildDock(g, L, root) {
    // shed (door faces the plaza at -z)
    g.add(mk(GEO.box, MAT.wood, 0, 0.65, -0.5, 2.1, 1.3, 1.4));
    g.add(mk(GEO.box, MAT.darkWood, 0, 0.5, -1.22, 0.5, 1.0, 0.06));
    g.add(mk(GEO.box, MAT.glow, 0.75, 0.9, -1.22, 0.28, 0.28, 0.04, false));
    g.add(mk(GEO.roofShed, MAT.roof, 0, 1.3, -0.5, 1, 1, 0.72));
    g.add(mk(GEO.cyl7, MAT.wood, 1.6, 0.3, -1.4, 0.28, 0.6, 0.28));
    g.add(mk(GEO.cyl7, MAT.darkWood, 1.35, 0.3, -0.75, 0.26, 0.6, 0.26));
    // drying racks (+1 per level) beside the shed
    for (let i = 0; i < L; i++) {
      const z = -1.5 + i * 0.45;
      for (const x of [-2.0, -2.6]) g.add(mk(GEO.cyl5, MAT.darkWood, x, 0.45, z, 0.035, 0.9, 0.035));
      const bar = mk(GEO.cyl5, MAT.wood, -2.3, 0.9, z, 0.025, 0.7, 0.025); bar.rotation.z = PI / 2; g.add(bar);
      for (let f = 0; f < 3; f++) g.add(mk(GEO.box, MAT.fish, -2.08 - f * 0.22, 0.74, z, 0.05, 0.28, 0.07));
    }
    // pond
    const cz = POND_Z, R = POND_R;
    const water = mk(GEO.cyl12, MAT.pond, 0, 0.07, cz, R, 0.1, R, false); water.receiveShadow = true; g.add(water);
    for (let i = 0; i < 20; i++) {
      const a = i / 20 * TAU + 0.2, rr = R + 0.02 + (i % 3) * 0.04, s = 0.19 + ((i * 37) % 10) / 100;
      const st = mk(GEO.rock, i % 3 ? MAT.rock : MAT.stone, Math.cos(a) * rr, 0.09, cz + Math.sin(a) * rr, s * 1.2, s * 0.7, s);
      st.rotation.y = a * 3; g.add(st);
    }
    for (let i = 0; i < 5; i++) { // reeds on the far shore
      const a = PI / 2 + (i - 2) * 0.3, rr = R + 0.14, h = 0.7 + ((i * 53) % 10) / 25;
      const x = Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      g.add(mk(GEO.cyl5, MAT.woodL, x, h / 2, z, 0.022, h, 0.022));
      g.add(mk(GEO.cyl5, MAT.darkWood, x, h, z, 0.05, 0.22, 0.05));
    }
    // fish shadows drifting under the surface
    for (let i = 0; i < 3; i++) {
      const grp = new THREE.Group(); grp.position.set(0, 0.127, cz);
      const body = new THREE.Mesh(GEO.circle8, MAT.fishShadow); body.rotation.x = -PI / 2; body.scale.set(0.3, 0.13, 1); grp.add(body);
      const tail = new THREE.Mesh(GEO.circle8, MAT.fishShadow); tail.rotation.x = -PI / 2; tail.position.x = -0.3; tail.scale.set(0.1, 0.1, 1); grp.add(tail);
      grp.renderOrder = 2; g.add(grp);
      pondFish.push({ root, grp, a: i * 2.1, r: 0.55 + i * 0.35, sp: (i % 2 ? -1 : 1) * (0.32 + i * 0.1) });
    }
    addFlag(g, -2.3, -2.4, L);
  }
  function buildCook(g, L, root) {
    const stone = mk(GEO.cyl8, MAT.stone, 0, 0.5, 0, 1.6, 1, 1.6); stone.rotation.y = PI / 8; g.add(stone);
    const upper = mk(GEO.cyl8, MAT.wood, 0, 1.55, 0, 1.4, 1.1, 1.4); upper.rotation.y = PI / 8; g.add(upper);
    const roofM = mk(GEO.cone8, MAT.roof, 0, 2.6, 0, 2.0, 1.0, 2.0); roofM.rotation.y = PI / 8; g.add(roofM);
    g.add(mk(GEO.box, MAT.darkWood, 0, 0.5, -1.5, 0.6, 0.9, 0.1));
    g.add(mk(GEO.box, MAT.glow, 0, 1.6, -1.31, 0.5, 0.5, 0.05, false));
    g.add(mk(GEO.box, MAT.stone, 0.75, 2.75, 0.55, 0.4, 1.1, 0.4));
    smokeSpots.push({ root, x: 0.75, y: 3.4, z: 0.55 });
    // cauldron + fire
    g.add(mk(GEO.sphere, MAT.black, 1.35, 0.4, -1.9, 0.45, 0.36, 0.45));
    g.add(mk(GEO.box, MAT.glow, 1.35, 0.06, -1.9, 0.34, 0.1, 0.34, false));
    for (let i = 0; i < 3; i++) { const l = mk(GEO.cyl5, MAT.darkWood, 1.35, 0.1, -1.9, 0.05, 0.6, 0.05); l.rotation.z = PI / 2; l.rotation.y = i * 1.05; g.add(l); }
    for (let i = 0; i < L - 1; i++) g.add(mk(GEO.box, i % 2 ? MAT.woodL : MAT.wood, -1.7 + (i % 2) * 0.1, 0.22 + Math.floor(i / 2) * 0.44, -1.5 - (i % 2) * 0.35, 0.44, 0.44, 0.44));
    if (L >= 3) g.add(mk(GEO.cyl7, MAT.darkWood, -1.9, 0.3, -0.3, 0.28, 0.6, 0.28));
    if (L >= 4) g.add(mk(GEO.cyl8, MAT.stone, 0, 2.15, 0, 1.55, 0.12, 1.55));
    if (L >= 5) g.add(mk(GEO.sphere, MAT.gold, 0, 3.2, 0, 0.18, 0.18, 0.18));
    addFlag(g, -2.3, -2.6, L);
  }
  function buildTents(g, L, slot) {
    for (let i = 0; i <= L; i++) {
      const lp = toLocal(slot, sim.layout.tentPos(slot, i));
      const cone = mk(GEO.cone4, i % 2 ? MAT.canvas2 : MAT.canvas, lp.x, 0.7, lp.z, 1.0, 1.4, 1.0); cone.rotation.y = PI / 4; g.add(cone);
      g.add(mk(GEO.cyl5, MAT.darkWood, lp.x, 1.55, lp.z, 0.035, 0.6, 0.035));
      g.add(mk(GEO.box, MAT.darkWood, lp.x, 0.32, lp.z - 0.62, 0.5, 0.64, 0.05));
      for (let j = 0; j < 3; j++) {
        const bp = toLocal(slot, sim.layout.bedPos(slot, i, j));
        g.add(mk(GEO.box, (i + j) % 2 ? MAT.ember : MAT.sackFish, bp.x, 0.04, bp.z, 0.34, 0.07, 0.8, false));
      }
    }
    g.add(mk(GEO.cyl5, MAT.darkWood, 2.3, 0.6, -1.5, 0.04, 1.2, 0.04));
    const lamp = mk(GEO.sphere, MAT.glow, 2.3, 1.3, -1.5, 0.15, 0.15, 0.15, false); g.add(lamp);
    addFlag(g, 1.2, -3.0, L);
  }

  const slotVis = []; // per slot
  const hitMeshes = [];
  const selRing = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.06, 4, 24), MAT.glow);
  selRing.rotation.x = PI / 2; selRing.position.y = 0.1; selRing.visible = false; scene.add(selRing);

  S.slots.forEach((slot) => {
    const root = new THREE.Group();
    root.position.set(slot.pos.x, 0, slot.pos.z);
    root.rotation.y = Math.atan2(slot.dir.x, slot.dir.z);
    world.add(root);
    const content = new THREE.Group(); root.add(content);
    // empty-slot visual
    const empty = new THREE.Group(); root.add(empty);
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8;
      const st = mk(GEO.cyl5, MAT.darkWood, Math.cos(a) * 2.0, 0.28, Math.sin(a) * 2.0, 0.06, 0.6, 0.06);
      st.rotation.set((VR() - 0.5) * 0.3, 0, (VR() - 0.5) * 0.3); empty.add(st);
    }
    const plusMat = new THREE.SpriteMaterial({ map: TEX.plus, transparent: true, depthWrite: false, fog: false });
    const plus = new THREE.Sprite(plusMat); plus.scale.set(1.1, 1.1, 1); plus.position.set(0, 1.9, 0); plus.renderOrder = 9; empty.add(plus);
    const hit = new THREE.Mesh(GEO.box, MAT.invisible);
    hit.userData.slotId = slot.id; root.add(hit); hitMeshes.push(hit);
    slotVis[slot.id] = { root, content, empty, plus, hit, level: 0, type: null, popT: 99 };
  });

  function setHit(v, b, slot) {
    // local-space box: x = -perp axis, z = outward
    let cx = 0, cz = 0.2, w = 4.6, d = 4.6;
    if (!b) { w = 4.2; d = 4.2; }
    else if (b.type === 'dock') { cz = 1.45; d = 7.4; w = 6.4; }
    else if (b.type === 'lumber') { cz = 1.4; d = 7.2; w = 6.4; }
    else if (b.type === 'tent') { const mid = toLocal(slot, sim.layout.tentPos(slot, b.level / 2)); cx = mid.x; w = 1.5 * b.level + 2.6; d = 3.6; cz = 0.5; }
    v.hit.position.set(cx, 1.4, cz); v.hit.scale.set(w, 2.8, d);
  }
  function rebuildVisual(b) {
    const slot = S.slots[b.slot], v = slotVis[b.slot];
    for (let i = smokeSpots.length - 1; i >= 0; i--) if (smokeSpots[i].root === v.root) smokeSpots.splice(i, 1);
    for (let i = pondFish.length - 1; i >= 0; i--) if (pondFish[i].root === v.root) pondFish.splice(i, 1);
    v.content.clear();
    if (b.type === 'lumber') buildLumber(v.content, b.level);
    else if (b.type === 'dock') buildDock(v.content, b.level, v.root);
    else if (b.type === 'cook') buildCook(v.content, b.level, v.root);
    else buildTents(v.content, b.level, slot);
    v.level = b.level; v.type = b.type; v.empty.visible = false; setHit(v, b, slot);
  }
  function syncBuildings() {
    const allBuilt = TYPES.every((t) => sim.byType(t));
    for (const slot of S.slots) {
      const v = slotVis[slot.id];
      if (slot.building == null) {
        if (v.type) { v.content.clear(); v.type = null; v.level = 0; }
        v.empty.visible = true; v.plus.visible = !allBuilt; setHit(v, null, slot);
      } else {
        const b = sim.bldg(slot.building);
        if (v.type !== b.type || v.level !== b.level) rebuildVisual(b);
        if (b.type === 'lumber') ensureGrove(b);
      }
    }
  }
  function popSlot(slotId) { slotVis[slotId].popT = 0; }

  // =====================================================================
  // Groves: choppable trees that fall and grow back (timers run on game hours, so pause / speed just work)
  // =====================================================================
  // Game hours: bare stump, then sapling -> full tree (about 12 s at 1x for a level 1 camp). Measured gaps between
  // two harvests of the same tree are >= ~3.8 h, so a regrown tree is normally waiting; growth is shortened a
  // little per camp level because higher levels cycle faster.
  const STUMP_H = 0.8, GROW_H = 2.4;
  const groves = new Map();          // lumber building id -> { trees: [6] } (one tree per work slot)
  const _qa = new THREE.Quaternion(), _ax = new THREE.Vector3();
  function makeTree(x, z, k) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0, z); world.add(pivot);
    const mesh = new THREE.Mesh(GEO.pine, MAT.vcol); mesh.castShadow = true; mesh.receiveShadow = true; pivot.add(mesh);
    world.add(mk(GEO.cyl6, MAT.woodL, x, 0.1, z, 0.17, 0.2, 0.17));          // stump
    world.add(mk(GEO.cyl6, MAT.canvas, x, 0.205, z, 0.13, 0.02, 0.13, false)); // cut face
    const base = 0.85 + VR() * 0.25;
    mesh.rotation.y = VR() * TAU; mesh.scale.setScalar(base);
    return { k, x, z, pivot, mesh, base, state: 'grown', growth: 1, fellH: 0, t: 0, shake: 99, fx: 1, fz: 0, ax: 0, az: -1, stumpH: STUMP_H, growH: GROW_H };
  }
  function ensureGrove(b) {
    if (groves.has(b.id)) return;
    const slot = S.slots[b.slot], trees = [];
    for (let k = 0; k < 6; k++) { const p = sim.layout.treeSite(slot, k); trees.push(makeTree(p.x, p.z, k)); }
    groves.set(b.id, { trees });
  }
  const treeFor = (e) => { const gr = groves.get(e.building.id); return gr ? gr.trees[((e.unit.jobSlot % 6) + 6) % 6] : null; };
  function aimTree(t, u) { // direction lumberjack -> tree; the tree tips toward it
    let dx = t.x - u.pos.x, dz = t.z - u.pos.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    t.fx = dx; t.fz = dz; t.ax = dz; t.az = -dx;
  }
  function onChop(e) { // axe hits the trunk: shake, wood chips, a little snow from the crown
    const t = treeFor(e); if (!t) return;
    aimTree(t, e.unit);
    if (t.state === 'grown') {
      t.shake = 0;
      for (let i = 0; i < 2; i++) spawnP(TEX.soft, t.x + (VR() - 0.5) * 0.8, 1.9 + VR() * 0.5, t.z + (VR() - 0.5) * 0.8, 0, -0.4, 0, 0.9, 0.22, 0.5, 0.7, 0xffffff, -1.2);
    }
    for (let i = 0; i < 6; i++) {
      const sp = 1.2 + VR() * 1.5;
      spawnP(TEX.soft, t.x - t.fx * 0.25, 0.5 + VR() * 0.35, t.z - t.fz * 0.25, -t.fx * sp + (VR() - 0.5) * 1.3, 1.6 + VR() * 1.6, -t.fz * sp + (VR() - 0.5) * 1.3, 0.55 + VR() * 0.3, 0.15, 0.07, 1, i % 2 ? 0xd9ab6a : 0xb98650, -9);
    }
  }
  function onFell(e) { // work cycle finished: the tree comes down
    const t = treeFor(e);
    if (!t || t.state !== 'grown' || t.growth < 1) return;
    aimTree(t, e.unit);
    t.state = 'falling'; t.t = 0; t.fellH = S.t;
    const L = (e.building && e.building.level) || 1;
    t.stumpH = STUMP_H; t.growH = GROW_H * (1 - 0.1 * (L - 1));
  }
  const easeOutBack = (g) => 1 + 2.70158 * Math.pow(g - 1, 3) + 1.70158 * Math.pow(g - 1, 2);
  function updateGroves(adt) {
    for (const gr of groves.values()) for (const t of gr.trees) {
      if (t.state === 'grown') {
        t.shake += adt;
        if (t.shake < 1.2) { _ax.set(t.ax, 0, t.az); t.pivot.quaternion.setFromAxisAngle(_ax, 0.07 * Math.exp(-5 * t.shake) * Math.sin(t.shake * 30)); }
        else if (t.shake < 99) { t.pivot.quaternion.identity(); t.shake = 99; }
      } else if (t.state === 'falling') {
        t.t += adt;
        const k = clamp(t.t, 0, 1);
        _ax.set(t.ax, 0, t.az); t.pivot.quaternion.setFromAxisAngle(_ax, (PI / 2) * k * k);
        if (t.t >= 1) {
          t.state = 'lying'; t.t = 0;
          const cx = t.x + t.fx * 1.8, cz = t.z + t.fz * 1.8;
          burstDust(t.x + t.fx * 0.9, t.z + t.fz * 0.9, 0xf2f6f8);
          for (let i = 0; i < 9; i++) spawnP(TEX.soft, cx + (VR() - 0.5) * 1.6, 0.25, cz + (VR() - 0.5) * 1.6, (VR() - 0.5) * 1.2, 0.8 + VR() * 0.8, (VR() - 0.5) * 1.2, 0.9, 0.35, 0.95, 0.75, 0xffffff, -0.6);
        }
      } else if (t.state === 'lying') {
        t.t += adt;
        const hop = t.t < 0.25 ? Math.sin(t.t / 0.25 * PI) * 0.07 : 0;
        _ax.set(t.ax, 0, t.az); t.pivot.quaternion.setFromAxisAngle(_ax, PI / 2 - hop);
        const sh = t.t < 0.5 ? 1 : clamp(1 - (t.t - 0.5) / 0.4, 0, 1);
        t.mesh.scale.setScalar(t.base * sh);
        if (t.t >= 0.9) { t.state = 'stump'; t.mesh.visible = false; t.pivot.quaternion.identity(); t.mesh.scale.setScalar(t.base); }
      } else if (t.state === 'stump') {
        if (S.t - t.fellH >= t.stumpH) { t.state = 'regrow'; t.mesh.visible = true; t.mesh.scale.setScalar(t.base * 0.12); }
      }
      if (t.state === 'regrow') {
        t.growth = clamp((S.t - t.fellH - t.stumpH) / t.growH, 0, 1);
        t.mesh.scale.setScalar(t.base * (0.12 + 0.88 * easeOutBack(t.growth)));
        if (t.growth >= 1) { t.state = 'grown'; t.shake = 99; t.mesh.scale.setScalar(t.base); }
      }
    }
  }

  // =====================================================================
  // Pond: ripples, drifting fish shadows, and the fishing gear (line, bobber, fish) each fisherman uses
  // =====================================================================
  const WATER_Y = 0.12, LINE_N = 9;
  const ripGeo = new THREE.RingGeometry(0.82, 1, 20);
  const ripples = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(ripGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -PI / 2; m.visible = false; m.renderOrder = 4; scene.add(m);
    ripples.push({ m, life: 0, max: 0.9, s: 0.5 });
  }
  let ripCursor = 0;
  function ripple(x, z, size) {
    const r = ripples[ripCursor]; ripCursor = (ripCursor + 1) % ripples.length;
    r.m.position.set(x, WATER_Y + 0.012, z); r.life = r.max = 0.9; r.s = size; r.m.visible = true;
  }
  function updateRipples(dt) {
    for (const r of ripples) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) { r.m.visible = false; continue; }
      const k = 1 - r.life / r.max;
      r.m.scale.setScalar(0.08 + r.s * k); r.m.material.opacity = 0.75 * (1 - k);
    }
  }
  function updatePondFish(t) {
    for (const f of pondFish) {
      const a = f.a + t * f.sp, sgn = f.sp < 0 ? -1 : 1;
      f.grp.position.x = Math.cos(a) * f.r; f.grp.position.z = POND_Z + Math.sin(a) * f.r;
      f.grp.rotation.y = Math.atan2(-Math.cos(a) * sgn, -Math.sin(a) * sgn);
    }
  }
  const pondPos = new Map();
  const pondOf = (b) => { let p = pondPos.get(b.id); if (!p) { p = sim.layout.pondCenter(S.slots[b.slot]); pondPos.set(b.id, p); } return p; };
  function makeGear(u) {
    const bobber = new THREE.Mesh(GEO.sphere, MAT.bobber); bobber.scale.setScalar(0.085); bobber.castShadow = true; bobber.visible = false; scene.add(bobber);
    const arr = new Float32Array(LINE_N * 3), geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3).setUsage(THREE.DynamicDrawUsage));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xf6f6f2 })); line.frustumCulled = false; line.visible = false; scene.add(line);
    const fish = new THREE.Mesh(u.id % 2 ? GEO.fishA : GEO.fishB, MAT.vcol); fish.visible = false; scene.add(fish);
    return { bobber, line, arr, fish };
  }
  const _tip = new THREE.Vector3(), _hand = new THREE.Vector3(), _bob = new THREE.Vector3(), _fp = new THREE.Vector3(), _sk = new THREE.Vector3(), _ld = new THREE.Vector3();
  const crossed = (fp, c, p, th) => fp.ok && (fp.c !== c ? p >= th : (fp.p < th && p >= th));
  // One cast-wait-bite-reel sub-cycle: c = which catch of this work cycle, p = 0..1 progress within it.
  //  0-.08 backswing | .08-.2 cast (bobber flies out) | .2-.62 wait | .62-.78 nibbling | .74-.8 hook-set |
  //  .78-.93 fish arcs out of the water into the hand | .93-1 into the basket
  function fishingFx(u, r, b, c, p) {
    const g = r.gear || (r.gear = makeGear(u)), pond = pondOf(b);
    r.root.updateMatrixWorld(true);
    r.tool.localToWorld(_tip.set(0, 0, 1.15));
    r.tool.localToWorld(_hand.set(0, 0, 0.15));
    const ang = c * 2.4 + u.id * 1.3, lr = POND_R * (0.3 + 0.3 * (0.5 + 0.5 * Math.sin(c * 1.7 + u.id * 0.9)));
    _ld.set(pond.x + Math.cos(ang) * lr, WATER_Y, pond.z + Math.sin(ang) * lr);
    const fp = r.fp;
    if (crossed(fp, c, p, 0.2)) ripple(_ld.x, _ld.z, 0.5);
    if (crossed(fp, c, p, 0.62)) ripple(_ld.x, _ld.z, 0.35);
    if (crossed(fp, c, p, 0.78)) {
      ripple(_ld.x, _ld.z, 0.85);
      for (let i = 0; i < 7; i++) {
        const a = VR() * TAU, sp = 0.4 + VR() * 0.7;
        spawnP(TEX.soft, _ld.x, WATER_Y + 0.05, _ld.z, Math.cos(a) * sp, 2.2 + VR() * 1.4, Math.sin(a) * sp, 0.6, 0.12, 0.05, 0.9, 0xe4f6ff, -9);
      }
    }
    fp.c = c; fp.p = p; fp.ok = true;
    let showFish = false;
    if (p < 0.12) { _bob.set(_tip.x + Math.sin(r.t * 5 + u.id) * 0.03, _tip.y - 0.3, _tip.z); }
    else if (p < 0.2) { const s = (p - 0.12) / 0.08; _bob.lerpVectors(_tip, _ld, s); _bob.y += Math.sin(s * PI) * 0.9; }
    else if (p < 0.78) {
      _bob.copy(_ld); _bob.y = WATER_Y + 0.03 + Math.sin(r.t * 3 + u.id) * 0.012;
      if (p >= 0.62) { _bob.y -= 0.06 * Math.abs(Math.sin(r.t * 24)); _bob.x += Math.sin(r.t * 40) * 0.012; }
    } else if (p < 0.93) {
      showFish = true;
      const s = (p - 0.78) / 0.15, ss = s * s * (3 - 2 * s);
      _fp.lerpVectors(_ld, _hand, ss); _fp.y += Math.sin(Math.min(1, s * 1.15) * PI) * 0.85;
      _bob.lerpVectors(_fp, _tip, 0.22);
    } else {
      const s = (p - 0.93) / 0.07;
      r.model.localToWorld(_sk.set(0, 0.55, -0.3));
      _fp.lerpVectors(_hand, _sk, s); showFish = s < 0.85;
      _bob.set(_tip.x, _tip.y - 0.3, _tip.z);
    }
    const sag = p < 0.12 ? 0 : p < 0.2 ? 0.1 : p < 0.78 ? 0.16 : 0.04;
    for (let i = 0; i < LINE_N; i++) {
      const f = i / (LINE_N - 1);
      g.arr[i * 3] = _tip.x + (_bob.x - _tip.x) * f;
      g.arr[i * 3 + 1] = _tip.y + (_bob.y - _tip.y) * f - sag * 4 * f * (1 - f);
      g.arr[i * 3 + 2] = _tip.z + (_bob.z - _tip.z) * f;
    }
    g.line.geometry.attributes.position.needsUpdate = true;
    g.bobber.position.copy(_bob); g.bobber.visible = true; g.line.visible = true;
    g.fish.visible = showFish;
    if (showFish) {
      g.fish.position.copy(_fp); g.fish.lookAt(_hand.x, _hand.y, _hand.z);
      g.fish.rotateZ(Math.sin(r.t * 30) * 0.7);
      g.fish.scale.setScalar(p < 0.93 ? 1 : 1 - (p - 0.93) / 0.07 * 0.7);
    }
    r.bite = p >= 0.62 && p < 0.78;
  }
  function hideGear(r) {
    const g = r.gear; if (!g || !g.line.visible) return;
    g.line.visible = false; g.bobber.visible = false; g.fish.visible = false; r.fp.ok = false; r.bite = false;
  }

  // =====================================================================
  // Units
  // =====================================================================
  const rigs = new Map();
  function createRig(u) {
    const root = new THREE.Group(); root.rotation.order = 'YXZ';
    const model = new THREE.Group(); model.scale.setScalar(0.85); model.rotation.order = 'YXZ'; root.add(model);
    const coat = COATS[u.id % COATS.length], hat = HATS[(u.id * 3) % HATS.length];
    const body = mk(GEO.cyl6, coat, 0, 0.505, 0, 0.22, 0.45, 0.22); model.add(body);
    const headG = new THREE.Group(); headG.position.set(0, 0.93, 0); model.add(headG);
    const head = mk(GEO.sphere, MAT.skin, 0, 0, 0, 0.26, 0.26, 0.26); headG.add(head);
    const eyes = new THREE.Mesh(GEO.eyes, MAT.black); eyes.position.set(0, 0.03, 0.235); headG.add(eyes);
    const hatM = mk(GEO.cone5, hat, 0, 0.27, 0, 0.27, 0.32, 0.27); hatM.rotation.z = 0.12; headG.add(hatM);
    const limb = (x, y, mat) => {
      const pv = new THREE.Group(); pv.position.set(x, y, 0);
      pv.add(mk(GEO.box, mat, 0, -0.15, 0, 0.09, 0.3, 0.09)); model.add(pv); return pv;
    };
    const legL = limb(-0.1, 0.28, COATS[(u.id + 2) % COATS.length]), legR = limb(0.1, 0.28, COATS[(u.id + 2) % COATS.length]);
    const armL = limb(-0.29, 0.69, coat), armR = limb(0.29, 0.69, coat);
    const tool = new THREE.Mesh(GEO.axe, MAT.vcol); tool.position.set(0, -0.28, 0.04); tool.castShadow = true; armR.add(tool);
    const sack = mk(GEO.ico, MAT.sack, 0, 0.55, -0.3, 0.2, 0.22, 0.2); sack.visible = false; model.add(sack);
    const blob = new THREE.Mesh(GEO.circle8, MAT.shadow); blob.rotation.x = -PI / 2; blob.position.y = 0.025; blob.scale.setScalar(0.4); blob.renderOrder = 1; root.add(blob);
    const em = new THREE.Sprite(new THREE.SpriteMaterial({ map: emoteTex['!'], transparent: true, depthWrite: false, fog: false }));
    em.scale.set(0.7, 0.7, 1); em.position.set(0, 1.6, 0); em.visible = false; em.renderOrder = 12; root.add(em);
    scene.add(root);
    return {
      id: u.id, root, model, body, headG, legL, legR, armL, armR, tool, sack, em, blob,
      h: u.heading, phase: 0, wt: 0, t: VR() * 20, ph: VR() * TAU, toolKind: 'axe', emoteKey: '', zT: VR(),
      lean: 0, bob: 0, zo: 0, sway: 0, sq: 1, lie: 0, yoff: 0, nod: 0, lastStrike: 0, box: new THREE.Box3(),
      fp: { c: -1, p: 0, ok: false }, bite: false, gear: null,
    };
  }
  const _ease = (cur, tgt, k) => cur + (tgt - cur) * k;
  function updateUnits(adt, speedMul) {
    for (const u of S.units) {
      let r = rigs.get(u.id);
      if (!r) { r = createRig(u); rigs.set(u.id, r); }
      r.root.position.set(u.pos.x, 0, u.pos.z);
      const k12 = 1 - Math.exp(-12 * adt), k10 = 1 - Math.exp(-10 * adt);
      const targetH = u.heading + (u.state === 'SLEEP' ? PI : 0);
      r.h += wrapPi(targetH - r.h) * k10;
      r.root.rotation.y = r.h;
      r.t += adt;
      const job = u.job != null ? sim.bldg(u.job) : null;
      const jt = job ? job.type : null;
      const want = jt === 'lumber' ? 'axe' : jt === 'dock' ? 'rod' : jt === 'cook' ? 'ladle' : null;
      if (want !== r.toolKind) { r.toolKind = want; if (want) r.tool.geometry = GEO[want]; r.tool.rotation.x = want === 'rod' ? 0.3 : 0; }
      r.tool.visible = !!want && !u.carry && u.state !== 'SLEEP' && u.state !== 'EAT';
      const fishing = u.state === 'WORK' && jt === 'dock';
      let fc = 0, fpp = 0;
      let aL = 0, aR = 0, lL = 0, lR = 0, lean = 0, bob = 0, sway = 0, sq = 1, lie = 0, yoff = 0, nod = 0, armRz = 0, zo = 0;
      const t = r.t, ph = r.ph;
      if (u.state === 'SLEEP') {
        lie = -PI / 2; yoff = 0.27; zo = 0.5; aL = 0.15; aR = 0.15; sq = 1 + Math.sin(t * 1.4 + ph) * 0.025; nod = 0;
      } else if (u.state === 'EAT') {
        lL = -1.45; lR = -1.45; yoff = -0.05; aL = -0.5; aR = -1.6 + Math.sin(t * 5) * 0.3; nod = Math.sin(t * 2.5) * 0.12 + 0.05; lean = 0.05;
      } else if (u.state === 'WORK') {
        r.wt += adt * (u.workRate || 1);
        if (jt === 'cook') {
          aR = -1.0 + Math.sin(r.wt * 5) * 0.3; armRz = Math.cos(r.wt * 5) * 0.35; aL = -0.5; lean = 0.18 + Math.sin(r.wt * 5) * 0.04;
        } else if (jt === 'dock') {
          // fishing: several catches per work cycle, one per fish delivered up to a pace that stays readable
          // (at least ~0.6 s of work per catch), each cast -> wait -> bite -> reel
          const n = Math.max(1, Math.min(sim.bundleFor(job.level), Math.max(2, Math.round(u.workDur / 0.6))));
          const prog = clamp(u.workProg / Math.max(u.workDur, 0.01), 0, 0.9999) * n;
          fc = Math.floor(prog); fpp = prog - fc;
          const p = fpp;
          if (p < 0.08) { aR = lerp(-1.1, -2.4, p / 0.08); aL = -0.9; lean = -0.1; }
          else if (p < 0.2) { const q = (p - 0.08) / 0.12; aR = lerp(-2.4, -0.55, q * q); aL = lerp(-0.9, -0.4, q); lean = lerp(-0.1, 0.22, q); }
          else if (p < 0.62) { aR = -1.05 + Math.sin(r.t * 3.1) * 0.03; aL = -0.5; lean = 0.1; nod = 0.12; }
          else if (p < 0.74) { aR = -0.95 + Math.sin(r.t * 30) * 0.08; aL = -0.5; lean = 0.2; nod = 0.2; }
          else if (p < 0.8) { const q = (p - 0.74) / 0.06; aR = lerp(-1.0, -2.0, q); aL = lerp(-0.5, -1.3, q); lean = lerp(0.2, -0.2, q); }
          else if (p < 0.93) { const q = (p - 0.8) / 0.13; aR = lerp(-2.0, -1.2, q); aL = -0.9; lean = lerp(-0.2, 0.05, q); }
          else { aR = -1.0; aL = -1.0; lean = 0.05; }
        } else {
          const s = Math.pow(Math.max(0, Math.sin(r.wt * 6)), 2);
          aR = -2.4 + 1.5 * s; aL = -0.6 + s * 0.5; lean = 0.28 * s; bob = -0.02 * s; // overhead -> hits the trunk at about waist height
        }
        sq = 1 + Math.sin(t * 2 + ph) * 0.015;
      } else if (u.moving) {
        r.phase += (u.speed || 2.2) * adt * 8;
        const sw = Math.sin(r.phase) * 0.7;
        lL = sw; lR = -sw;
        if (u.carry) { aL = -1.0 + Math.sin(r.phase) * 0.06; aR = -1.0 - Math.sin(r.phase) * 0.06; lean = 0.06; }
        else { aL = -sw; aR = sw; lean = 0.1; }
        bob = Math.abs(Math.sin(r.phase)) * 0.08; sway = Math.sin(r.phase) * 0.05; sq = 1 + Math.sin(r.phase * 2) * 0.05;
      } else {
        sq = 1 + Math.sin(t * 2 + ph) * 0.02; aL = Math.sin(t * 1.3 + ph) * 0.05; aR = -aL;
        if (u.carry) { aL = -1.0; aR = -1.0; if (u.state === 'DROP') { const f = 1 - clamp(u.dropT / 0.5, 0, 1); aL = aR = -1.0 + f * 0.9; } }
        if (u.state === 'WAIT_FISH' || (u.hunger >= 100)) nod = 0.25;
      }
      r.armL.rotation.x = _ease(r.armL.rotation.x, aL, k12);
      r.armR.rotation.x = _ease(r.armR.rotation.x, aR, k12);
      r.armR.rotation.z = _ease(r.armR.rotation.z, armRz, k12);
      r.legL.rotation.x = _ease(r.legL.rotation.x, lL, k12);
      r.legR.rotation.x = _ease(r.legR.rotation.x, lR, k12);
      r.lean = _ease(r.lean, lean, k12); r.bob = _ease(r.bob, bob, k12); r.sway = _ease(r.sway, sway, k12);
      r.sq = _ease(r.sq, sq, k12); r.lie = _ease(r.lie, lie, 1 - Math.exp(-8 * adt)); r.yoff = _ease(r.yoff, yoff, k12); r.nod = _ease(r.nod, nod, k12);
      r.model.rotation.x = r.lie + r.lean; r.model.rotation.z = r.sway;
      r.model.position.y = r.yoff + r.bob; r.zo = _ease(r.zo, zo, k12); r.model.position.z = r.zo;
      const sy = 0.85 * r.sq; r.model.scale.set(0.85 / Math.sqrt(r.sq), sy, 0.85 / Math.sqrt(r.sq));
      r.headG.rotation.x = r.nod;
      if (fishing) fishingFx(u, r, job, fc, fpp); else hideGear(r);
      // sack
      if (u.carry || (u.state === 'DROP' && u.carry)) {
        r.sack.visible = true;
        r.sack.material = u.carry.res === 'wood' ? MAT.sack : u.carry.res === 'fish' ? MAT.sackFish : MAT.sackMeal;
        r.sack.scale.setScalar(u.state === 'DROP' ? 0.2 * (0.4 + 0.6 * clamp(u.dropT / 0.5, 0, 1)) / 0.2 * 0.2 : 0.2);
        r.sack.scale.y *= 1.1;
      } else r.sack.visible = false;
      // emote
      let key = '';
      if (u.emote) key = u.emote; else if (r.bite) key = '!'; else if (u.state === 'SLEEP') key = 'zzz'; else if (u.carry) key = u.carry.res;
      if (key !== r.emoteKey) {
        r.emoteKey = key;
        if (key) { r.em.material.map = emoteTex[key]; r.em.material.needsUpdate = true; }
        r.em.visible = !!key;
      }
      if (key) r.em.position.y = 1.55 + Math.sin(t * 3 + ph) * 0.04;
      r.blob.visible = u.state !== 'SLEEP';
      // sleeping Z particles
      if (u.state === 'SLEEP' && adt > 0) {
        r.zT -= adt;
        if (r.zT <= 0) { r.zT = 1.1 + VR() * 0.5; spawnP(TEX.z, u.pos.x, 0.7, u.pos.z, 0.15, 0.45, 0.1, 1.8, 0.28, 0.5, 0.9, 0xffffff, 0); }
      }
    }
  }

  // =====================================================================
  // Day / night
  // =====================================================================
  const KF = [
    { h: 0, sun: 0x4a63a8, si: 0.4, hs: 0x1b2a52, hg: 0x0b1020, hi: 0.55, bg: 0x0a1230, ex: 0.85, em: 1.0, day: 0 },
    { h: 5, sun: 0x6a78b8, si: 0.5, hs: 0x2a3a6a, hg: 0x141a30, hi: 0.6, bg: 0x1c2748, ex: 0.9, em: 0.9, day: 0 },
    { h: 7, sun: 0xffb27a, si: 1.7, hs: 0x9fb8d8, hg: 0x667788, hi: 0.85, bg: 0xc9b4a8, ex: 1.0, em: 0.3, day: 0.85 },
    { h: 12, sun: 0xfff2dc, si: 2.6, hs: 0xcfe6f5, hg: 0x8c9aa5, hi: 1.0, bg: 0xbcd6e6, ex: 1.05, em: 0.0, day: 1 },
    { h: 18, sun: 0xff9a52, si: 1.9, hs: 0xc8a6a0, hg: 0x7a7480, hi: 0.8, bg: 0xd49a7c, ex: 1.0, em: 0.4, day: 0.85 },
    { h: 20, sun: 0x5a6fb5, si: 0.6, hs: 0x26346a, hg: 0x10162c, hi: 0.55, bg: 0x131c3e, ex: 0.88, em: 0.95, day: 0.05 },
    { h: 24, sun: 0x4a63a8, si: 0.4, hs: 0x1b2a52, hg: 0x0b1020, hi: 0.55, bg: 0x0a1230, ex: 0.85, em: 1.0, day: 0 },
  ];
  KF.forEach((k) => { for (const n of ['sun', 'hs', 'hg', 'bg']) k[n + 'C'] = new THREE.Color(k[n]); });
  const cur = { sun: new THREE.Color(), hs: new THREE.Color(), hg: new THREE.Color(), bg: new THREE.Color() };
  const sunPos = new THREE.Vector3(), moonPos = new THREE.Vector3(6, 24, 6);
  let glowK = 0;
  function updateDayNight(hour) {
    let i = 0; while (i < KF.length - 2 && hour >= KF[i + 1].h) i++;
    const a = KF[i], b = KF[i + 1], f = clamp((hour - a.h) / (b.h - a.h), 0, 1), sf = f * f * (3 - 2 * f);
    cur.sun.lerpColors(a.sunC, b.sunC, sf); cur.hs.lerpColors(a.hsC, b.hsC, sf); cur.hg.lerpColors(a.hgC, b.hgC, sf); cur.bg.lerpColors(a.bgC, b.bgC, sf);
    sun.color.copy(cur.sun); sun.intensity = lerp(a.si, b.si, sf);
    hemi.color.copy(cur.hs); hemi.groundColor.copy(cur.hg); hemi.intensity = lerp(a.hi, b.hi, sf);
    scene.background.copy(cur.bg); scene.fog.color.copy(cur.bg);
    renderer.toneMappingExposure = lerp(a.ex, b.ex, sf);
    glowK = lerp(a.em, b.em, sf);
    const d = lerp(a.day, b.day, sf);
    const ang = (hour - 6) / 12 * PI;
    sunPos.set(-20 * Math.cos(ang), 4 + 22 * Math.sin(ang), 8);
    sun.position.lerpVectors(moonPos, sunPos, d);
    if (sun.position.y < 6) sun.position.y = 6;
    MAT.glow.emissiveIntensity = 0.25 + glowK * 2.6;
    plazaLight.intensity = glowK * 22;
    sea.material.color.setHex(0x7fb3c8).multiplyScalar(0.35 + 0.65 * d);
  }

  // =====================================================================
  // HUD / panels / tooltip
  // =====================================================================
  const el = {
    wood: $('v-wood'), fish: $('v-fish'), meals: $('v-meals'), pop: $('v-pop'), time: $('v-time'), sun: $('v-sun'),
    cWood: $('c-wood'), cFish: $('c-fish'), cMeals: $('c-meals'), panel: $('panel'), tip: $('tooltip'), banner: $('banner'),
  };
  let speed = 1;
  try { const sv = parseInt(localStorage.getItem('ember.speed'), 10); if ([0, 1, 2, 4].includes(sv)) speed = sv; } catch (e) { /* ignore */ }
  function setSpeed(n) {
    speed = n;
    document.querySelectorAll('#speeds button').forEach((b) => b.classList.toggle('active', +b.dataset.speed === n));
    try { localStorage.setItem('ember.speed', String(n)); } catch (e) { /* ignore */ }
  }
  document.querySelectorAll('#speeds button').forEach((b) => b.addEventListener('click', () => setSpeed(+b.dataset.speed)));
  setSpeed(speed);

  const pad2 = (n) => String(n).padStart(2, '0');
  const last = { wood: -1, fish: -1, meals: -1 };
  function flash(chip) { chip.classList.remove('flash'); void chip.offsetWidth; chip.classList.add('flash'); }
  function updateHUD() {
    const r = S.res;
    for (const [k, node, chip] of [['wood', el.wood, el.cWood], ['fish', el.fish, el.cFish], ['meals', el.meals, el.cMeals]]) {
      if (r[k] !== last[k]) { if (last[k] >= 0 && r[k] > last[k]) flash(chip); last[k] = r[k]; node.textContent = r[k]; }
    }
    el.pop.textContent = `${S.units.length}/${sim.popCap()}`;
    const h = Math.floor(S.hour), m = Math.floor((S.hour - h) * 60);
    el.time.textContent = `Day ${S.day} ${pad2(h)}:${pad2(m)}`;
    el.sun.textContent = S.hour >= 6 && S.hour < 18 ? '☀️' : '🌙';
    renderPanel();
  }

  let sel = null; // {kind:'building',id} | {kind:'slot',id}
  let lastPanelHtml = '';
  const costHtml = (c) => {
    const w = `<span class="${S.res.wood < c.wood ? 'short' : ''}">🪵 ${c.wood}</span>`;
    const f = c.fish > 0 ? ` <span class="${S.res.fish < c.fish ? 'short' : ''}">🐟 ${c.fish}</span>` : '';
    return w + f;
  };
  function outputLine(b, L) {
    if (b.type === 'lumber' || b.type === 'dock') return `Bundle ${sim.bundleFor(L)}, gather ${sim.gatherTimeFor(L).toFixed(1)}s`;
    if (b.type === 'cook') return `${sim.bundleFor(L)} fish → ${2 * sim.bundleFor(L)} meals, ${sim.cookTimeFor(L).toFixed(1)}s`;
    return `Beds ${3 * (1 + L)}, cap ${sim.capFor(L)}`;
  }
  function renderPanel() {
    let html = '';
    if (!sel) { if (el.panel.classList.contains('open')) { el.panel.classList.remove('open'); lastPanelHtml = ''; } selRing.visible = false; return; }
    if (sel.kind === 'building') {
      const b = sim.bldg(sel.id);
      if (!b) { sel = null; return; }
      const L = b.level, slots = sim.slotsFor(b.type, L);
      html += `<button class="close" data-act="close" aria-label="Close">×</button><h2>${TYPE_NAME[b.type]}</h2><div class="sub">Level ${L}/${MAX_LEVEL}</div>`;
      if (b.type === 'tent') html += `<div class="row"><span>Residents</span><span>${S.units.length}/${sim.popCap()}</span></div>`;
      else html += `<div class="row"><span>Workers</span><span>${sim.workersOf(b)}/${slots}</span></div>`;
      html += `<div class="row"><span>Output</span><span>${outputLine(b, L)}</span></div>`;
      if (L < MAX_LEVEL) {
        const c = sim.costFor(b.type, L), ok = sim.canAfford(S.res, c);
        html += `<div class="row"><span>Next</span><span>${outputLine(b, L + 1)}</span></div>`;
        html += `<button class="btn" data-act="upgrade" ${ok ? '' : 'disabled'}>Upgrade to level ${L + 1}<span class="cost">${costHtml(c)}</span></button>`;
      } else html += `<div class="maxlabel">MAX</div>`;
      const s = S.slots[b.slot]; selRing.position.set(s.pos.x, 0.1, s.pos.z); selRing.visible = true;
    } else {
      const s = S.slots[sel.id];
      const unbuilt = TYPES.filter((t) => !sim.byType(t));
      html += `<button class="close" data-act="close" aria-label="Close">×</button>`;
      if (!unbuilt.length) html += `<h2>Reserved plot</h2><div class="note">Every building type has been built. This plot is reserved for the future.</div>`;
      else {
        html += `<h2>Build</h2><div class="sub">Choose a building for this plot</div>`;
        for (const t of unbuilt) {
          const c = sim.buildCostFor(t), ok = sim.canAfford(S.res, c);
          html += `<button class="btn" data-act="build" data-type="${t}" ${ok ? '' : 'disabled'}>${TYPE_NAME[t]}<span class="cost">${costHtml(c)}</span></button>`;
        }
      }
      selRing.position.set(s.pos.x, 0.1, s.pos.z); selRing.visible = true;
    }
    if (html !== lastPanelHtml) { el.panel.innerHTML = html; lastPanelHtml = html; }
    el.panel.classList.add('open');
  }
  function select(s) { sel = s; lastPanelHtml = ''; renderPanel(); }
  el.panel.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]'); if (!t) return;
    const act = t.dataset.act;
    if (act === 'close') select(null);
    else if (act === 'upgrade' && sel && sel.kind === 'building') { const r = sim.upgrade(sel.id); if (!r.ok) flash(el.cWood); renderPanel(); }
    else if (act === 'build' && sel && sel.kind === 'slot') {
      const r = sim.build(sel.id, t.dataset.type);
      if (r.ok) select({ kind: 'building', id: r.building.id }); else renderPanel();
    }
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { select(null); el.banner.style.display = 'none'; } });
  el.banner.addEventListener('click', () => { el.banner.style.display = 'none'; });

  const STATE_NAME = {
    IDLE: 'Idle', REST: 'Resting', GO_WORK: 'Heading to work', WORK: 'Working', CARRY: 'Carrying goods', DROP: 'Dropping off',
    GO_EAT: 'Going to eat', EAT: 'Eating', GO_SLEEP: 'Heading to bed', SLEEP: 'Sleeping', GO_STOCK: 'Fetching fish', WAIT_FISH: 'Waiting for fish',
  };
  let tipUnit = null, tipPinUntil = 0;
  function renderTip(u, px, py) {
    const b = u.job != null ? sim.bldg(u.job) : null;
    el.tip.innerHTML = `<b>${u.name}</b><br>${STATE_NAME[u.state] || u.state}<br>Job: ${b ? TYPE_NAME[b.type] : 'none'}` +
      `<br>Hunger<div class="bar hunger"><i style="width:${u.hunger.toFixed(0)}%"></i></div>Energy<div class="bar"><i style="width:${u.energy.toFixed(0)}%"></i></div>`;
    el.tip.style.display = 'block';
    const w = el.tip.offsetWidth, h = el.tip.offsetHeight;
    el.tip.style.left = clamp(px + 14, 4, window.innerWidth - w - 4) + 'px';
    el.tip.style.top = clamp(py + 14, 4, window.innerHeight - h - 4) + 'px';
  }

  // =====================================================================
  // Input: pan / zoom / click / hover
  // =====================================================================
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pointers = new Map();
  let dragging = false, downX = 0, downY = 0, pinchD = 0, mouseX = -1, mouseY = -1, mouseIn = false;
  const PAN_LIMIT = 7;
  function pan(dx, dy) {
    const upp = (frustumH / camState.zoom) / viewH;
    const rx = Math.cos(YAW), rz = -Math.sin(YAW), fx = -Math.sin(YAW), fz = -Math.cos(YAW);
    camState.tx += -rx * dx * upp + fx * dy * upp / Math.sin(PITCH);
    camState.tz += -rz * dx * upp + fz * dy * upp / Math.sin(PITCH);
    const d = Math.hypot(camState.tx, camState.tz);
    if (d > PAN_LIMIT) { camState.tx *= PAN_LIMIT / d; camState.tz *= PAN_LIMIT / d; }
    updateCamera();
  }
  function zoomBy(f) { camState.zoom = clamp(camState.zoom * f, 0.6, 1.8); updateCamera(); }
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) { downX = e.clientX; downY = e.clientY; dragging = false; }
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); dragging = true; }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') { mouseX = e.clientX; mouseY = e.clientY; mouseIn = true; }
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchD > 0 && d > 0) zoomBy(d / pinchD);
      pinchD = d; return;
    }
    if (!dragging && Math.hypot(e.clientX - downX, e.clientY - downY) > 6) dragging = true;
    if (dragging) pan(dx, dy);
  });
  const endPointer = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (e.type === 'pointerup' && !dragging && pointers.size === 0) handleClick(e.clientX, e.clientY, e.pointerType);
    if (pointers.size === 0) dragging = false;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => { mouseIn = false; });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.0012)); }, { passive: false });

  function setRay(px, py) {
    ndc.set((px / viewW) * 2 - 1, -(py / viewH) * 2 + 1);
    raycaster.setFromCamera(ndc, cam);
  }
  const _box = new THREE.Box3(), _hit = new THREE.Vector3();
  function pickUnit(px, py) {
    setRay(px, py);
    let best = null, bd = 1e9;
    for (const u of S.units) {
      const lying = u.state === 'SLEEP';
      _box.min.set(u.pos.x - 0.4, 0, u.pos.z - 0.4); _box.max.set(u.pos.x + 0.4, lying ? 0.5 : 1.25, u.pos.z + 0.4);
      if (raycaster.ray.intersectBox(_box, _hit)) { const d = _hit.distanceTo(raycaster.ray.origin); if (d < bd) { bd = d; best = u; } }
    }
    return { unit: best, dist: bd };
  }
  function pickSlot(px, py) {
    setRay(px, py);
    const hits = raycaster.intersectObjects(hitMeshes, false);
    return hits.length ? { slotId: hits[0].object.userData.slotId, dist: hits[0].distance } : null;
  }
  function handleClick(px, py, ptype) {
    const pu = pickUnit(px, py), ps = pickSlot(px, py);
    if (pu.unit && ptype !== 'mouse' && (!ps || pu.dist <= ps.dist)) {
      tipUnit = pu.unit; tipPinUntil = performance.now() + 2800; renderTip(pu.unit, px, py);
      return;
    }
    if (ps) {
      const slot = S.slots[ps.slotId];
      select(slot.building != null ? { kind: 'building', id: slot.building } : { kind: 'slot', id: slot.id });
    } else select(null);
  }
  let lastHover = 0;
  function updateHover(now) {
    if (now < tipPinUntil) { if (tipUnit) renderTip(tipUnit, parseFloat(el.tip.style.left) - 14, parseFloat(el.tip.style.top) - 14); return; }
    if (now - lastHover < 100) return;
    lastHover = now;
    if (!mouseIn || dragging) { el.tip.style.display = 'none'; return; }
    const pu = pickUnit(mouseX, mouseY);
    if (pu.unit) renderTip(pu.unit, mouseX, mouseY); else el.tip.style.display = 'none';
  }

  // =====================================================================
  // Events from sim, main loop
  // =====================================================================
  const _w = new THREE.Vector3();
  function processEvents() {
    for (const e of sim.drainEvents()) {
      if (e.type === 'strike') { if (e.building && e.building.type === 'lumber') onChop(e); /* fishing visuals are driven by the cast/reel animation */ }
      else if (e.type === 'harvest') { if (e.building.type === 'lumber') onFell(e); }
      else if (e.type === 'drop') {
        const icon = e.res === 'wood' ? '🪵' : e.res === 'fish' ? '🐟' : '🍲';
        spawnP(labelTex(`+${e.n} ${icon}`), e.pos.x, 1.3, e.pos.z, 0, 0.8, 0, 1.5, 0.6, 0.6, 1, 0xffffff, 0, 2.5);
      } else if (e.type === 'upgrade' || e.type === 'built') {
        const slotId = e.building.slot; popSlot(slotId);
        burstSpark(e.pos.x, 1.2, e.pos.z, 22);
      } else if (e.type === 'win') {
        const h = Math.floor(e.at.hour), m = Math.floor((e.at.hour - h) * 60);
        el.banner.innerHTML = `Settlement complete! Day ${e.at.day} ${pad2(h)}:${pad2(m)}<small>Play continues - click to dismiss</small>`;
        el.banner.style.display = 'block';
        for (const s of S.slots) burstSpark(s.pos.x, 1.5, s.pos.z, 14);
      }
    }
  }

  let smokeT = 0, tAcc = 0, hudT = 0;
  let prev = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const realDt = Math.min((now - prev) / 1000, 0.1); prev = now;
    const sp = document.hidden ? 0 : speed;
    const simDt = realDt * sp;
    if (simDt > 0) sim.step(simDt);
    processEvents();
    syncBuildings();
    const adt = realDt * sp;
    tAcc += adt;
    updateUnits(adt, sp);
    // slot animations
    for (const slot of S.slots) {
      const v = slotVis[slot.id];
      if (v.empty.visible && v.plus.visible) v.plus.position.y = 1.9 + Math.sin(tAcc * 2.2 + slot.id) * 0.18;
      if (v.popT < 0.4) {
        v.popT += adt; const k = clamp(v.popT / 0.4, 0, 1);
        v.root.scale.setScalar(1 + 0.15 * Math.sin(k * PI));
      } else if (v.root.scale.x !== 1) v.root.scale.setScalar(1);
    }
    // smoke from cookhouse chimney
    smokeT -= adt;
    if (smokeT <= 0) {
      smokeT = 0.4;
      for (const s of smokeSpots) { s.root.localToWorld(_w.set(s.x, s.y, s.z)); spawnP(TEX.soft, _w.x, _w.y, _w.z, 0.12, 0.7, 0.05, 2.4, 0.3, 1.2, 0.55, 0xb8bec6, 0); }
    }
    for (let i = 0; i < floes.length; i++) floes[i].m.position.y = floes[i].y0 + Math.sin(tAcc * 0.8 + floes[i].ph) * 0.06;
    updateGroves(adt);
    updateRipples(adt);
    updatePondFish(tAcc);
    updateParticles(adt);
    updateDayNight(S.hour);
    selRing.rotation.z += adt * 0.5;
    hudT -= realDt;
    if (hudT <= 0) { hudT = 0.25; updateHUD(); }
    updateHover(now);
    renderer.render(scene, cam);
  }
  syncBuildings();
  updateDayNight(S.hour);
  updateHUD();
  requestAnimationFrame((t) => { prev = t; frame(t); });

  window.__ember = {
    sim, THREE, scene, camera: cam, renderer, rigs, camState, groves,
    setSpeed, getSpeed: () => speed,
    select, getSelection: () => sel,
    build: (slotId, type) => sim.build(slotId, type),
    upgrade: (buildingId) => sim.upgrade(buildingId),
    addRes: (w, f, m) => { S.res.wood += w || 0; S.res.fish += f || 0; S.res.meals += m || 0; },
    setHour: (h) => { S.t = Math.floor(S.t / 24) * 24 + h; },
  };
}
