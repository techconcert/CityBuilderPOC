// Headless tests for sim.js. Run: node sim-test.mjs   (exit code 0 = pass)
import { createSim, TUNE, costFor, MAX_LEVEL, TYPES } from './sim.js';

let failures = 0;
const fail = (msg) => { failures++; if (failures < 30) console.log('  FAIL: ' + msg); };
const fmtH = (h) => String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.floor((h % 1) * 60)).padStart(2, '0');
const dist = (sim) => {
  const d = {};
  for (const u of sim.state.units) d[u.state] = (d[u.state] || 0) + 1;
  return Object.entries(d).map(([k, v]) => k + ':' + v).join(' ');
};

function checkInvariants(sim, label, strictCap) {
  const s = sim.state;
  if (s.res.meals < 0 || s.res.wood < 0 || s.res.fish < 0 || !Number.isFinite(s.res.meals)) fail(`${label}: negative/NaN resources ${JSON.stringify(s.res)}`);
  if (strictCap && sim.popCap() < sim.staffableSlots()) fail(`${label}: cap ${sim.popCap()} < staffable ${sim.staffableSlots()}`);
  if (s.units.length > sim.popCap()) fail(`${label}: pop ${s.units.length} > cap ${sim.popCap()}`);
  for (const u of s.units) {
    if (!Number.isFinite(u.pos.x) || !Number.isFinite(u.pos.z) || !Number.isFinite(u.heading)) fail(`${label}: NaN pos for ${u.name}`);
    if (Math.hypot(u.pos.x, u.pos.z) > 14) fail(`${label}: ${u.name} off island ${u.pos.x.toFixed(1)},${u.pos.z.toFixed(1)}`);
    if (u.stateT > 120) fail(`${label}: ${u.name} stuck in ${u.state} for ${u.stateT.toFixed(0)}s`);
    if (u.hunger < 0 || u.hunger > 100 || u.energy < 0 || u.energy > 100) fail(`${label}: needs out of range for ${u.name}`);
  }
}

function runDays(label, sim, days, strictCap) {
  console.log(`\n== ${label} ==`);
  const dt = 0.05, probes = [6, 12, 19, 23];
  const seen = new Set();
  let dayStartRes = { ...sim.state.res }, lastDay = 1;
  const endT = sim.state.t + days * 24;
  let strikes = 0, drops = 0, spawns = 0;
  while (sim.state.t < endT - 1e-9) {
    sim.step(dt);
    for (const e of sim.drainEvents()) { if (e.type === 'strike') strikes++; else if (e.type === 'drop') drops++; else if (e.type === 'spawn') spawns++; }
    checkInvariants(sim, label, strictCap);
    const s = sim.state;
    for (const p of probes) {
      const key = s.day + ':' + p;
      if (!seen.has(key) && Math.floor(s.hour) === p && s.hour - p < 0.05) {
        seen.add(key);
        console.log(`  Day ${s.day} ${fmtH(s.hour)} pop ${s.units.length}/${sim.popCap()} | ${dist(sim)}`);
      }
    }
    if (s.day !== lastDay) {
      console.log(`  -- end of day ${lastDay}: wood ${s.res.wood} fish ${s.res.fish} meals ${s.res.meals} pop ${s.units.length} (delta wood ${s.res.wood - dayStartRes.wood}, fish ${s.res.fish - dayStartRes.fish}, meals ${s.res.meals - dayStartRes.meals})`);
      dayStartRes = { ...s.res }; lastDay = s.day;
    }
  }
  const s = sim.state;
  console.log(`  final: Day ${s.day} ${fmtH(s.hour)} wood ${s.res.wood} fish ${s.res.fish} meals ${s.res.meals} pop ${s.units.length}; events strikes ${strikes} drops ${drops} spawns ${spawns}`);
  return { strikes, drops, spawns };
}

// ---- Scenario 1: passive, cookhouse built at start ----
{
  const sim = createSim({ seed: 1 });
  const s = sim.state;
  if (s.units.length !== 3 || s.res.wood !== 15 || s.res.fish !== 6 || s.res.meals !== 24) fail('bad start state');
  if (s.buildings.length !== 3) fail('expected 3 prebuilt buildings');
  const r = sim.build(2, 'cook');
  if (!r.ok || s.res.wood !== 5) fail('cookhouse build failed / wrong deduction: ' + JSON.stringify(r) + ' wood ' + s.res.wood);
  if (sim.build(3, 'cook').ok) fail('duplicate cookhouse allowed');
  if (sim.build(2, 'dock').ok) fail('occupied slot allowed');
  const res = runDays('Scenario 1: passive 3 days (cookhouse built)', sim, 3, true);
  if (res.strikes < 10) fail('too few strike events');
  if (res.drops < 5) fail('too few drops');
  if (res.spawns < 1) fail('no newcomers spawned');
  const jobs = {}; for (const u of s.units) { const b = sim.bldg(u.job); const k = b ? b.type : 'none'; jobs[k] = (jobs[k] || 0) + 1; }
  console.log('  jobs:', JSON.stringify(jobs));
  if (!jobs.cook) fail('nobody works the cookhouse');
}

// ---- Scenario 2: starvation (no cookhouse, meals 0) ----
{
  const sim = createSim({ seed: 7 });
  sim.state.res.meals = 0;
  runDays('Scenario 2: no meals, 2 days (nobody should die / get stuck)', sim, 2, true);
  const hungry = sim.state.units.filter((u) => u.hunger >= 100).length;
  console.log(`  units at hunger 100: ${hungry}/${sim.state.units.length}; wood ${sim.state.res.wood}`);
  if (sim.state.units.length < 3) fail('units vanished');
  if (hungry === 0) fail('expected starving units');
}

// ---- Scenario 3: upgrade API sanity ----
{
  const sim = createSim({ seed: 3 });
  const tent = sim.byType('tent');
  sim.state.res.wood = 0; sim.state.res.fish = 0;
  const bad = sim.upgrade(tent.id);
  if (bad.ok) fail('upgrade should fail when unaffordable');
  sim.state.res.wood = 100; sim.state.res.fish = 50;
  const c = costFor('tent', 1);
  const ok = sim.upgrade(tent.id);
  if (!ok.ok || sim.state.res.wood !== 100 - c.wood || sim.popCap() !== 9) fail('tent upgrade wrong');
  const costs = TYPES.map((t) => t + ':' + [1, 2, 3, 4].map((l) => { const c2 = costFor(t, l); return c2.wood + '/' + c2.fish; }).join(','));
  console.log('\n== cost table ==\n  ' + costs.join('\n  '));
  const expect = { lumber: '20/5,30/8,45/11,68/17', dock: '24/4,36/6,54/9,81/14', cook: '30/6,45/9,68/14,101/20', tent: '16/4,24/6,36/9,54/14' };
  if (TUNE.COST_SCALE === 1) for (const t of TYPES) if (!costs.find((x) => x === t + ':' + expect[t])) fail('cost table mismatch for ' + t);
}

// ---- Scenario 4: autoplay to win ----
{
  const sim = createSim({ seed: 11 });
  const s = sim.state;
  sim.build(2, 'cook');
  const dt = 0.05, maxSim = 60 * 60;
  let simSec = 0, lastReport = -1;
  const levelLog = [];
  console.log(`\n== Scenario 4: autoplay (HOURS_PER_SEC=${TUNE.HOURS_PER_SEC.toFixed(4)}, COST_SCALE=${TUNE.COST_SCALE}) ==`);
  while (!s.won && simSec < maxSim) {
    sim.step(dt); simSec += dt; sim.drainEvents();
    // greedy: cheapest affordable upgrade first (by wood+fish)
    for (;;) {
      const opts = s.buildings.filter((b) => b.level < MAX_LEVEL)
        .map((b) => ({ b, c: costFor(b.type, b.level) }))
        .filter((o) => sim.canAfford(s.res, o.c))
        .sort((x, y) => (x.c.wood + x.c.fish) - (y.c.wood + y.c.fish));
      if (!opts.length) break;
      const r = sim.upgrade(opts[0].b.id);
      if (!r.ok) fail('autoplay upgrade failed ' + r.reason);
      levelLog.push(`${(simSec / 60).toFixed(1)}m ${opts[0].b.type}->L${opts[0].b.level}`);
    }
    checkInvariants(sim, 'autoplay', false);
    const m = Math.floor(simSec / 120);
    if (m !== lastReport) { lastReport = m; console.log(`  t=${(simSec / 60).toFixed(1)}m Day ${s.day} wood ${s.res.wood} fish ${s.res.fish} meals ${s.res.meals} pop ${s.units.length}/${sim.popCap()} levels ${s.buildings.map((b) => b.type[0] + b.level).join(' ')}`); }
  }
  if (!s.won) { fail('autoplay did not reach win within 60 minutes'); console.log('  levels:', s.buildings.map((b) => b.type + ' L' + b.level).join(', ')); }
  else {
    console.log(`  WIN at real-seconds-at-1x = ${simSec.toFixed(0)} s (${(simSec / 60).toFixed(1)} min); game Day ${s.winAt.day} ${fmtH(s.winAt.hour)}; pop ${s.units.length}`);
    console.log('  upgrade timeline: ' + levelLog.join(' | '));
  }
}

console.log(failures ? `\nFAILED (${failures} problems)` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
