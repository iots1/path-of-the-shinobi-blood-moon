import {gripMetrics} from './rig_detail.js';
// Motion check — run in the game page after any change to poses / COMBO / IK / grip / locomotion.
//   const m = await import('/debug/motion_check.js?' + Date.now());
//   await m.run()                       → PASS/FAIL report (numbers per 4 ms step)
//   m.sheet({mode:'combo', yawOff:20})  → slow-mo contact sheet overlay (screenshot it), modes: combo | issen (the L finisher) | thrust (K) | dual (K K) | idle | run | walk
//   m.hideSheet()
// It calls __iso.stop() (the loop stays frozen) and moves the character around — reload the page afterwards.
// Thresholds are the values measured after the 2026-10 arm/grip/carry fixes (see CLAUDE.md), with headroom.

const D = 180 / Math.PI;
const LIMITS = {
  locoWristMax: 2800,   // °/s hand-vs-forearm while running / walking / stopping (the old stop flick was ~29,000). Was 2000: since the ready stance holds the blade as a diagonal guard (by 35 / el -45) the blade swings ~150° up to the carry within ~150 ms of a run start → steady peaks of 1,800–2,500 there (a real fast motion, no flip); the roll rate is capped (GRIP_TUNE.rollRate)
  locoElbowMax: 6,      // m/s
  comboElbowMax: 25,    // m/s — anything above means the elbow teleported (old left-elbow pop: 66+)
  comboWristMax: 12000, // °/s single-step peak (fast cuts reach ~8,000; flips were 25,000–44,000)
  comboWristP95: 4000,  // °/s
  minTwo: 0.8,          // off-hand grip weight through beats 1–3 (all three cuts are two-handed now)
  freeFlareMax: 0.22,   // m the free off-hand's elbow/wrist may sit outboard of the left shoulder (the old 'balance' pose flung the wrist ~0.3 m out at every attack start). Was .18 — the run front reference (ninja_katana_run_front.jpeg) has the left elbow flared wide (measured 20 cm at the pump's front extreme)
  freeStandAngleMax: 165, // ° elbow interior angle of the free off-hand standing. Was 150; the new ninja's reference stance (art/reference/new_ninja_katana/ninja_katana_2_front.jpeg) lets the left arm hang almost straight (measured 160°); a fully locked 175°+ arm still reads as broken
  freeMoveAngleMax: 135,  // ° while RUNNING: a runner's pump keeps the elbow clearly bent (the Running clip arm: 76–116°)
  freeWalkAngleMax: 177,  // ° while walking: the Walking clip swings a relaxed, almost straight arm (121–176°) like a real walk — only a hyper-extended (locked past straight) elbow fails
  runBladeForearmMax: 45, // V2 reference has the blade angled down behind a near-horizontal forearm; the former parallel carry used 25°. Wrist bend stays capped at 25°.
  runWristBendMax: 50,  // ° finger-axis vs forearm while running. Was 25 — but wrist bend + blade-vs-forearm angle is ~constant for this hammer grip, and the reference (art/reference/ninja-no-hood/ninja_katana_run_side.jpeg) has the blade ~31° below horizontal (≈15° off the forearm); matching it costs ~40–46° of wrist (RUN_TUNE.wristPitch -.7). The blade-angle checks above still bound the other side of the trade.
  bladeLegMin: 0.1,    // m between the blade and the leg bones while moving (old idle blade: inside a leg 60% of frames)
  locoTorsoMax: 0.01,   // m an arm point (elbow, upper/forearm, wrist) may sit inside the bare torso while running/walking
  dualTorsoMax: 0.10,   // m — K K: the left arm reaches over the shoulder to the saya hilt via WAY2 (draw / sheathe); measured ≤ ~7.3 (upper chest / armpit); a straight path across the chest was 14
  comboTorsoMax: 0.12,  // m in the combo (the ellipse is conservative at the armpit/upper chest; the hilt used to put the left wrist 15 cm inside; now ≤ ~11.6)
  // per-frame shoulder checks (shoulderTrace) — provisional, set from the first measurement (2026-10-21), see CLAUDE.md
  shoulderJumpMax: 1.0, // m/s the shoulder joint (LeftArm/RightArm) may move in the chest bone's own frame — it only moves by the clavicle, so a fast slide = a pop
  clavRateMax: 400,     // °/s clavicle bone angular speed
  runRollSwingMax: 6,   // ° peak-to-peak side-to-side sway of the hips→neck axis while running steadily (front reference: upright, no visible lean)
  runShoulderRollSwingMax: 10, // ° peak-to-peak tilt of the shoulder line while running steadily
  // anatomical range of motion (2026-10-21, adult averages; same numbers as WRIST_LIM in index.html, which enforces them)
  wrist: { flex: 80, ext: 70, radial: 25, ulnar: 40 },   // ° — checked as an ellipse (armAngles().wrist ≤ 1 + 3 % tolerance)
  elbowMin: 35,         // ° interior angle (a real elbow stops at ~30–35°)
  shoulderExtMax: 70,   // ° upper arm behind the torso's down axis (normal extension ~50–60°)
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
  if (I.loop) I.loop('off');   // a dev loop (run-in-place / repeat-an-attack) left on would fight every scenario below — always start clean
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
  let t = 0, pi = 0, minTwo = 1, bladeLeg = 9, nan = false, torso = 0, torsoAt = '', flare = 0, flareAt = '', elbowPeak=0, elbowAt='', angStand = 0, angMove = 0, angWalk = 0;
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
        if (!S.act && S.twoEff < .05) { if (S.walkAmt > .8) { if ((R.loco.b || 0) > .7) angMove = Math.max(angMove, ang); else if ((R.loco.b || 0) < .3) angWalk = Math.max(angWalk, ang); } else if (S.walkAmt < .02) angStand = Math.max(angStand, ang); } }
      { const sh = a.up.getWorldPosition(new V()), el = a.fo.getWorldPosition(new V()), wr = a.ha.getWorldPosition(new V());
        const p = Math.max(torsoPen(el), torsoPen(sh.clone().lerp(el, .75)), torsoPen(el.clone().lerp(wr, .5)), torsoPen(wr)); if (p > torso) { torso = p; torsoAt = `${t}ms ${s}`; } }
      if ([rel.x, rel.y, rel.z, rel.w, e.x].some(Number.isNaN)) nan = true;
      if (prev[s]) { const h = prev[s].r.angleTo(rel) * D / .004, ve = e.distanceTo(prev[s].e) / .004; H[s].push(h); E[s].push(ve); if(ve>elbowPeak){elbowPeak=ve;elbowAt=`${t}ms ${s}`;}
        if (h > 6000 || ve > 20) worst.push(`${t}ms ${s} wrist ${Math.round(h)}°/s elbow ${ve.toFixed(1)}m/s`); }
      prev[s] = { r: rel, e };
    }
    if (legCheck && !S.act && S.walkAmt > .3 && t % 8 === 0) {
      const G = rig.katana.position.clone(), q = rig.katana.quaternion, tip = G.clone().add(new V(0, .82, 0).applyQuaternion(q)), b0 = G.clone().add(new V(0, .07, 0).applyQuaternion(q));
      for (const side of ['Left', 'Right']) bladeLeg = Math.min(bladeLeg, segDist(b0, tip, wp(side + 'UpLeg'), wp(side + 'Leg')), segDist(b0, tip, wp(side + 'Leg'), wp(side + 'Foot')));
    }
  }
  key('a', false, shift);
  return { wristR: stats(H.R), wristL: stats(H.L), elbowR: stats(E.R), elbowL: stats(E.L), minTwo, bladeLeg, nan, torso, torsoAt, flare, flareAt, elbowAt, angStand, angMove, angWalk, worst: worst.slice(0, 8) };
}
function hits() { // dummy at about 0.8 m — every beat should land
  reset(1.2, 1.6, Math.PI * .25);
  let t = 0, pi = 0, prevH = 0; const pr = [0, 420, 860], out = [];
  while (t < 1700) { if (pi < 3 && t >= pr[pi]) { I.press(); pi++; } I.frame(0, 4, true); t += 4; if (S.hitstop > 0 && prevH <= 0) out.push(S.combo); prevH = S.hitstop; }
  return [...new Set(out)];
}

function dualHits() { // K then K: the thrust and the dual cut must each land on a dummy; the 2nd sword must be in the hand during the cut
  // Start 1.4 m from the dummy at (1.2, 2.8), facing it: the thrust then really connects at ~270 ms. (The old start, 1.2 m at 45°, only 'hit' by grazing the dummy
  // with the raised blade at ~172 ms — right after the hit test opens — so the result flipped with any change of the ready stance.) Hits before 200 ms don't count.
  reset(1.2, 1.4, 0);
  let t = 0, prevH = 0, shown = false; const out = [];
  while (t < 2000) { if (t === 0 || t === 340) I.pressK(); I.frame(0, 4, true); t += 4; if (S.sword2) shown = true; if (S.hitstop > 0 && prevH <= 0 && S.act && S.act.t >= 200) out.push(S.act.def.kanji); prevH = S.hitstop; }
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

// Regression for the trailing sword arm: repeated reversals used to leave its
// world-space swivel history behind, folding the elbow into the torso.
export async function carryTurns() {
  await ready(); reset();
  const a = R.arm.R, route = ['a', 'd', 'a', 'd', 'w', 's', 'w', 's', 'a', 'd', 'a', 'd'];
  let skinPen=0,guardPen=0,skinGap=9,skinEnc=360;
  let torso = 0, wrist = 0, minElbow = 180, maxBend = 0, maxBladeAngle = 0, maxBladeElevation = -90, minTorsoLean = 90, maxTorsoLean = -90, maxUpperRoll = 0, minPommelGap = Infinity, maxGuardGap = 0, minGuardGap = Infinity, behind = 0, samples = 0, nan = false, gripSide = true, gripWrap = true, prev;
  const sample = steady => {
    const sh = a.up.getWorldPosition(new V()), e = a.fo.getWorldPosition(new V()), wr = a.ha.getWorldPosition(new V());
    // Use the full torso envelope (not only the narrower bare-torso metric).
    for (const p of [e, sh.clone().lerp(e, .75), e.clone().lerp(wr, .33), e.clone().lerp(wr, .66), wr]) {
      const q = rig.chest.worldToLocal(p.clone());
      if (q.y >= -.55 && q.y <= .2) torso = Math.max(torso, (1 - Math.hypot(q.x / .185, (q.z - .04) / .19)) * .185);
    }
    const q = a.ha.quaternion.clone();
    if (prev) wrist = Math.max(wrist, prev.angleTo(q) * D / .004);
    prev = q;
    nan ||= ![...e.toArray(), ...wr.toArray(), ...q.toArray()].every(Number.isFinite);
    if (steady) {
      const torsoAxis=wp('neck').sub(wp('Hips')).applyQuaternion(rig.root.quaternion.clone().invert());
      const torsoLean=Math.atan2(torsoAxis.z,torsoAxis.y)*D;
      minTorsoLean=Math.min(minTorsoLean,torsoLean);maxTorsoLean=Math.max(maxTorsoLean,torsoLean);
      maxUpperRoll = Math.max(maxUpperRoll, Math.abs(a.upperRoll || 0) * D);
      const bladeWorld = new V(0, 1, 0).applyQuaternion(rig.katana.quaternion);
      maxBladeAngle = Math.max(maxBladeAngle, wr.clone().sub(e).angleTo(bladeWorld) * D);
      maxBladeElevation = Math.max(maxBladeElevation, Math.asin(Math.max(-1,Math.min(1,bladeWorld.y))) * D);
      // The pommel must separate from the forearm, while the index finger
      // remains just below the tsuba (sword-local y = .1085).
      const pommel = new V(0, -.154, 0).applyQuaternion(rig.katana.quaternion).add(rig.katana.position);
      const fore = wr.clone().sub(e), along = Math.max(0, Math.min(1, pommel.clone().sub(e).dot(fore) / fore.lengthSq()));
      minPommelGap = Math.min(minPommelGap, pommel.distanceTo(e.clone().addScaledVector(fore, along)));
      const index = R.bone.RightHandIndex3;
      if (index) {
        const gap = .080 - rig.katana.worldToLocal(index.getWorldPosition(new V())).y;
        minGuardGap = Math.min(minGuardGap, gap); maxGuardGap = Math.max(maxGuardGap, gap);
      }
      minElbow = Math.min(minElbow, sh.clone().sub(e).angleTo(wr.clone().sub(e)) * D);
      const finger = new V(0, 1, 0).applyQuaternion(a.ha.getWorldQuaternion(new Q()));
      maxBend = Math.max(maxBend, wr.clone().sub(e).angleTo(finger) * D);
      // The reference arm trails horizontally while the torso pitches forward; measure in the character frame.
      if (rig.root.worldToLocal(wr.clone()).z < rig.root.worldToLocal(sh.clone()).z - .2) behind++;
      // Anatomical grip check: the blade exits toward the thumb (+hand Z),
      // and the middle finger wraps to the palm side of the real hilt axis.
      const grip = a.ha.worldToLocal(rig.katana.position.clone());
      const blade = new V(0, 1, 0).applyQuaternion(rig.katana.quaternion).applyQuaternion(a.ha.getWorldQuaternion(new Q()).invert());
      gripSide &&= blade.z > .1;
      const mcp = R.bone.RightHandMiddle1, dip = R.bone.RightHandMiddle3;
      // (The DIP joint used to have to sit past the hilt axis too. Geometrically it can't while the finger skin still touches the tsuka — the middle finger is too short for the
      // hilt's distance from the palm — and with the old attack-grip angles it "passed" while the tip hung 12 mm off the hilt. Real wrap is the enclosure check below.)
      if (mcp && dip) gripWrap &&= a.ha.worldToLocal(mcp.getWorldPosition(new V())).x > grip.x;
      samples++;
    }
  };
  for (const k of route) {
    // Keep each leg on the same open ground; keep velocity, facing and all IK
    // history intact so each key reversal still exercises the real turn.
    S.pos.set(2.5, 0, -1); key(k, true);
    try { for (let t = 0; t < 1000; t += 4) { I.frame(0, 4, true); sample(t >= 600); } R.skinning.update();const skin=gripMetrics(I);skinPen=Math.max(skinPen,skin.penetratingSamples);guardPen=Math.max(guardPen,skin.guardPenetratingSamples);skinGap=Math.min(skinGap,skin.minSurfaceGapM);skinEnc=Math.min(skinEnc,skin.enclosureDeg); }
    finally { key(k, false); }
  }
  for (let t = 0; t < 2000; t += 4) { I.frame(0, 4, true); sample(false); }
  return { skinPen,guardPen,skinGap,skinEnc,torso, wrist, minElbow, maxBend, maxBladeAngle, maxBladeElevation, minTorsoLean, maxTorsoLean, maxUpperRoll, minPommelGap, minGuardGap, maxGuardGap, behind, samples, nan, gripSide, gripWrap };
}

// ---- Per-frame shoulder / balance metrics (every 4 ms step) ----
// Character frame: +X = the character's LEFT, +Y up, +Z forward. Roll angles: + = toward the character's left / left side higher.
const rootDir = v => v.applyQuaternion(rig.root.quaternion.clone().invert());
export function poseMetrics() {   // call after ready() (m.run / m.views / m.shoulderTrace do)
  const deg = x => +(x * D).toFixed(1);
  const torso = rootDir(wp('neck').sub(wp('Hips'))), shl = rootDir(wp('LeftArm').sub(wp('RightArm'))), pel = rootDir(wp('LeftUpLeg').sub(wp('RightUpLeg')));
  const head = rootDir(wp('head_end').sub(wp('Head')));
  const inv = R.bone.Spine.matrixWorld.clone().invert(), shL = wp('LeftArm').applyMatrix4(inv), shR = wp('RightArm').applyMatrix4(inv);
  const clav = s => deg(R.bone[s + 'Shoulder'].quaternion.angleTo(R.bind[s + 'Shoulder'].q));
  return {
    torsoRoll: deg(Math.atan2(torso.x, torso.y)), torsoPitch: deg(Math.atan2(torso.z, torso.y)),
    shoulderRoll: deg(Math.atan2(shl.y, Math.hypot(shl.x, shl.z))), pelvisRoll: deg(Math.atan2(pel.y, Math.hypot(pel.x, pel.z))),
    headRoll: deg(Math.atan2(head.x, head.y)), shoulderDyCm: +((shL.y - shR.y) * 100).toFixed(1), clavL: clav('Left'), clavR: clav('Right'),
  };
}
// Anatomical joint angles of one arm (degrees). Hand-bone axes on this rig: fingers +Y, thumb side +Z, palm faces −X (right) / +X (left).
//   elbow  = interior angle shoulder–elbow–wrist (180 straight; a real elbow flexes to ~30–35°)
//   flex   = hand bent toward the palm (+) / back of the hand (−, extension)   radial = toward the thumb (+) / little finger (−, ulnar)
//   ext    = shoulder extension: how far the upper arm points BEHIND the torso's down axis in the torso's sagittal plane
export function armAngles(side) {
  const a = R.arm[side], deg = x => x * D;
  const sh = a.up.getWorldPosition(new V()), el = a.fo.getWorldPosition(new V()), wr = a.ha.getWorldPosition(new V());
  const elbow = deg(sh.clone().sub(el).angleTo(wr.clone().sub(el)));
  const fh = wr.clone().sub(el).normalize().applyQuaternion(a.ha.getWorldQuaternion(new Q()).invert());   // forearm direction in hand space
  const palm = side === 'R' ? -1 : 1;   // hand-local X sign of the palm normal
  // total bend split by direction (polar), so a >90° bend reads as e.g. 110° flexion instead of flipping to ±180 like a per-axis atan2 does
  const bend = Math.acos(Math.max(-1, Math.min(1, fh.y))), phi = Math.atan2(-fh.z, -palm * fh.x);
  const flex = deg(bend * Math.cos(phi)), radial = deg(bend * Math.sin(phi));
  const up = el.clone().sub(sh).normalize().applyQuaternion(rig.chest.getWorldQuaternion(new Q()).invert());   // chest-local: +Y up, +Z forward
  const ext = deg(Math.asin(Math.max(0, Math.min(1, -up.z))));   // 0 = in the frontal plane or forward, 90 = straight back (an arm raised overhead is flexion, not extension)
  // wrist range-of-motion use: 1 = on the anatomical ellipse (LIMITS.wrist), >1 = past what a wrist can do
  const W = LIMITS.wrist, wrist = Math.hypot(flex / (flex >= 0 ? W.flex : W.ext), radial / (radial >= 0 ? W.radial : W.ulnar));
  return { elbow, flex, radial, ext, wrist };
}
// Steps a scenario 4 ms at a time and records, for each shoulder: the shoulder joint's speed in the chest's own frame (a pop = the joint jumping on
// the torso), the clavicle bone's angular speed, and the balance angles above. `steady` = the window used for the roll amplitudes.
export async function shoulderTrace({ until = 2600, runMs = 1200, shift = false, presses = [], fn, steady = [600, 1200], route } = {}) {
  await ready();
  reset();
  const out = { jump: { L: 0, R: 0, at: '' }, clavRate: { L: 0, R: 0, at: '' }, amp: {}, worst: [], samples: [] };
  const prev = {}, rng = {};
  let t = 0, pi = 0, ri = 0;
  if (route) key(route[0], true); else if (runMs) key('a', true, shift);
  while (t < until) {
    if (route && ri < route.length && t >= (ri + 1) * 1000) { key(route[ri], false); ri++; if (ri < route.length) key(route[ri], true); }
    if (!route && runMs && t === runMs) key('a', false, shift);
    if (pi < presses.length && t >= presses[pi]) { (fn ? I[fn] : I.press)(); pi++; }
    I.frame(0, 4, true); t += 4;
    const inv = R.bone.Spine.matrixWorld.clone().invert();
    for (const s of ['L', 'R']) {
      const side = s === 'L' ? 'Left' : 'Right', p = wp(side + 'Arm').applyMatrix4(inv), q = R.bone[side + 'Shoulder'].quaternion.clone();
      if (prev[s]) {
        const v = p.distanceTo(prev[s].p) / .004, w = prev[s].q.angleTo(q) * D / .004;
        if (v > out.jump[s]) { out.jump[s] = v; if (v >= Math.max(out.jump.L, out.jump.R)) out.jump.at = `${t}ms ${s}`; }
        if (w > out.clavRate[s]) { out.clavRate[s] = w; if (w >= Math.max(out.clavRate.L, out.clavRate.R)) out.clavRate.at = `${t}ms ${s}`; }
        if (v > LIMITS.shoulderJumpMax || w > LIMITS.clavRateMax) out.worst.push(`${t}ms ${s} joint ${v.toFixed(2)} m/s clavicle ${Math.round(w)}°/s`);
      }
      prev[s] = { p, q };
      // the off-hand on the RIGHT sword's hilt (two-handed cuts) is recorded apart as 'L2' — see the WARN line in run()
      const aa = armAngles(s), rr = (out.rom ??= {})[s === 'L' && (S.twoEff || 0) > .5 ? 'L2' : s] ??= {};
      for (const k in aa) { const r = rr[k] ??= { min: Infinity, max: -Infinity, minAt: 0, maxAt: 0 }; if (aa[k] < r.min) { r.min = aa[k]; r.minAt = t; } if (aa[k] > r.max) { r.max = aa[k]; r.maxAt = t; } }
    }
    if (t >= steady[0] && t <= steady[1]) {
      const m = poseMetrics(); if (t % 40 === 0) out.samples.push({ t, ...m });
      for (const k in m) { const r = rng[k] ??= [Infinity, -Infinity]; r[0] = Math.min(r[0], m[k]); r[1] = Math.max(r[1], m[k]); }
    }
  }
  if (route) key(route[route.length - 1], false); else key('a', false, shift);
  for (const k in rng) out.amp[k] = { min: rng[k][0], max: rng[k][1], swing: +(rng[k][1] - rng[k][0]).toFixed(1) };
  out.worst = out.worst.slice(0, 8);
  return out;
}

export async function run() {
  await ready();
  const lines = [], fail = [];
  const check = (name, ok, detail) => { lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${detail}`); if (!ok) fail.push(name); };
  const f = x => Math.round(x);
  for (const [name, o] of [['run→stop', { until: 2600, runMs: 1200, legCheck: true }], ['walk→stop', { until: 3000, runMs: 1600, shift: true, legCheck: true }]]) {
    const r = simulate(o), w = Math.max(r.wristR.max, r.wristL.max), e = Math.max(r.elbowR.max, r.elbowL.max);
    check(`${name} wrist`, w <= LIMITS.locoWristMax, `max ${f(w)}°/s (limit ${LIMITS.locoWristMax})`);
    check(`${name} elbow`, e <= LIMITS.locoElbowMax, `max ${e.toFixed(3)} m/s at ${r.elbowAt} (limit ${LIMITS.locoElbowMax})`);
    check(`${name} blade↔legs`, r.bladeLeg >= LIMITS.bladeLegMin, `min ${r.bladeLeg.toFixed(3)} m (limit ${LIMITS.bladeLegMin})`);
    check(`${name} arms inside torso`, r.torso <= LIMITS.locoTorsoMax, `deepest ${(r.torso * 100).toFixed(1)} cm ${r.torsoAt} (limit ${LIMITS.locoTorsoMax * 100} cm)`);
    check(`${name} free-arm flare`, r.flare <= LIMITS.freeFlareMax, `max ${(r.flare * 100).toFixed(0)} cm outboard of the shoulder ${r.flareAt} (limit ${LIMITS.freeFlareMax * 100} cm)`);
    check(`${name} free-arm elbow bend`, r.angMove <= LIMITS.freeMoveAngleMax && r.angWalk <= LIMITS.freeWalkAngleMax && r.angStand <= LIMITS.freeStandAngleMax, `running max ${f(r.angMove)}° (limit ${LIMITS.freeMoveAngleMax}), walking max ${f(r.angWalk)}° (limit ${LIMITS.freeWalkAngleMax}), standing max ${f(r.angStand)}° (limit ${LIMITS.freeStandAngleMax})`);
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
    check(`${name} sword back in the saya`, !S.sword2 && rig.real.backSwords[0].g.visible === (I.BACK_GEAR?.visible ?? true) && !rig.katana2.visible, `sword2 ${S.sword2}, back sword visible ${rig.real.backSwords[0].g.visible}`);
    if (r.worst.length) lines.push('      spikes: ' + r.worst.join(' | ')); }
  { const r = dualHits(); check('dual K K hits', r.thrust && r.dual, `thrust hit ${r.thrust}, dual cut hit ${r.dual}, sword2 shown during the cut ${r.shown}`); }
  { const r = finisherHit(); check('finisher L delayed hit', r.early === 0 && r.late > 0 && !r.kanjiEarly, `dummy hits before the release ${r.early}, after ${r.late}, kanji early ${r.kanjiEarly}`); }
  const h = hits();
  check('hits on the dummy', [0, 1, 2].every(c => h.includes(c)), `beats hit: ${h.map(c => c + 1).join(',') || 'none'}`);
  { const r = await carryTurns();
    check('12 direction changes: right arm outside torso', r.torso <= LIMITS.locoTorsoMax, `deepest ${(r.torso * 100).toFixed(1)} cm (full torso envelope)`);
    check('12 direction changes: right wrist speed', r.wrist <= LIMITS.locoWristMax, `max ${f(r.wrist)}°/s (limit ${LIMITS.locoWristMax})`);
    check('12 direction changes: extended right elbow', r.minElbow >= 150, `min ${f(r.minElbow)}° while settled (minimum 150)`);
    check('12 direction changes: neutral right wrist', r.maxBend <= LIMITS.runWristBendMax, `max ${f(r.maxBend)}° bend while settled (limit ${LIMITS.runWristBendMax})`);
    check('12 direction changes: reference blade angle', r.maxBladeAngle <= LIMITS.runBladeForearmMax, `max ${f(r.maxBladeAngle)}° off forearm (limit ${LIMITS.runBladeForearmMax}; V2 downward blade)`);
    check('12 direction changes: reference torso lean', r.minTorsoLean >= 35 && r.maxTorsoLean <= 45, `${f(r.minTorsoLean)}–${f(r.maxTorsoLean)}° from vertical (reference ≈40°)`);
    check('12 direction changes: blade points down', r.maxBladeElevation <= -10, `highest ${f(r.maxBladeElevation)}° from horizontal (must be below -10°)`);
    check('12 direction changes: relaxed upper-arm roll', r.maxUpperRoll <= 25, `max ${f(r.maxUpperRoll)}° while settled (limit 25)`);
    check('12 direction changes: hand trails shoulder', r.samples > 0 && r.behind === r.samples, `${r.behind}/${r.samples} settled samples at least 20 cm behind`);
    check('12 direction changes: thumb-side sword grip', r.gripSide && r.gripWrap, `blade on thumb side ${r.gripSide}, middle finger wraps hilt ${r.gripWrap}`);
    check('12 direction changes: pommel clears forearm', r.minPommelGap >= .06, `min ${(r.minPommelGap*100).toFixed(1)} cm from forearm axis (minimum 6)`);
    check('12 direction changes: index near guard', r.minGuardGap >= .005 && r.maxGuardGap <= .04, `${(r.minGuardGap*100).toFixed(1)}–${(r.maxGuardGap*100).toFixed(1)} cm below guard (range 0.5–4)`);
    check('12 direction changes: actual hand mesh clears hilt and guard',r.skinPen===0&&r.guardPen===0,`hilt penetrating surface samples ${r.skinPen}, guard ${r.guardPen}, minimum hilt gap ${(r.skinGap*1000).toFixed(1)} mm (surface tolerance 2 mm)`);
    check('12 direction changes: hand skin wraps the hilt', r.skinEnc>=150, `skin within 4 mm of the hilt over ≥${r.skinEnc}° of its circumference (minimum 150°)`);
    check('12 direction changes: NaN', !r.nan, r.nan ? 'NaN in right arm' : 'none');
  }
  // every 4 ms step: shoulder pops + side-to-side sway (see shoulderTrace)
  for (const [name, o] of [['run→stop', { until: 2600, runMs: 1200, steady: [700, 1200] }], ['walk→stop', { until: 3000, runMs: 1600, shift: true, steady: [900, 1600] }],
                           ['combo (standing)', { until: 1900, runMs: 0, presses: [0, 420, 860], steady: [0, 0] }], ['run reversals', { until: 6000, route: ['a', 'd', 'a', 'd', 'w', 's'], steady: [0, 0] }],
                           ['thrust K', { until: 1200, runMs: 0, presses: [0], fn: 'pressK', steady: [0, 0] }], ['dual K K', { until: 2000, runMs: 0, presses: [0, 340], fn: 'pressK', steady: [0, 0] }],
                           ['finisher L', { until: 2000, runMs: 0, presses: [0], fn: 'pressL', steady: [0, 0] }]]) {
    const r = await shoulderTrace(o), j = Math.max(r.jump.L, r.jump.R), c = Math.max(r.clavRate.L, r.clavRate.R);
    // joint range of motion, every frame, both arms
    const m2 = r.rom.L2;
    if (m2) lines.push(`WARN  ${name} left wrist ON THE HILT (two-handed): peak ${(m2.wrist.max * 100).toFixed(0)}% of the anatomical ellipse at ${m2.wrist.maxAt}ms (flex ${f(m2.flex.min)}…${f(m2.flex.max)}°, radial ${f(m2.radial.min)}…${f(m2.radial.max)}°) — KNOWN (2026-10-21): the two-handed grip pose itself needs re-authoring; not counted as a FAIL yet`);
    for (const s of ['R', 'L']) {
      const m = r.rom[s], arm = s === 'R' ? 'right' : 'left';
      if (!m) continue;
      check(`${name} ${arm} wrist range`, m.wrist.max <= 1.03, `peak ${(m.wrist.max * 100).toFixed(0)}% of the anatomical ellipse at ${m.wrist.maxAt}ms (flex ${f(m.flex.min)}…${f(m.flex.max)}°, radial ${f(m.radial.min)}…${f(m.radial.max)}°; limits flex ${LIMITS.wrist.flex}/ext ${LIMITS.wrist.ext}/radial ${LIMITS.wrist.radial}/ulnar ${LIMITS.wrist.ulnar})`);
      check(`${name} ${arm} elbow/shoulder range`, m.elbow.min >= LIMITS.elbowMin && m.ext.max <= LIMITS.shoulderExtMax, `elbow min ${f(m.elbow.min)}° at ${m.elbow.minAt}ms (≥ ${LIMITS.elbowMin}), shoulder extension max ${f(m.ext.max)}° at ${m.ext.maxAt}ms (≤ ${LIMITS.shoulderExtMax})`);
    }
    check(`${name} shoulder joint per frame`, j <= LIMITS.shoulderJumpMax, `max ${j.toFixed(2)} m/s at ${r.jump.at} in the chest frame (limit ${LIMITS.shoulderJumpMax})`);
    check(`${name} clavicle rate per frame`, c <= LIMITS.clavRateMax, `max ${f(c)}°/s at ${r.clavRate.at} (limit ${LIMITS.clavRateMax})`);
    if (name === 'run→stop') {
      const a = r.amp, rs = k => `${a[k].min}…${a[k].max}° (swing ${a[k].swing})`;
      check('run sway: torso roll', a.torsoRoll.swing <= LIMITS.runRollSwingMax, `${rs('torsoRoll')} (limit swing ${LIMITS.runRollSwingMax})`);
      check('run sway: shoulder line', a.shoulderRoll.swing <= LIMITS.runShoulderRollSwingMax, `${rs('shoulderRoll')} (limit swing ${LIMITS.runShoulderRollSwingMax}); pelvis ${rs('pelvisRoll')}, head ${rs('headRoll')}, L−R shoulder height ${a.shoulderDyCm.min}…${a.shoulderDyCm.max} cm`);
    }
  }
  lines.unshift(fail.length ? `MOTION CHECK: ${fail.length} FAIL` : 'MOTION CHECK: all PASS');
  lines.push('Now LOOK at it from every side: await m.views({mode:"run"|"walk"|"combo"}) → 8 frames × front/right/back/left, saved to out/motion-views-<mode>.png — open that file.');
  try { await fetch('/debug/save?name=motion-check.json', { method: 'POST', body: JSON.stringify({ fail: fail.length, failed: fail, lines, at: Date.now() }, null, 1) }); } catch (e) { lines.push('(could not save out/motion-check.json: ' + e.message + ')'); }
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
                 idle:  { presses: [], runMs: 0, times: [900, 1000, 1100, 1200, 1300, 1400] },
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
// Definition-of-done capture: the SAME 8 frames seen from the front, the character's right, the back and the left (4 rows × 8 columns), with the
// per-frame balance numbers (poseMetrics) printed under each frame. Saves out/motion-views-<mode>.png + .json (the Stop hook checks for them).
//   await m.views({mode:'run'})   modes: run | stop (run → stop) | walk | combo | thrust | dual | issen | idle
//   extra options: skeleton:true (draw the real bones over the body, like the in-game Skeleton toggle), angles:['front'] (subset), times:[...] (ms),
//   tag:'x' (saves motion-views-<mode>-x.* instead, so a close-up study doesn't replace the definition-of-done capture)
export async function views({ mode = 'run', pitch = 6, zoom = 1.3, fy = .95, width = .34, save = true, skeleton = false, angles, times: tOverride, tag = '' } = {}) {
  await ready();
  const sc0 = rig.root.parent; let k = rig.katana; while (k.parent && k.parent !== sc0) k = k.parent;
  const keep = new Set([rig.root, k, rig.katana2]); for (const e of rig.eyes) { let p = e; while (p.parent && p.parent !== sc0) p = p.parent; keep.add(p); }
  for (const s of rig.real?.backSwords || []) keep.add(s.g);
  for (const c of sc0.children) { if (keep.has(c) || c.isLight || c.isCamera || (c.isMesh && c.renderOrder === 5) || (c.type === 'Object3D' && !c.children.length)) continue; if (skeleton && c.renderOrder === 10) continue; c.visible = false; }
  const bb = document.getElementById('bBones');
  if (skeleton && bb && bb.getAttribute('aria-pressed') !== 'true') bb.click();
  const ev = (a, n, step) => Array.from({ length: n }, (_, i) => a + i * step);
  const plan = { run: { runMs: 1500, times: ev(860, 8, 79) },   // one 0.633 s RunningV2 cycle, steady speed
                 stop: { runMs: 1200, times: [1100, 1180, 1240, 1300, 1360, 1440, 1560, 1800] },
                 walk: { runMs: 2400, shift: true, times: ev(1200, 8, 130) },
                 idle: { times: ev(600, 8, 120) },
                 combo: { presses: [0, 420, 860], times: [100, 190, 300, 450, 600, 760, 1000, 1250] },
                 thrust: { presses: [0], fn: 'pressK', times: [60, 170, 220, 260, 300, 420, 640, 900] },
                 dual: { presses: [0, 340], fn: 'pressK', times: [400, 520, 620, 760, 980, 1180, 1420, 1700] },
                 issen: { presses: [0], fn: 'pressL', times: [250, 540, 610, 640, 700, 1150, 1320, 1600] } }[mode];
  if (!plan) throw new Error('views: unknown mode ' + mode);
  if (tOverride) plan.times = tOverride;
  const ANG = [['front', 0], ['right', -90], ['back', 180], ['left', 90]].filter(a => !angles || angles.includes(a[0]));
  const lunged = { combo: I.COMBO, thrust: [I.ATTACK2, I.DUAL], dual: [I.ATTACK2, I.DUAL], issen: [I.ISSEN] }[mode] || [];
  for (const d of lunged) { d._lunge ??= d.lunge; d.lunge = 0; }   // keep the character in frame
  reset();
  const cv = document.querySelector('canvas'), W = cv.width, H = cv.height, cw = Math.round(W * width), ch = Math.round(H * .8), cx = Math.round(W * .5 - cw / 2);
  const cols = plan.times.length, s = Math.min(3600 / (cols * cw), 1), lab = 34;
  let out = document.getElementById('motionSheet');
  if (!out) { out = document.createElement('canvas'); out.id = 'motionSheet'; out.style.cssText = 'position:fixed;left:0;top:0;z-index:99;background:#fff;max-width:100vw;max-height:100vh'; document.body.appendChild(out); }
  out.style.display = 'block'; out.width = cols * cw * s; out.height = ANG.length * (ch * s + lab);
  const g = out.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, out.width, out.height);
  const frames = [];
  if (plan.runMs) key('a', true, plan.shift);
  let t = 0, i = 0, pi = 0;
  while (i < cols) {
    if (plan.runMs && t === plan.runMs) key('a', false, plan.shift);
    if (pi < (plan.presses || []).length && t >= plan.presses[pi]) { (plan.fn ? I[plan.fn] : I.press)(); pi++; }
    if (t >= plan.times[i]) {
      const m = poseMetrics(), saved = [I.CAM.yaw.y, I.CAM.yawT, I.CAM.focus.clone(), I.CAM.pitch.y, I.CAM.pitchT, I.CAM.zoom.y, I.CAM.zoomT];
      ANG.forEach(([name, yawOff], r) => {
        I.CAM.yaw.y = I.CAM.yawT = rig.root.rotation.y * D + yawOff; I.CAM.pitch.y = I.CAM.pitchT = pitch; I.CAM.zoom.y = I.CAM.zoomT = zoom; I.CAM.focus.set(S.pos.x, fy, S.pos.z); I.frame(0, 0);
        const x = i * cw * s, y = r * (ch * s + lab);
        g.drawImage(cv, cx, 0, cw, ch, x, y, cw * s, ch * s); g.strokeStyle = '#999'; g.strokeRect(x, y, cw * s, ch * s);
        g.fillStyle = '#c00'; g.font = 'bold 20px sans-serif'; g.fillText(`${name} ${plan.times[i]}ms`, x + 6, y + 22);
        g.fillStyle = '#222'; g.font = '15px sans-serif';
        g.fillText(`torso roll ${m.torsoRoll}°  shoulders ${m.shoulderRoll}°  pelvis ${m.pelvisRoll}°  head ${m.headRoll}°`, x + 4, y + ch * s + 15);
        g.fillText(`L−R shoulder ${m.shoulderDyCm} cm  clavicle L ${m.clavL}° R ${m.clavR}°  pitch ${m.torsoPitch}°`, x + 4, y + ch * s + 31);
      });
      [I.CAM.yaw.y, I.CAM.yawT] = saved; I.CAM.focus.copy(saved[2]); I.CAM.pitch.y = saved[3]; I.CAM.pitchT = saved[4]; I.CAM.zoom.y = saved[5]; I.CAM.zoomT = saved[6];   // movement is camera-relative: don't steer the run
      frames.push({ t: plan.times[i], speed: +Math.hypot(S.vel.x, S.vel.z).toFixed(2), ...m });
      i++; continue;
    }
    I.frame(0, 4, true); t += 4;
  }
  key('a', false, plan.shift);
  for (const d of lunged) d.lunge = d._lunge;
  const data = { mode, angles: ANG.map(a => a[0]), frames, at: Date.now() };
  let saved = '';
  if (save) {
    try {
      const blob = await new Promise(r => out.toBlob(r, 'image/png'));
      await fetch(`/debug/save?name=motion-views-${mode}${tag ? "-" + tag : ""}.png`, { method: 'POST', body: blob });
      await fetch(`/debug/save?name=motion-views-${mode}${tag ? "-" + tag : ""}.json`, { method: 'POST', body: JSON.stringify(data, null, 1) });
      saved = ` → saved out/motion-views-${mode}${tag ? "-" + tag : ""}.png + .json (open the PNG to look at it)`;
    } catch (e) { saved = ' (save failed: ' + e.message + ')'; }
  }
  const sw = k => { const v = frames.map(f => f[k]); return `${Math.min(...v)}…${Math.max(...v)}`; };
  return `views ${mode}: ${cols} frames × ${ANG.length} angles; torso roll ${sw('torsoRoll')}°, shoulder line ${sw('shoulderRoll')}°, pelvis ${sw('pelvisRoll')}°, head ${sw('headRoll')}°${saved}`;
}
export function hideSheet() { const o = document.getElementById('motionSheet'); if (o) o.style.display = 'none'; }
