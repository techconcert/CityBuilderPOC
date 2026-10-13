// Ember Isle - pure simulation core. No DOM, no three.js.
// createSim(opts) -> { state, step(simDtSeconds), build, upgrade, drainEvents, ... }

// COST_SCALE tuned 1 -> 0.45 so an optimal auto-play wins in ~13 min at 1x (a human will be slower). Spec base costs are the COST_SCALE=1 values.
export const TUNE = { HOURS_PER_SEC: 24 / 90, COST_SCALE: 0.45 };
export const WALK_SPEED = 2.2;
export const CARRY_MULT = 0.75;
export const SEP_RADIUS = 0.6;
export const SEP_PUSH = 1.5;
export const MAX_LEVEL = 5;
export const TYPES = ['lumber', 'dock', 'cook', 'tent'];
export const TYPE_NAME = { lumber: 'Lumber Camp', dock: 'Fishing Dock', cook: 'Cookhouse', tent: 'Tent Camp' };
export const SLOT_POS = [[0, -8], [6.9, -4], [6.9, 4], [0, 8], [-6.9, 4], [-6.9, -4]];
export const SPAWN_POS = { x: -12.5, z: 0 };
// Fishing pond: centre is POND_Z along the slot's outward axis; fishermen stand on its shore.
export const POND_Z = 2.6;
export const POND_R = 2.0;
const DOCK_ANG = [75, -75, 105, -105, 50, -50].map((d) => d * Math.PI / 180); // shore angle per work slot (0 = shed side)

const BASE_COST = { lumber: [20, 5], dock: [24, 4], cook: [30, 6], tent: [16, 4] };
const BUILD_COST = { lumber: [10, 0], dock: [10, 0], cook: [10, 0], tent: [10, 0] };
const NAMES = ['Ash', 'Birch', 'Cedar', 'Dune', 'Ember', 'Fern', 'Gale', 'Hazel', 'Ivo', 'Juno', 'Kit', 'Lark',
  'Moss', 'Nell', 'Orin', 'Pip', 'Quill', 'Rue', 'Sage', 'Tam', 'Una', 'Vale', 'Wren', 'Yarrow'];

// ---------- economy (pure) ----------
export function costFor(type, level) { // cost to go level -> level+1
  const m = Math.pow(1.5, level - 1) * TUNE.COST_SCALE;
  return { wood: Math.round(BASE_COST[type][0] * m), fish: Math.round(BASE_COST[type][1] * m) };
}
export function buildCostFor(type) { return { wood: BUILD_COST[type][0], fish: BUILD_COST[type][1] }; }
export function canAfford(res, cost) { return res.wood >= cost.wood && res.fish >= cost.fish; }
export function slotsFor(type, L) {
  if (type === 'lumber' || type === 'dock') return 1 + L;
  if (type === 'cook') return L;
  return 0;
}
export function capFor(L) { return 3 + 3 * L; }
export function bundleFor(L) { return 2 + L; }
export function gatherTimeFor(L) { return 4 / Math.pow(1.25, L - 1); }
export function cookTimeFor(L) { return 1.2 * gatherTimeFor(L); }

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const TAU = Math.PI * 2;
const wrap24 = (h) => ((h % 24) + 24) % 24;
const wrapPi = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

export function periodOf(hp) { // hp = hour - unit offset, wrapped
  if (hp >= 6 && hp < 12) return 'work';
  if (hp < 13 && hp >= 12) return 'eat';
  if (hp >= 13 && hp < 19) return 'work';
  if (hp >= 19 && hp < 20) return 'eat';
  if (hp >= 20 && hp < 22) return 'rest';
  return 'sleep';
}

export function createSim(opts = {}) {
  const rng = mulberry32(opts.seed ?? 20240607);
  const rand = (a = 0, b = 1) => a + (b - a) * rng();

  const state = {
    t: 6, day: 1, hour: 6,
    res: { wood: 15, fish: 6, meals: 24 },
    slots: [], buildings: [], units: [], events: [],
    won: false, winAt: null,
    nextId: 1, nextBId: 1,
    lastHourF: 6, lastTick: Math.floor((6 - 2) / 4),
    eatOcc: new Array(18).fill(0),
  };

  // ---------- layout ----------
  SLOT_POS.forEach((p, i) => {
    const len = Math.hypot(p[0], p[1]);
    const dir = { x: p[0] / len, z: p[1] / len };
    const perp = { x: -dir.z, z: dir.x };
    state.slots.push({
      id: i, pos: { x: p[0], z: p[1] }, dir, perp,
      door: { x: p[0] - dir.x * 2.2, z: p[1] - dir.z * 2.2 }, building: null,
    });
  });
  const dropSpots = [];
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; dropSpots.push({ x: Math.cos(a) * 1.5, z: Math.sin(a) * 1.5 }); }
  const eatSpots = [];
  for (let k = 0; k < 18; k++) { const a = k * 20 * Math.PI / 180; eatSpots.push({ x: Math.cos(a) * 3, z: Math.sin(a) * 3 }); }

  const off = (p, d, k, q, m) => ({ x: p.x + d.x * k + q.x * m, z: p.z + d.z * k + q.z * m });
  const tentPos = (slot, i) => off(slot.pos, slot.dir, 0.5, slot.perp, -3 + 1.5 * i);
  const bedPos = (slot, i, j) => off(tentPos(slot, i), slot.dir, -0.9, slot.perp, [-0.4, 0, 0.4][j]);

  const bldg = (id) => state.buildings.find((b) => b.id === id) || null;
  const byType = (type) => state.buildings.find((b) => b.type === type) || null;
  const workersOf = (b) => state.units.reduce((n, u) => n + (u.job === b.id ? 1 : 0), 0);
  const slotOf = (b) => state.slots[b.slot];
  const emit = (e) => { state.events.push(e); if (state.events.length > 4000) state.events.splice(0, 2000); };

  function workSpot(b, k, u) {
    const s = slotOf(b);
    const jx = u ? u.jx : 0, jz = u ? u.jz : 0;
    let p;
    if (b.type === 'lumber') {
      const side = k % 2 === 0 ? -1 : 1, row = Math.floor(k / 2);
      // stand beside the trunk (about 1.3 from it), level with the tree, facing it
      p = off(s.pos, s.dir, 2.2 + 1.05 * row, s.perp, side * 0.95);
    } else if (b.type === 'dock') {
      const a = DOCK_ANG[((k % 6) + 6) % 6];
      p = off(s.pos, s.dir, POND_Z - 2.7 * Math.cos(a), s.perp, -2.7 * Math.sin(a)); // outside the rim stones
      return { x: p.x + jx * 0.3, z: p.z + jz * 0.3 };
    } else {
      p = off(s.door, s.dir, -0.3, s.perp, (k - 2) * 0.45);
    }
    return { x: p.x + jx * 0.6, z: p.z + jz * 0.6 };
  }
  // choppable tree for work slot k: a lateral column beside the camp (units stand between camp and tree)
  const treeSite = (s, k) => off(s.pos, s.dir, 2.2 + 1.05 * (Math.floor(k / 2) % 3), s.perp, (k % 2 === 0 ? -1 : 1) * 2.25);
  const pondCenter = (s) => off(s.pos, s.dir, POND_Z, s.perp, 0);
  const isBehind = (b, p) => {
    if (b.type !== 'lumber' && b.type !== 'dock') return false;
    const s = slotOf(b);
    return (p.x - s.pos.x) * s.dir.x + (p.z - s.pos.z) * s.dir.z > (b.type === 'dock' ? 0.4 : 1.5);
  };
  function corners(b, p) { // go around the building footprint to reach/leave a spot behind it
    const s = slotOf(b);
    const side = ((p.x - s.pos.x) * s.perp.x + (p.z - s.pos.z) * s.perp.z) >= 0 ? 1 : -1;
    // lumber: walk in the lane between the cabin wall and the tree column; dock: around the shed to the pond shore
    const lat = b.type === 'lumber' ? 1.7 : 2.9, z1 = b.type === 'dock' ? 0.9 : 2.3;
    return [off(s.pos, s.dir, -2.2, s.perp, side * lat), off(s.pos, s.dir, z1, s.perp, side * lat)];
  }

  // ---------- pathing ----------
  function needsAvoid(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
    if (L2 < 1e-6) return false;
    const s = -(a.x * dx + a.z * dz) / L2;
    if (s <= 0.02 || s >= 0.98) return false;
    return Math.hypot(a.x + dx * s, a.z + dz * s) < 1.6;
  }
  function refine(a, b, out, depth) {
    if (depth > 2 || !needsAvoid(a, b)) return;
    const a1 = Math.atan2(a.z, a.x), a2 = Math.atan2(b.z, b.x);
    let d = wrapPi(a2 - a1);
    if (Math.abs(d) > Math.PI - 0.02) d = Math.PI;
    const m = a1 + d / 2 + (Math.abs(d) >= Math.PI - 0.02 ? 0 : 0);
    const w = { x: Math.cos(m) * 3.6, z: Math.sin(m) * 3.6 };
    refine(a, w, out, depth + 1); out.push(w); refine(w, b, out, depth + 1);
  }
  function route(u, dest, destB) {
    const pts = [];
    if (u.inB != null) {
      const b = bldg(u.inB);
      if (b) {
        if (isBehind(b, u.pos)) { const c = corners(b, u.pos); pts.push(c[1], c[0]); }
        pts.push({ x: slotOf(b).door.x, z: slotOf(b).door.z });
      }
    }
    if (destB != null) {
      const b = bldg(destB);
      pts.push({ x: slotOf(b).door.x, z: slotOf(b).door.z });
      if (isBehind(b, dest)) { const c = corners(b, dest); pts.push(c[0], c[1]); }
    }
    pts.push({ x: dest.x, z: dest.z });
    const out = []; let a = u.pos;
    for (const p of pts) { refine(a, p, out, 0); out.push(p); a = p; }
    u.path = out; u.inB = null; u.pendB = destB ?? null;
  }
  function finishArrive(u) { u.inB = u.pendB; u.pendB = null; }
  function walk(u, dt) {
    if (u.path.length === 0) { finishArrive(u); return true; }
    if (u.stateT > 45) { // safety: never stay stuck walking
      const l = u.path[u.path.length - 1]; u.pos.x = l.x; u.pos.z = l.z; u.path.length = 0; finishArrive(u); return true;
    }
    const spd = WALK_SPEED * (u.carry ? CARRY_MULT : 1);
    let move = spd * dt;
    while (move > 1e-9 && u.path.length) {
      const w = u.path[0], dx = w.x - u.pos.x, dz = w.z - u.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.001) u.heading = Math.atan2(dx, dz);
      if (d <= move) { u.pos.x = w.x; u.pos.z = w.z; u.path.shift(); move -= d; }
      else { u.pos.x += dx / d * move; u.pos.z += dz / d * move; move = 0; }
    }
    u.moving = true; u.speed = spd;
    if (u.path.length === 0) { finishArrive(u); return true; }
    return false;
  }

  // ---------- units ----------
  function makeUnit(x, z) {
    const id = state.nextId++;
    return {
      id, name: NAMES[(id - 1) % NAMES.length] + (id > NAMES.length ? ' ' + Math.ceil(id / NAMES.length) : ''),
      pos: { x, z }, heading: rand(-Math.PI, Math.PI), state: 'IDLE', stateT: 0,
      offset: rand(-0.5, 0.5), hunger: 20, energy: 90,
      job: null, jobSlot: -1, carry: null, carryTo: null, path: [], pendB: null, inB: null,
      bedIdx: -1, bed: null, bedB: null, eatIdx: -1, mealWin: -999, eatCool: 0,
      restPhase: 'walk', restT: 0, workDur: 0, workProg: 0, workT: 0, workRate: 1, strikeK: -1,
      dropT: 0, cookN: 0, eatT: 0, emote: null, emoteT: 0, moving: false, speed: 0,
      jx: rand(-0.2, 0.2), jz: rand(-0.2, 0.2), isNew: false,
    };
  }
  function totalBeds() { const t = byType('tent'); return t ? 3 * (1 + t.level) : 0; }
  function assignBeds() {
    const t = byType('tent'); if (!t) return;
    const s = slotOf(t), n = totalBeds(), used = new Set();
    for (const u of state.units) if (u.bedIdx >= 0 && u.bedIdx < n) used.add(u.bedIdx); else { u.bedIdx = -1; u.bed = null; }
    for (const u of state.units) {
      if (u.bedIdx >= 0) continue;
      for (let k = 0; k < n; k++) if (!used.has(k)) { used.add(k); u.bedIdx = k; u.bed = bedPos(s, Math.floor(k / 3), k % 3); u.bedB = t.id; break; }
    }
  }
  function assignJobs() {
    for (const u of state.units) {
      if (u.job != null) continue;
      let best = null, bestR = 1e-9;
      for (const type of ['cook', 'dock', 'lumber']) {
        const b = byType(type); if (!b) continue;
        const sl = slotsFor(type, b.level), r = (sl - workersOf(b)) / sl;
        if (r > bestR) { bestR = r; best = b; }
      }
      if (best) {
        const taken = new Set(state.units.filter((x) => x.job === best.id).map((x) => x.jobSlot));
        let k = 0; while (taken.has(k)) k++;
        u.job = best.id; u.jobSlot = k;
      }
    }
    rebalance();
  }
  // A newly built/upgraded building with no workers takes one from the most-staffed building.
  function rebalance() {
    for (const b of state.buildings) {
      if (b.type === 'tent') continue;
      const sl = slotsFor(b.type, b.level);
      if (sl <= 0 || workersOf(b) > 0) continue;
      let donor = null, dn = 1;
      for (const d of state.buildings) {
        if (d === b || d.type === 'tent') continue;
        const n = workersOf(d); if (n > dn) { dn = n; donor = d; }
      }
      if (!donor) continue;
      const u = state.units.find((x) => x.job === donor.id && !x.carry);
      if (!u) continue;
      const taken = new Set(state.units.filter((x) => x.job === b.id).map((x) => x.jobSlot));
      let k = 0; while (taken.has(k)) k++;
      u.job = b.id; u.jobSlot = k;
      if (INTERRUPTIBLE.has(u.state)) setState(u, 'IDLE');
    }
  }
  function spawnUnit(initial) {
    let u;
    if (initial) { const a = rand(0, TAU), r = rand(2, 4); u = makeUnit(Math.cos(a) * r, Math.sin(a) * r); }
    else u = makeUnit(SPAWN_POS.x, SPAWN_POS.z);
    state.units.push(u);
    assignBeds(); assignJobs();
    if (!initial) {
      u.isNew = true; u.emote = '!'; u.emoteT = 5;
      const a = rand(0, TAU);
      route(u, { x: Math.cos(a) * 3, z: Math.sin(a) * 3 }, null);
      u.restPhase = 'walk'; setState(u, 'REST');
      emit({ type: 'spawn', unit: u, pos: { x: u.pos.x, z: u.pos.z } });
    }
    return u;
  }

  const setState = (u, s) => { u.state = s; u.stateT = 0; };
  const nearestDrop = (p) => {
    let best = dropSpots[0], bd = 1e9;
    for (const d of dropSpots) { const e = Math.hypot(d.x - p.x, d.z - p.z) + rng() * 0.8; if (e < bd) { bd = e; best = d; } }
    return best;
  };
  function claimEatSpot(u) {
    releaseEat(u);
    let best = -1, bd = 1e9;
    for (let k = 0; k < 18; k++) if (state.eatOcc[k] === 0) {
      const d = Math.hypot(eatSpots[k].x - u.pos.x, eatSpots[k].z - u.pos.z);
      if (d < bd) { bd = d; best = k; }
    }
    if (best < 0) best = Math.floor(rng() * 18);
    state.eatOcc[best] = u.id; u.eatIdx = best; return eatSpots[best];
  }
  function releaseEat(u) {
    if (u.eatIdx >= 0 && state.eatOcc[u.eatIdx] === u.id) state.eatOcc[u.eatIdx] = 0;
    u.eatIdx = -1;
  }

  // ---------- FSM ----------
  function goRest(u) {
    const a = rand(0, TAU), r = rand(2, 5);
    route(u, { x: Math.cos(a) * r, z: Math.sin(a) * r }, null);
    u.restPhase = 'walk'; setState(u, 'REST');
  }
  function goSleep(u) {
    if (!u.bed) { u.restPhase = 'walk'; return goRest(u); }
    route(u, u.bed, u.bedB); setState(u, 'GO_SLEEP');
  }
  function goEat(u) {
    const sp = claimEatSpot(u);
    route(u, sp, null); setState(u, 'GO_EAT');
  }
  function goStock(u, st) {
    route(u, nearestDrop(u.pos), null); setState(u, st);
  }
  function goWork(u) {
    const b = bldg(u.job);
    if (!b) return goRest(u);
    if (b.type === 'cook') { u.carry = null; return goStock(u, 'GO_STOCK'); }
    route(u, workSpot(b, u.jobSlot, u), b.id); setState(u, 'GO_WORK');
  }
  function startWork(u) {
    const b = bldg(u.job);
    u.workDur = b.type === 'cook' ? cookTimeFor(b.level) : gatherTimeFor(b.level);
    u.workProg = 0; u.workT = 0; u.strikeK = -1;
    const s = slotOf(b);
    if (b.type === 'lumber') { const t = treeSite(s, u.jobSlot); u.heading = Math.atan2(t.x - u.pos.x, t.z - u.pos.z); }
    else if (b.type === 'dock') { const c = pondCenter(s); u.heading = Math.atan2(c.x - u.pos.x, c.z - u.pos.z); }
    else u.heading = Math.atan2(s.dir.x, s.dir.z);
    setState(u, 'WORK');
  }
  function mealWindow(u) {
    const ts = state.t - u.offset;
    return Math.floor(ts / 24) * 2 + (wrap24(ts) < 16 ? 0 : 1);
  }
  // What does the unit need right now, ignoring work? ('sleep' | 'eat-sched' | 'eat' | null)
  function pendingNeed(u) {
    const per = periodOf(wrap24(state.t - u.offset));
    if (u.energy < 15 || per === 'sleep') return 'sleep';
    if (per === 'eat' && u.mealWin !== mealWindow(u)) return 'eat-sched';
    if (u.hunger > 80 && state.res.meals > 0 && state.t >= u.eatCool) return 'eat';
    return null;
  }
  function decide(u) {
    const need = pendingNeed(u);
    if (need === 'sleep') return goSleep(u);
    if (need === 'eat-sched') { u.mealWin = mealWindow(u); return goEat(u); }
    if (need === 'eat') return goEat(u);
    if (periodOf(wrap24(state.t - u.offset)) === 'rest') return goRest(u);
    if (u.job != null) return goWork(u);
    return goRest(u);
  }
  // A work cycle spans several game hours, so meals/bedtime must be able to interrupt it.
  // Never while carrying a bundle, and never mid-cook (the fish is already out of the stockpile).
  const INTERRUPTIBLE = new Set(['REST', 'GO_WORK', 'WORK', 'GO_STOCK', 'WAIT_FISH']);
  function shouldInterrupt(u) {
    if (!INTERRUPTIBLE.has(u.state) || u.carry) return false;
    if (u.state === 'WORK') { const b = bldg(u.job); if (b && b.type === 'cook') return false; }
    const need = pendingNeed(u);
    if (!need) return false;
    if (need === 'sleep' && !u.bed) return false;
    return true;
  }

  function updateUnit(u, dt) {
    u.stateT += dt; u.moving = false; u.speed = 0;
    if (u.emoteT > 0) { u.emoteT -= dt; if (u.emoteT <= 0) u.emote = null; }
    if (u.hunger >= 100 && !u.emote) { u.emote = 'sad'; u.emoteT = 2.5; }
    if (shouldInterrupt(u)) decide(u);
    switch (u.state) {
      case 'IDLE': decide(u); break;
      case 'REST':
        if (u.restPhase === 'walk') { if (walk(u, dt)) { u.restPhase = 'idle'; u.restT = rand(2, 4); } }
        else { u.restT -= dt; if (u.restT <= 0) setState(u, 'IDLE'); }
        break;
      case 'GO_WORK': if (walk(u, dt)) startWork(u); break;
      case 'WORK': {
        const b = bldg(u.job);
        const rate = u.hunger >= 100 ? 0.5 : 1;
        u.workRate = rate; u.workT += dt * rate; u.workProg += dt * rate;
        if (b && b.type !== 'cook') {
          const k = Math.floor((u.workT * 6 - Math.PI / 2) / TAU);
          if (k > u.strikeK) {
            u.strikeK = k;
            emit({ type: 'strike', unit: u, building: b, pos: { x: u.pos.x + Math.sin(u.heading) * 0.5, z: u.pos.z + Math.cos(u.heading) * 0.5 } });
          }
        }
        if (u.workProg >= u.workDur) {
          if (!b) { setState(u, 'IDLE'); break; }
          if (b.type === 'cook') u.carry = { res: 'meals', n: 2 * u.cookN };
          else u.carry = { res: b.type === 'lumber' ? 'wood' : 'fish', n: bundleFor(b.level) };
          if (b.type !== 'cook') emit({ type: 'harvest', unit: u, building: b, res: u.carry.res, n: u.carry.n, jobSlot: u.jobSlot });
          u.carryTo = 'stock'; goStock(u, 'CARRY');
        }
        break;
      }
      case 'GO_STOCK':
        if (walk(u, dt)) {
          const b = bldg(u.job);
          const take = b ? Math.min(bundleFor(b.level), Math.floor(state.res.fish)) : 0;
          if (take > 0) {
            state.res.fish -= take; u.carry = { res: 'fish', n: take }; u.cookN = take; u.carryTo = 'cook';
            route(u, workSpot(b, u.jobSlot, u), b.id); setState(u, 'CARRY');
          } else { u.emote = '?'; u.emoteT = 2.8; setState(u, 'WAIT_FISH'); }
        }
        break;
      case 'WAIT_FISH': if (u.stateT >= 3) setState(u, 'IDLE'); break;
      case 'CARRY':
        if (walk(u, dt)) {
          if (u.carryTo === 'cook') { u.carry = null; startWork(u); }
          else { u.dropT = 0.5; setState(u, 'DROP'); }
        }
        break;
      case 'DROP':
        u.dropT -= dt;
        if (u.dropT <= 0) {
          if (u.carry) {
            state.res[u.carry.res] += u.carry.n;
            emit({ type: 'drop', res: u.carry.res, n: u.carry.n, pos: { x: u.pos.x, z: u.pos.z }, unit: u });
          }
          u.carry = null; u.carryTo = null; setState(u, 'IDLE');
        }
        break;
      case 'GO_EAT':
        if (walk(u, dt)) {
          u.heading = Math.atan2(-u.pos.x, -u.pos.z);
          if (state.res.meals >= 1) {
            state.res.meals -= 1; u.hunger = Math.max(0, u.hunger - 60);
            u.eatT = 1 / TUNE.HOURS_PER_SEC; setState(u, 'EAT');
          } else {
            u.emote = 'sad'; u.emoteT = 3; u.eatCool = state.t + 1; releaseEat(u); setState(u, 'IDLE');
          }
        }
        break;
      case 'EAT':
        u.eatT -= dt;
        if (u.eatT <= 0) { releaseEat(u); setState(u, 'IDLE'); }
        break;
      case 'GO_SLEEP':
        if (walk(u, dt)) {
          const s = slotOf(bldg(u.bedB));
          u.heading = Math.atan2(s.dir.x, s.dir.z); setState(u, 'SLEEP');
        }
        break;
      case 'SLEEP': {
        const hp = wrap24(state.t - u.offset);
        if (u.energy >= 30 && hp >= 6 && hp < 22) setState(u, 'IDLE');
        break;
      }
      default: setState(u, 'IDLE');
    }
  }

  const FIXED = new Set(['SLEEP', 'EAT', 'WORK', 'DROP', 'WAIT_FISH']);
  function separate(dt) {
    const us = state.units;
    for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) {
      const a = us[i], b = us[j];
      let dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      let d = Math.hypot(dx, dz);
      if (d >= SEP_RADIUS) continue;
      if (d < 1e-4) { const an = (i * 7 + j * 13) % 6.28; dx = Math.cos(an); dz = Math.sin(an); d = 1; }
      const fa = FIXED.has(a.state), fb = FIXED.has(b.state);
      if (fa && fb) continue;
      const k = SEP_PUSH * dt * (1 - Math.min(d, SEP_RADIUS) / SEP_RADIUS + 0.25);
      const share = (fa || fb) ? 1 : 0.5;
      if (!fa) { a.pos.x -= dx / d * k * share; a.pos.z -= dz / d * k * share; }
      if (!fb) { b.pos.x += dx / d * k * share; b.pos.z += dz / d * k * share; }
    }
  }

  function sub(dt) {
    const H = TUNE.HOURS_PER_SEC, dh = dt * H;
    state.t += dh; state.day = Math.floor(state.t / 24) + 1; state.hour = state.t % 24;
    const hf = Math.floor(state.t);
    if (hf !== state.lastHourF) { state.lastHourF = hf; assignJobs(); }
    const tick = Math.floor((state.t - 2) / 4);
    if (tick !== state.lastTick) {
      state.lastTick = tick;
      const h = state.hour;
      if (h >= 5.9 && h <= 18.5 && state.units.length < popCap() && state.res.meals >= state.units.length) spawnUnit(false);
    }
    for (const u of state.units) {
      if (u.state === 'SLEEP') u.energy = Math.min(100, u.energy + 12.5 * dh);
      else u.energy = Math.max(0, u.energy - 5 * dh);
      u.hunger = Math.min(100, u.hunger + 4 * dh);
      updateUnit(u, dt);
    }
    separate(dt);
  }

  // ---------- actions ----------
  function popCap() { const t = byType('tent'); return t ? capFor(t.level) : 0; }
  function checkWin() {
    if (state.won) return;
    if (TYPES.every((tp) => { const b = byType(tp); return b && b.level >= MAX_LEVEL; })) {
      state.won = true; state.winAt = { day: state.day, hour: state.hour, t: state.t };
      emit({ type: 'win', at: state.winAt });
    }
  }
  function addBuilding(slotId, type, level) {
    const b = { id: state.nextBId++, type, level, slot: slotId };
    state.buildings.push(b); state.slots[slotId].building = b.id; return b;
  }
  function build(slotId, type) {
    const s = Number.isInteger(slotId) ? state.slots[slotId] : null;
    if (!s) return { ok: false, reason: 'no such slot' };
    if (s.building != null) return { ok: false, reason: 'slot occupied' };
    if (!TYPES.includes(type)) return { ok: false, reason: 'bad type' };
    if (byType(type)) return { ok: false, reason: 'already built' };
    const c = buildCostFor(type);
    if (!canAfford(state.res, c)) return { ok: false, reason: 'cannot afford' };
    state.res.wood -= c.wood; state.res.fish -= c.fish;
    const b = addBuilding(slotId, type, 1);
    if (type === 'tent') assignBeds();
    assignJobs(); checkWin();
    emit({ type: 'built', building: b, pos: { x: s.pos.x, z: s.pos.z } });
    return { ok: true, building: b };
  }
  function upgrade(buildingId) {
    const b = bldg(buildingId);
    if (!b) return { ok: false, reason: 'no such building' };
    if (b.level >= MAX_LEVEL) return { ok: false, reason: 'max level' };
    const c = costFor(b.type, b.level);
    if (!canAfford(state.res, c)) return { ok: false, reason: 'cannot afford' };
    state.res.wood -= c.wood; state.res.fish -= c.fish;
    b.level++;
    if (b.type === 'tent') assignBeds();
    assignJobs(); checkWin();
    emit({ type: 'upgrade', building: b, pos: { x: slotOf(b).pos.x, z: slotOf(b).pos.z } });
    return { ok: true, building: b };
  }
  function step(simDt) {
    if (!Number.isFinite(simDt) || simDt <= 0) return;
    let rem = Math.min(simDt, 30);
    while (rem > 1e-9) { const h = Math.min(rem, 0.05); sub(h); rem -= h; }
  }
  function drainEvents() { const e = state.events; state.events = []; return e; }

  // ---------- init ----------
  addBuilding(0, 'tent', 1);
  addBuilding(1, 'lumber', 1);
  addBuilding(4, 'dock', 1);
  for (let i = 0; i < 3; i++) spawnUnit(true);
  assignBeds(); assignJobs();

  return {
    state, step, build, upgrade, drainEvents, assignJobs, popCap, workersOf, bldg, byType,
    costFor, buildCostFor, canAfford, slotsFor, capFor, bundleFor, gatherTimeFor, cookTimeFor, periodOf,
    layout: { dropSpots, eatSpots, tentPos, bedPos, workSpot, treeSite, pondCenter },
    staffableSlots: () => state.buildings.reduce((n, b) => n + slotsFor(b.type, b.level), 0),
    totalBeds,
    rng,
  };
}
