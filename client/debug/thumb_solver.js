// Right-thumb grip solver for the rebuilt hands (FIST.thumbQR = one hand-relative quaternion per thumb joint).
// Use from /debug/ref-overlay.html (pose 'idle' drawn once so the grip is settled):
//   const ts = await import('/debug/thumb_solver.js?'+Date.now());
//   const r = ts.solve(refOverlay.I);   // → {best:{q,...}, tried} ; best.q goes into FIST.thumbQR in client/index.html
//   ts.apply(refOverlay.I, r.best.q); refOverlay.reset(); refOverlay.set({view:'bottom'});
// Stage 1 (bones only, fast): metacarpal rotated about any axis (80 Fibonacci directions × angle), the two phalanges flexed about the HILT axis (so the
// thumb follows the hilt's curve); kept: segments clear of the tsuka by the thumb's radius, tip near the index's middle phalanx (reference: the thumb tip
// rests on it). Stage 2 (skinned mesh): every candidate is posed and scored by thumb skin vs the tsuka (triangle samples, ≤ maxPen inside) and thumb
// skin vs the index finger (vertex depth inside the index's capsule), then by how close the tip is to the index's middle phalanx.
const PROFILE = [[-.172, .0158], [-.15, .0168], [-.06, .0176], [.03, .0168], [.054, .0162], [.06, .0185], [.076, .0175], [.078, .0175]];
const rad = y => { for (let k = 1; k < PROFILE.length; k++) if (y <= PROFILE[k][0]) { const a = PROFILE[k - 1], b = PROFILE[k]; return a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]); } return .0172; };
const TR = [.0125, .0105, .0090], IR = .0092;   // thumb segment radii, index radius (bone line → skin), metres
function fib(V, n) { const o = []; for (let i = 0; i < n; i++) { const y = 1 - 2 * (i + .5) / n, r = Math.sqrt(1 - y * y), t = i * 2.39996; o.push(new V(Math.cos(t) * r, y, Math.sin(t) * r)); } return o; }
function ctx(I) {
  const R = I.rig.real, V = R.hipsPos.constructor, Q = R.arm.R.ha.quaternion.constructor, M4 = R.arm.R.ha.matrixWorld.constructor;
  const ha = R.arm.R.ha, K = I.rig.katana, ch = R.fingers.find(f => f.side === 'Right' && f.thumb);
  let mesh; R.model.traverse(o => { if (o.isSkinnedMesh) mesh = o; });
  return { R, V, Q, M4, ha, K, ch, mesh };
}
export function apply(I, qs) {
  const { ch } = ctx(I);
  I.FIST.thumbQR = qs.map(q => q.slice());
  ch.joints.forEach((j, k) => j.b.quaternion.copy(j.prevInv).multiply(new (j.b.quaternion.constructor)().fromArray(qs[k])).multiply(j.bindH));
  ch.joints[0].b.updateMatrixWorld(true);
}
const segDist = (p, a, b) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
function candidates(I, { fingerGap = .012, keep = 24 } = {}) {
  const { R, V, Q, M4, ha, K, ch } = ctx(I);
  const save = ch.joints.map(j => j.b.quaternion.clone());
  ch.joints.forEach(j => j.b.quaternion.copy(j.prevInv).multiply(j.bindH)); ch.joints[0].b.updateMatrixWorld(true);
  const hinv = ha.matrixWorld.clone().invert(), HL = b => b.getWorldPosition(new V()).applyMatrix4(hinv);
  const bj = [...ch.joints.map(j => HL(j.b)), HL(R.bone.RightHandThumb4)];
  ch.joints.forEach((j, k) => j.b.quaternion.copy(save[k])); ch.joints[0].b.updateMatrixWorld(true);
  const seg = [0, 1, 2].map(i => bj[i + 1].clone().sub(bj[i]));
  const H2K = new M4().copy(K.matrixWorld).invert().multiply(ha.matrixWorld), toK = p => p.clone().applyMatrix4(H2K);
  const idx = [2, 3].map(i => toK(HL(R.bone['RightHandIndex' + i])));
  const others = []; for (const f of ['Index', 'Middle']) for (let i = 1; i < 4; i++) others.push([toK(HL(R.bone[`RightHand${f}${i}`])), toK(HL(R.bone[`RightHand${f}${i + 1}`]))]);
  const h = I.runCurlAxis('none', new V()).normalize(), list = [];
  for (const ax of fib(V, 80)) for (let a = 0; a <= 1.4; a += .1) {
    const q1 = new Q().setFromAxisAngle(ax, a), j2 = bj[0].clone().add(seg[0].clone().applyQuaternion(q1));
    for (const sgn of [1, -1]) for (let b = 0; b <= 1.4; b += .1) for (let c = 0; c <= 1.4; c += .1) {
      const q2 = new Q().setFromAxisAngle(h, sgn * b).multiply(q1), q3 = new Q().setFromAxisAngle(h, sgn * (b + c)).multiply(q1);
      const j3 = j2.clone().add(seg[1].clone().applyQuaternion(q2)), j4 = j3.clone().add(seg[2].clone().applyQuaternion(q3));
      const P = [bj[0], j2, j3, j4].map(toK); let ok = true;
      for (let s = 0; s < 3 && ok; s++) for (let t = 0; t <= 1; t += .25) { const p = P[s].clone().lerp(P[s + 1], t); if (p.y < -.172 || p.y > .078) continue; if (Math.hypot(p.x / 1.06, p.z / .86) - rad(p.y) - (TR[s] * .85 - .0012) < 0) { ok = false; break; } }
      if (!ok) continue;
      for (const [a1, b1] of others) for (let s = 1; s < 3; s++) if (segDist(P[s].clone().lerp(P[s + 1], .5), a1, b1) < fingerGap) ok = false;
      if (!ok) continue;
      const dTip = segDist(P[3], idx[0], idx[1]);
      // setFingers chains them: joint k's hand-relative rotation = qa1·…·qak (prevInv = inverse of the previous BIND), so store relative ones
      const r2 = q1.clone().invert().multiply(q2), r3 = q2.clone().invert().multiply(q3);
      list.push({ pre: -Math.abs(dTip - .017) * 400 - (a * a + b * b + c * c) * 1.5, dTip, q: [q1, r2, r3].map(q => q.toArray()) });
    }
  }
  list.sort((x, y) => y.pre - x.pre);
  // spread the kept candidates: skip near-duplicates (tip within 4 mm of one already kept)
  const out = [];
  for (const c of list) { if (out.length >= keep) break; if (out.every(o => Math.abs(o.dTip - c.dTip) > .001 || o.pre - c.pre > 2)) out.push(c); }
  return out;
}
function meshScore(I, maxPen) {
  const { R, V, K, mesh } = ctx(I); R.skinning.update();
  const ids = mesh.geometry.attributes.skinIndex, w = mesh.geometry.attributes.skinWeight, names = mesh.skeleton.bones.map(b => b.name);
  const thumbV = [];
  for (let i = 0; i < ids.count; i++) { let best = null, bw = 0; for (let k = 0; k < 4; k++) if (w.array[i * 4 + k] > bw) { bw = w.array[i * 4 + k]; best = names[ids.array[i * 4 + k]]; } if (best && /RightHandThumb[23]/.test(best)) thumbV.push(i); }
  const iw = [2, 3, 4].map(i => R.bone['RightHandIndex' + i].getWorldPosition(new V()));
  let hiltMin = 1, idxMin = 1; const bins = new Set();
  for (const i of thumbV) {
    const pw = R.skinning.getVertexPosition(i, new V()).applyMatrix4(mesh.matrixWorld), p = K.worldToLocal(pw.clone());
    if (p.y >= -.172 && p.y <= .078) { const g = Math.hypot(p.x / 1.06, p.z / .86) - rad(p.y); hiltMin = Math.min(hiltMin, g); if (g < .004) bins.add(Math.floor(((Math.atan2(p.z, p.x) * 180 / Math.PI) + 360) % 360 / 10)); }
    idxMin = Math.min(idxMin, segDist(pw, iw[0], iw[1]) - IR, segDist(pw, iw[1], iw[2]) - IR);
  }
  const tip = R.bone.RightHandThumb4.getWorldPosition(new V()), dTip = segDist(tip, iw[0], iw[1]);
  return { hiltMin, idxMin, cover: bins.size * 10, dTip, ok: hiltMin > -maxPen && idxMin > -.003 };
}
export function solve(I, { maxPen = .0015, fingerGap = .012, keep = 24 } = {}) {
  const cands = candidates(I, { fingerGap, keep }); let best = null;
  for (const c of cands) {
    apply(I, c.q); const m = meshScore(I, maxPen);
    const sc = (m.ok ? 0 : -1000) - Math.abs(m.dTip - .017) * 400 + m.cover * .2 + Math.min(0, m.idxMin) * 2000;
    if (!best || sc > best.sc) best = { sc, q: c.q, hiltMinMm: +(m.hiltMin * 1000).toFixed(1), indexMinMm: +(m.idxMin * 1000).toFixed(1), cover: m.cover, tipToIndexMidCm: +(m.dTip * 100).toFixed(2), ok: m.ok };
  }
  if (best) apply(I, best.q);
  return { best, tried: cands.length };
}
