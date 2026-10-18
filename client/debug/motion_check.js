// Motion check — run in the game page after any change to poses / COMBO / IK / grip / locomotion.
//   const m = await import('/debug/motion_check.js?' + Date.now());
//   await m.run()                       → PASS/FAIL report (numbers per 4 ms step)
//   m.sheet({mode:'combo', yawOff:20})  → slow-mo contact sheet overlay (screenshot it), modes: combo | issen (the L finisher) | thrust (K) | dual (K K) | run | walk
//   m.hideSheet()
// It calls __iso.stop() (the loop stays frozen) and moves the character around — reload the page afterwards.
// Thresholds are the values measured after the 2026-10 arm/grip/carry fixes (see CLAUDE.md), with headroom.

const D = 180 / Math.PI;
const LIMITS = {
  locoWristMax: 2000,   // °/s hand-vs-forearm while running / walking / stopping (the old stop flick was ~29,000)
  locoElbowMax: 6,      // m/s
  comboElbowMax: 25,    // m/s — anything above means the elbow teleported (old left-elbow pop: 66+)
  comboWristMax: 12000, // °/s single-step peak (fast cuts reach ~8,000; flips were 25,000–44,000)
  comboWristP95: 4000,  // °/s
  minTwo: 0.8,          // off-hand grip weight through beats 1–3 (all three cuts are two-handed now)
  freeFlareMax: 0.18,   // m the free off-hand's elbow/wrist may sit outboard of the left shoulder (the old 'balance' pose flung the wrist ~0.3 m out at every attack start)
  freeStandAngleMax: 150, // ° elbow interior angle of the free off-hand standing (a straight 170° arm reads as broken / no strength)
  freeMoveAngleMax: 135,  // ° while running/walking: a runner's pump keeps the elbow clearly bent
  bladeLegMin: 0.1,     // m between the blade and the leg bones while moving (old idle blade: inside a leg 60% of frames)
  locoTorsoMax: 0.01,   // m an arm point (elbow, upper/forearm, wrist) may sit inside the bare torso while running/walking
  dualTorsoMax: 0.10,   // m — K K: the left arm reaches over the shoulder to the saya hilt via WAY2 (draw / sheathe); measured ≤ ~7.3 (upper chest / armpit); a straight path across the chest was 14
  comboTorsoMax: 0.12,  // m in the combo (the ellipse is conservative at the armpit/upper chest; the hilt used to put the left wrist 15 cm inside; now ≤ ~11.6)
};

let I, S, R, rig, V, Q;
const adv = ms => { for (let k = 0; k < ms / 16; k++) I.frame(0, 16, true); I.frame(0, 0); };
const key = (k, down, shift = false) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: k, shiftKey: shift }));

async function ready() {
  await new Promise(r => { const c = () => (window.__iso && window.__iso.rig.real && window.__iso.rig.real.loco) ? r() : setTimeout(c, 200); c(); });
  I = window.__iso; S = I.S; R = I.rig.real; rig = I.rig; V = R.hipsPos.constructor; Q = rig.root.quaternion.constructor;
  I.stop();
}
// open ground, camera yaw 45 so 'a' runs ~5 m without hitting the edge or a target
function reset(x = 2.5, z = -1, facing = -Math.PI / 4) {
  I.CAM.yaw.y = I.CAM.yawT = 45; S.act = null; S.phase = 'idle'; S.combo = -1; S.queued = false;
  S.pos.set(x, 0, z); S.facing = facing; S.vel.set(0, 0, 0); adv(1500); S.pos.set(x, 0, z);
}
const stats = a => { const b = [...a].sort((x, y) => x - y); return { p95: b[Math.floor(b.length * .95)] || 0, max: b[b.length - 1] || 0 }; };
const segDist = (p1, q1, p2, q2) => { let best = 9; for (let i = 0; i <= 16; i++) { const a = p1.clone().lerp(q1, i / 16); for (let j = 0; j <= 16; j++) best = Math.min(best, a.distanceTo(p2.clone().lerp(q2, j / 16))); } return best; };
const wp = n => R.bone[n].getWorldPosition(new V());
// bare torso (same ellipse as BODY in index.html, without the arm-radius inflation), chest-local
const torsoPen = p => { const q = rig.chest.worldToLocal(p.clone()); if (q.y < -.55 || q.y > .2) return 0; const d = Math.hypot(q.x / .15, (q.z - .04) / .16); return d < 1 ? (1 - d) * .15 : 0; };

// Steps the sim 4 ms at a time. presses = attack presses (ms); runMs = hold 'a' until then (0 = no run).
function simulate({ presses = [], until, runMs = 0, shift = false, twoWin = [0, 0], legCheck = false, fn }) {
  reset();
  const prev = {}, H = { R: [], L: [] }, E = { R: [], L: [] }, worst = [];
  let t = 0, pi = 0, minTwo = 1, bladeLeg = 9, nan = false, torso = 0, torsoAt = '', flare = 0, flareAt = '', angStand = 0, angMove = 0;
  if (runMs) key('a', true, shift);
  while (t < until) {
    if (runMs && t === runMs) key('a', false, shift);
    if (pi < presses.length && t >= presses[pi]) { (fn || I.press)(); pi++; }
    I.frame(0, 4, true); t += 4;
    if (t > twoWin[0] && t < twoWin[1]) minTwo = Math.min(minTwo, S.twoEff);
    const root = rig.root.position;
    for (const s of ['R', 'L']) {
      const a = R.arm[s], rel = a.ha.quaternion.clone(), e = a.fo.getWorldPosition(new V()).sub(root);
      if (s === 'L' && S.twoEff < .3) {   // the free off-hand: how far out does it flare, how bent is the elbow
        const sh = rig.chest.worldToLocal(a.up.getWorldPosition(new V())), el = rig.chest.worldToLocal(a.fo.getWorldPosition(new V())), wr = rig.chest.worldToLocal(a.ha.getWorldPosition(new V()));
        const fl = Math.max(el.x - sh.x, wr.x - sh.x); if (fl > flare) { flare = fl; flareAt = `${t}ms`; }
        const ang = sh.clone().sub(el).angleTo(wr.clone().sub(el)) * D;
        if (!S.act && S.twoEff < .05) { if (S.walkAmt > .8) angMove = Math.max(angMove, ang); else if (S.walkAmt < .02) angStand = Math.max(angStand, ang); } }
      { const sh = a.up.getWorldPosition(new V()), el = a.fo.getWorldPosition(new V()), wr = a.ha.getWorldPosition(new V());
        const p = Math.max(torsoPen(el), torsoPen(sh.clone().lerp(el, .75)), torsoPen(el.clone().lerp(wr, .5)), torsoPen(wr)); if (p > torso) { torso = p; torsoAt = `${t}ms ${s}`; } }
      if ([rel.x, rel.y, rel.z, rel.w, e.x].some(Number.isNaN)) nan = true;
      if (prev[s]) { const h = prev[s].r.angleTo(rel) * D / .004, ve = e.distanceTo(prev[s].e) / .004; H[s].push(h); E[s].push(ve);
        if (h > 6000 || ve > 20) worst.push(`${t}ms ${s} wrist ${Math.round(h)}°/s elbow ${ve.toFixed(1)}m/s`); }
      prev[s] = { r: rel, e };
    }
    if (legCheck && !S.act && S.walkAmt > .3 && t % 8 === 0) {
      const G = rig.katana.position.clone(), q = rig.katana.quaternion, tip = G.clone().add(new V(0, .82, 0).applyQuaternion(q)), b0 = G.clone().add(new V(0, .07, 0).applyQuaternion(q));
      for (const side of ['Left', 'Right']) bladeLeg = Math.min(bladeLeg, segDist(b0, tip, wp(side + 'UpLeg'), wp(side + 'Leg')), segDist(b0, tip, wp(side + 'Leg'), wp(side + 'Foot')));
    }
  }
  key('a', false, shift);
  return { wristR: stats(H.R), wristL: stats(H.L), elbowR: stats(E.R), elbowL: stats(E.L), minTwo, bladeLeg, nan, torso, torsoAt, flare, flareAt, angStand, angMove, worst: worst.slice(0, 8) };
}
function hits() { // dummy at about 0.8 m — every beat should land
  reset(1.2, 1.6, Math.PI * .25);
  let t = 0, pi = 0, prevH = 0; const pr = [0, 420, 860], out = [];
  while (t < 1700) { if (pi < 3 && t >= pr[pi]) { I.press(); pi++; } I.frame(0, 4, true); t += 4; if (S.hitstop > 0 && prevH <= 0) out.push(S.combo); prevH = S.hitstop; }
  return [...new Set(out)];
}

function dualHits() { // K then K: the thrust and the dual cut must each land on a dummy ~0.8 m ahead; the 2nd sword must be in the hand during the cut
  reset(1.2, 1.6, Math.PI * .25);
  let t = 0, prevH = 0, shown = false; const out = [];
  while (t < 2000) { if (t === 0 || t === 340) I.pressK(); I.frame(0, 4, true); t += 4; if (S.sword2) shown = true; if (S.hitstop > 0 && prevH <= 0 && S.act) out.push(S.act.def.kanji); prevH = S.hitstop; }
  return { thrust: out.includes('突'), dual: out.includes('双'), shown };
}

function finisherHit() { // L: the cut is made at ~0.6 s but nothing may react before the release (~1.28 s), then the dummy must go
  reset(1.2, 1.6, Math.PI * .25);
  const tg = I.targets.filter(x => x.type === 'dummy'), n = () => tg.reduce((a, x) => a + x.hits, 0), n0 = n();
  document.getElementById('kanji').classList.remove('show');   // the timer that clears it runs in real time, not sim time
  let t = 0, early = 0, kan = 0; I.pressL();
  while (t < 2000) { I.frame(0, 4, true); t += 4; if (t === 1100) early = n() - n0; if (t === 1100) kan = +document.getElementById('kanji').classList.contains('show'); }
  return { early, late: n() - n0, kanjiEarly: kan };
}

export async function run() {
  await ready();
  const lines = [], fail = [];
  const check = (name, ok, detail) => { lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${detail}`); if (!ok) fail.push(name); };
  const f = x => Math.round(x);
  for (const [name, o] of [['run→stop', { until: 2600, runMs: 1200, legCheck: true }], ['walk→stop', { until: 3000, runMs: 1600, shift: true, legCheck: true }]]) {
    const r = simulate(o), w = Math.max(r.wristR.max, r.wristL.max), e = Math.max(r.elbowR.max, r.elbowL.max);
    check(`${name} wrist`, w <= LIMITS.locoWristMax, `max ${f(w)}°/s (limit ${LIMITS.locoWristMax})`);
    check(`${name} elbow`, e <= LIMITS.locoElbowMax, `max ${e.toFixed(1)} m/s (limit ${LIMITS.locoElbowMax})`);
    check(`${name} blade↔legs`, r.bladeLeg >= LIMITS.bladeLegMin, `min ${r.bladeLeg.toFixed(3)} m (limit ${LIMITS.bladeLegMin})`);
    check(`${name} arms inside torso`, r.torso <= LIMITS.locoTorsoMax, `deepest ${(r.torso * 100).toFixed(1)} cm ${r.torsoAt} (limit ${LIMITS.locoTorsoMax * 100} cm)`);
    check(`${name} free-arm flare`, r.flare <= LIMITS.freeFlareMax, `max ${(r.flare * 100).toFixed(0)} cm outboard of the shoulder ${r.flareAt} (limit ${LIMITS.freeFlareMax * 100} cm)`);
    check(`${name} free-arm elbow bend`, r.angMove <= LIMITS.freeMoveAngleMax && r.angStand <= LIMITS.freeStandAngleMax, `moving max ${f(r.angMove)}° (limit ${LIMITS.freeMoveAngleMax}), standing max ${f(r.angStand)}° (limit ${LIMITS.freeStandAngleMax})`);
    check(`${name} NaN`, !r.nan, r.nan ? 'NaN in a bone' : 'none');
    if (r.worst.length) lines.push('      spikes: ' + r.worst.join(' | '));
  }
  for (const [name, o] of [['combo (standing)', { presses: [0, 420, 860], until: 2300, twoWin: [200, 1450] }], ['combo (from a run)', { presses: [0, 420, 860], until: 2300, runMs: 600, twoWin: [200, 1450] }]]) {
    const r = simulate(o), e = Math.max(r.elbowR.max, r.elbowL.max), wm = Math.max(r.wristR.max, r.wristL.max), wp95 = Math.max(r.wristR.p95, r.wristL.p95);
    check(`${name} elbow jumps`, e <= LIMITS.comboElbowMax, `max ${e.toFixed(1)} m/s (limit ${LIMITS.comboElbowMax})`);
    check(`${name} wrist peak`, wm <= LIMITS.comboWristMax, `max ${f(wm)}°/s (limit ${LIMITS.comboWristMax})`);
    check(`${name} wrist p95`, wp95 <= LIMITS.comboWristP95, `${f(wp95)}°/s (limit ${LIMITS.comboWristP95})`);
    check(`${name} two-hand grip`, r.minTwo >= LIMITS.minTwo, `min ${r.minTwo.toFixed(2)} in beats 1–3 (limit ${LIMITS.minTwo})`);
    check(`${name} free-arm flare`, r.flare <= LIMITS.freeFlareMax, `max ${(r.flare * 100).toFixed(0)} cm outboard of the shoulder ${r.flareAt} (limit ${LIMITS.freeFlareMax * 100} cm)`);
    check(`${name} arms inside torso`, r.torso <= LIMITS.comboTorsoMax, `deepest ${(r.torso * 100).toFixed(1)} cm ${r.torsoAt} (limit ${LIMITS.comboTorsoMax * 100} cm)`);
    check(`${name} NaN`, !r.nan, r.nan ? 'NaN in a bone' : 'none');
    if (r.worst.length) lines.push('      spikes: ' + r.worst.join(' | '));
  }
  { const o = { presses: [0], until: 2400, twoWin: [500, 760], fn: I.pressL }, r = simulate(o), e = Math.max(r.elbowR.max, r.elbowL.max), wm = Math.max(r.wristR.max, r.wristL.max), wp95 = Math.max(r.wristR.p95, r.wristL.p95), name = 'finisher L';
    check(`${name} elbow jumps`, e <= LIMITS.comboElbowMax, `max ${e.toFixed(1)} m/s (limit ${LIMITS.comboElbowMax})`);
    check(`${name} wrist peak`, wm <= LIMITS.comboWristMax, `max ${f(wm)}°/s (limit ${LIMITS.comboWristMax})`);
    check(`${name} wrist p95`, wp95 <= LIMITS.comboWristP95, `${f(wp95)}°/s (limit ${LIMITS.comboWristP95})`);
    check(`${name} two-hand grip`, r.minTwo >= LIMITS.minTwo, `min ${r.minTwo.toFixed(2)} through the charge end + cut (limit ${LIMITS.minTwo})`);
    check(`${name} free-arm flare`, r.flare <= LIMITS.freeFlareMax, `max ${(r.flare * 100).toFixed(0)} cm outboard of the shoulder ${r.flareAt} (limit ${LIMITS.freeFlareMax * 100} cm)`);
    check(`${name} arms inside torso`, r.torso <= LIMITS.comboTorsoMax, `deepest ${(r.torso * 100).toFixed(1)} cm ${r.torsoAt} (limit ${LIMITS.comboTorsoMax * 100} cm)`);
    check(`${name} NaN`, !r.nan, r.nan ? 'NaN in a bone' : 'none');
    if (r.worst.length) lines.push('      spikes: ' + r.worst.join(' | ')); }
  { const o = { presses: [0, 340], until: 2400, fn: I.pressK }, r = simulate(o), e = Math.max(r.elbowR.max, r.elbowL.max), wm = Math.max(r.wristR.max, r.wristL.max), wp95 = Math.max(r.wristR.p95, r.wristL.p95), name = 'dual K K';
    check(`${name} elbow jumps`, e <= LIMITS.comboElbowMax, `max ${e.toFixed(1)} m/s (limit ${LIMITS.comboElbowMax})`);
    check(`${name} wrist peak`, wm <= LIMITS.comboWristMax, `max ${f(wm)}°/s (limit ${LIMITS.comboWristMax})`);
    check(`${name} wrist p95`, wp95 <= LIMITS.comboWristP95, `${f(wp95)}°/s (limit ${LIMITS.comboWristP95})`);
    check(`${name} arms inside torso`, r.torso <= LIMITS.dualTorsoMax, `deepest ${(r.torso * 100).toFixed(1)} cm ${r.torsoAt} (limit ${LIMITS.dualTorsoMax * 100} cm)`);
    check(`${name} NaN`, !r.nan, r.nan ? 'NaN in a bone' : 'none');
    check(`${name} sword back in the saya`, !S.sword2 && rig.real.backSwords[0].g.visible && !rig.katana2.visible, `sword2 ${S.sword2}, back sword visible ${rig.real.backSwords[0].g.visible}`);
    if (r.worst.length) lines.push('      spikes: ' + r.worst.join(' | ')); }
  { const r = dualHits(); check('dual K K hits', r.thrust && r.dual, `thrust hit ${r.thrust}, dual cut hit ${r.dual}, sword2 shown during the cut ${r.shown}`); }
  { const r = finisherHit(); check('finisher L delayed hit', r.early === 0 && r.late > 0 && !r.kanjiEarly, `dummy hits before the release ${r.early}, after ${r.late}, kanji early ${r.kanjiEarly}`); }
  const h = hits();
  check('hits on the dummy', [0, 1, 2].every(c => h.includes(c)), `beats hit: ${h.map(c => c + 1).join(',') || 'none'}`);
  lines.unshift(fail.length ? `MOTION CHECK: ${fail.length} FAIL` : 'MOTION CHECK: all PASS');
  lines.push('Now LOOK at it: m.sheet({mode:"combo"|"run"|"walk", yawOff:0 front / -90 side / 180 back}) and screenshot the overlay.');
  return lines.join('\n');
}

// Contact sheet of the character (world hidden), camera locked relative to the character's facing.
export async function sheet({ mode = 'combo', times, cols = 6, yawOff = 20, pitch = 10, zoom = 1.3, fy = .95, width = .36 } = {}) {
  await ready();
  const sc0 = rig.root.parent; let k = rig.katana; while (k.parent && k.parent !== sc0) k = k.parent;
  const keep = new Set([rig.root, k, rig.katana2]); for (const e of rig.eyes) { let p = e; while (p.parent && p.parent !== sc0) p = p.parent; keep.add(p); }
  for (const s of rig.real?.backSwords || []) keep.add(s.g);   // back sword + empty saya (world-space props placed from Spine01)
  for (const c of sc0.children) { if (keep.has(c) || c.isLight || c.isCamera || (c.isMesh && c.renderOrder === 5) || (c.type === 'Object3D' && !c.children.length)) continue; c.visible = false; }
  const plan = { issen: { presses: [0], fn: 'pressL', runMs: 0, times: [0, 250, 450, 540, 580, 610, 640, 700, 900, 1150, 1260, 1320, 1450, 1800] },
                 combo: { presses: [0, 420, 860], runMs: 0, times: [100, 170, 250, 300, 340, 450, 520, 600, 660, 760, 1000, 1120, 1250, 1350, 1500, 1800] },
                 thrust:{ presses: [0], fn: 'pressK', runMs: 0, times: [60, 120, 170, 220, 260, 300, 360, 420, 520, 640, 760, 900] },
                 dual:  { presses: [0, 340], fn: 'pressK', runMs: 0, times: [330, 400, 460, 520, 560, 620, 680, 760, 850, 980, 1100, 1180, 1260, 1340, 1420, 1520, 1700, 1900] },
                 run:   { presses: [], runMs: 1200, times: [700, 760, 820, 880, 940, 1000, 1220, 1260, 1300, 1360, 1440, 1700] },
                 walk:  { presses: [], runMs: 1600, shift: true, times: [900, 1000, 1100, 1200, 1300, 1400, 1640, 1700, 1800, 1900, 2100, 2400] } }[mode];
  times = times || plan.times;
  if (mode === 'combo') I.COMBO.forEach(c => { c._lunge ??= c.lunge; c.lunge = 0; });
  if (mode === 'issen') { I.ISSEN._lunge ??= I.ISSEN.lunge; I.ISSEN.lunge = 0; }
  if (mode === 'dual' || mode === 'thrust') for (const d of [I.ATTACK2, I.DUAL]) { d._lunge ??= d.lunge; d.lunge = 0; }   // keep the character in frame
  reset();
  const cv = document.querySelector('canvas'), W = cv.width, H = cv.height, cw = Math.round(W * width), ch = Math.round(H * .8), cx = Math.round(W * .5 - cw / 2);
  let out = document.getElementById('motionSheet');
  if (!out) { out = document.createElement('canvas'); out.id = 'motionSheet'; out.style.cssText = 'position:fixed;left:0;top:0;z-index:99;background:#fff;max-width:100vw;max-height:100vh'; document.body.appendChild(out); }
  const s = Math.min(2400 / (cols * cw), 1), rows = Math.ceil(times.length / cols);
  out.style.display = 'block'; out.width = cols * cw * s; out.height = rows * ch * s;
  const g = out.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, out.width, out.height);
  if (plan.runMs) key('a', true, plan.shift);
  let t = 0, i = 0, pi = 0;
  while (i < times.length) {
    if (plan.runMs && t === plan.runMs) key('a', false, plan.shift);
    if (pi < plan.presses.length && t >= plan.presses[pi]) { (plan.fn ? I[plan.fn] : I.press)(); pi++; }
    if (t >= times[i]) {
      const saved = [I.CAM.yaw.y, I.CAM.yawT, I.CAM.focus.clone()];
      I.CAM.yaw.y = I.CAM.yawT = rig.root.rotation.y * D + yawOff; I.CAM.pitch.y = I.CAM.pitchT = pitch; I.CAM.zoom.y = I.CAM.zoomT = zoom; I.CAM.focus.set(S.pos.x, fy, S.pos.z); I.frame(0, 0);
      I.CAM.yaw.y = saved[0]; I.CAM.yawT = saved[1]; I.CAM.focus.copy(saved[2]);   // movement is camera-relative: don't steer the run
      const x = (i % cols) * cw * s, y = Math.floor(i / cols) * ch * s;
      g.drawImage(cv, cx, 0, cw, ch, x, y, cw * s, ch * s); g.strokeStyle = '#999'; g.strokeRect(x, y, cw * s, ch * s);
      g.fillStyle = '#c00'; g.font = 'bold 22px sans-serif'; g.fillText(`${times[i]}ms ${S.act ? (S.act.def.kanji || 'beat ' + (S.combo + 1)) : 'v' + Math.hypot(S.vel.x, S.vel.z).toFixed(1)} 2h${(S.twoEff || 0).toFixed(1)}`, x + 6, y + 24);
      i++; continue;
    }
    I.frame(0, 4, true); t += 4;
  }
  key('a', false, plan.shift);
  if (mode === 'combo') I.COMBO.forEach(c => { c.lunge = c._lunge; });
  if (mode === 'issen') I.ISSEN.lunge = I.ISSEN._lunge;
  if (mode === 'dual' || mode === 'thrust') for (const d of [I.ATTACK2, I.DUAL]) d.lunge = d._lunge;
  return `sheet ${mode}: ${times.length} frames, yawOff ${yawOff} — take a screenshot`;
}
export function hideSheet() { const o = document.getElementById('motionSheet'); if (o) o.style.display = 'none'; }
