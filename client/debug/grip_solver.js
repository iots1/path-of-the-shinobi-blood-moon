// Run-grip solver — finds the right hand's finger curl (FIST.runAng) for the CURRENT RUN_HOLD seat, measured on the skinned mesh.
// Use from /debug/run-overlay.html (the page has `I` = iframe's __iso, `R` = I.rig.real):
//   const gs = await import('/debug/grip_solver.js?'+Date.now());
//   R.loco.u=.3; for(let k=0;k<40;k++)advance(8);   // the overlay page's advance(): run pose, grip settled (it re-pins the position/heading each call)
//   const sol = gs.solveFingers(I);     // → {Index:{angles:[mcp,pip,dip],cover,min,...}, ...}
//   gs.apply(I, sol); gs.report(I);     // set them / measure enclosure + gaps (copy `angles` into FIST.runAng in client/index.html)
// The hilt surface profile is the tsuka (+ habaki/tsuba region excluded) of the katana prop — keep in sync with rig_detail.js gripMetrics.
const PROFILE = [[-.172, .0158], [-.15, .0168], [-.06, .0176], [.03, .0168], [.054, .0162], [.06, .0185], [.076, .0175], [.078, .0175]];
const radius = y => { for (let k = 1; k < PROFILE.length; k++) if (y <= PROFILE[k][0]) { const a = PROFILE[k - 1], b = PROFILE[k]; return a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]); } return .0172; };
const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];

// the curl axis the game uses for this finger while running (FIST.runAxisTilt leans it toward the finger direction, see setFingers)
const axisOf = (I, c, V) => c.A.clone().applyAxisAngle(new V(1, 0, 0), (I.FIST.runAxisTilt || 0) * Math.PI / 180);
function ctx(I) {
  if (I.__gs) return I.__gs;
  const R = I.rig.real, V = R.hipsPos.constructor, Q = R.arm.R.ha.quaternion.constructor;
  let mesh; R.model.traverse(o => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  const ids = mesh.geometry.attributes.skinIndex, w = mesh.geometry.attributes.skinWeight, names = mesh.skeleton.bones.map(b => b.name);
  const verts = {};
  for (const F of [...FINGERS, 'Thumb', 'Palm']) verts[F] = [];
  for (let i = 0; i < ids.count; i++) {
    let hand = 0, best = null, bw = 0;
    for (let k = 0; k < 4; k++) { const n = names[ids.array[i * 4 + k]]; if (n.includes('RightHand')) { hand += w.array[i * 4 + k]; if (w.array[i * 4 + k] > bw) { bw = w.array[i * 4 + k]; best = n; } } }
    if (hand < .5) continue;
    verts[(/Index|Middle|Ring|Pinky|Thumb/.exec(best) || ['Palm'])[0]].push(i);
  }
  const chains = {}; for (const F of FINGERS) chains[F] = R.fingers.find(f => f.side === 'Right' && f.f === F);
  return I.__gs = { R, V, Q, mesh, verts, chains };
}
// gaps (m, + = outside the hilt surface) and angular bins (10°) of one vertex group, in hilt space
function sample(I, group, thr = .003) {
  const { R, V, mesh, verts } = ctx(I), gaps = [], bins = new Set();
  for (const i of verts[group]) {
    const p = R.skinning.getVertexPosition(i, new V()).applyMatrix4(mesh.matrixWorld); I.rig.katana.worldToLocal(p);
    if (p.y < -.172 || p.y > .078) continue;
    const gap = Math.hypot(p.x / 1.06, p.z / .86) - radius(p.y); gaps.push(gap);
    if (gap < thr) bins.add(Math.floor(((Math.atan2(p.z, p.x) * 180 / Math.PI) + 360) % 360 / 10));
  }
  gaps.sort((a, b) => a - b);
  return { gaps, bins };
}
export function apply(I, sol) {
  const { chains, Q, R, V } = ctx(I);
  for (const F of FINGERS) { const a = sol[F].angles ?? sol[F], c = chains[F]; c.joints.forEach((j, k) => j.b.quaternion.copy(j.prevInv).multiply(new Q().setFromAxisAngle(axisOf(I, c, V), a[k])).multiply(j.bindH)); }
  R.skinning.update();
}
// per finger: no vertex deeper than `maxPen` into the hilt, maximise the arc of hilt its skin lies within 3 mm of (+ a little closeness)
export function solveFingers(I, { maxPen = .002, nat = 40, step = .1, limits = { a: [0, 1.5], b: [.1, 1.8], c: [.05, 1.3] } } = {}) {
  const { chains, Q, R, V } = ctx(I), out = {};
  for (const F of FINGERS) {
    const c = chains[F]; let best = { score: -1e9 };
    for (let a = limits.a[0]; a <= limits.a[1] + 1e-9; a += step) for (let b = limits.b[0]; b <= limits.b[1] + 1e-9; b += step) for (let d = limits.c[0]; d <= limits.c[1] + 1e-9; d += step) {
      if (a + b + d > 3.2 || d > .9 * b + .3) continue;
      c.joints.forEach((j, k) => j.b.quaternion.copy(j.prevInv).multiply(new Q().setFromAxisAngle(axisOf(I, c, V), [a, b, d][k])).multiply(j.bindH));
      R.skinning.update();
      const { gaps, bins } = sample(I, F); if (!gaps.length) continue;
      const pen = gaps.reduce((s, g) => s + Math.min(g + maxPen, 0) ** 2, 0) * 4e5;
      const near = gaps.slice(0, Math.max(3, Math.round(gaps.length * .15))).reduce((s, g) => s + (g - .0015) ** 2, 0) / Math.max(3, Math.round(gaps.length * .15));
      const score = bins.size * 10 - pen * 100 - near * 2e4 - ((b - 1.2 * a) ** 2 + (d - .7 * b) ** 2) * nat;
      if (score > best.score) best = { score, angles: [+a.toFixed(2), +b.toFixed(2), +d.toFixed(2)], cover: bins.size * 10, min: +(gaps[0] * 1000).toFixed(1) };
    }
    out[F] = best;
    c.joints.forEach((j, k) => j.b.quaternion.copy(j.prevInv).multiply(new Q().setFromAxisAngle(axisOf(I, c, V), best.angles[k])).multiply(j.bindH)); R.skinning.update();
  }
  return out;
}
export function report(I) {
  const { R } = ctx(I); R.skinning.update();
  const per = {}, all = new Set(); let minGap = 9;
  for (const g of [...FINGERS, 'Thumb', 'Palm']) { const s = sample(I, g, .004); per[g] = { cover: s.bins.size * 10, min: +(s.gaps[0] * 1000).toFixed(1) }; s.bins.forEach(b => all.add(b)); minGap = Math.min(minGap, s.gaps[0]); }
  return { enclosure: all.size * 10, minGapMm: +(minGap * 1000).toFixed(1), per };
}
// forearm/blade/finger-axis angles in the side plane
export function angles(I) {
  const { R, V } = ctx(I), kat = I.rig.katana, fwd = new V(0, 0, 1).applyQuaternion(I.rig.root.quaternion);
  const d = kat.localToWorld(new V(0, .795, 0)).sub(kat.localToWorld(new V(0, 0, 0))).normalize();
  const el = R.bone.RightForeArm.getWorldPosition(new V()), ha = R.bone.RightHand.getWorldPosition(new V()), mid = R.bone.RightHandMiddle1.getWorldPosition(new V());
  const fa = ha.clone().sub(el).normalize(), fing = mid.clone().sub(ha).normalize(), deg = x => +(x * 180 / Math.PI).toFixed(1);
  return { bladeDown: deg(Math.atan2(-d.y, -d.dot(fwd))), forearmDown: deg(Math.atan2(-fa.y, -fa.dot(fwd))), bladeVsForearm: deg(Math.acos(fa.dot(d))), wristBend: deg(Math.acos(fa.dot(fing))) };
}
