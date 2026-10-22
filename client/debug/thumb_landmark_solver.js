// Right-thumb pose from 2D landmarks read off the reference (FIST.thumbQR), for /debug/ref-overlay.html.
//   const m = await import('/debug/thumb_landmark_solver.js?'+Date.now());
//   refOverlay.set({view:'bottom', pose:'idle', spin:38, tilt:2, scale:1.36, clip:7, show:'side'});   // the view the targets are given in
//   const r = m.solve(refOverlay, {tip:[338,342], ip:[362,262]});   // → {cost, S (joints in render px: x, y, depth), qs}; qs goes into FIST.thumbQR in index.html
// Targets are in the overlay's render pixels (1024×764, ref quadrant ×2): x along the hilt from the tsuba, y down, depth = along the view direction (+ = away from
// the camera). Fit: thumb tip (Thumb4) and IP joint (Thumb3) to their targets, joints kept in front of the hilt (depth limits `dl`), clear of the tsuka
// (same oval/profile test as thumb_solver.js) and of the index/middle bone lines, joint rotations small (soft limits). Simple (1+1) random search, ~1 s.
import * as TS from '/debug/thumb_solver.js';
const PROFILE = [[-.172, 0.01343], [-.15, 0.01428], [-.06, 0.01496], [.03, 0.01428], [.054, 0.01377], [.06, 0.01572], [.076, 0.01488], [.078, 0.01488]];   // = index.html TSUKA_PROFILE
const rad = y => { for (let k = 1; k < PROFILE.length; k++) if (y <= PROFILE[k][0]) { const a = PROFILE[k - 1], b = PROFILE[k]; return a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]); } return .01462; };
const TR = [.0125, .0105, .0090];   // thumb segment radii (m)

/* the overlay's camera for the CURRENT sliders (bottom view) — same maths as renderModel() in ref-overlay.html */
function basis(O) {
  const I = O.I, R = I.rig.real, V = R.hipsPos.constructor, Q = R.arm.R.ha.quaternion.constructor, kat = I.rig.katana, ha = R.arm.R.ha, $ = id => +document.getElementById(id).value;
  kat.updateMatrixWorld(true);
  const a = new V(0, -1, 0).applyQuaternion(kat.getWorldQuaternion(new Q())).normalize();
  const n = new V(1, 0, 0).applyQuaternion(ha.getWorldQuaternion(new Q())); n.addScaledVector(a, -n.dot(a)).normalize();
  const v = O.VIEWS.bottom, L = n.clone(), Rt = a.clone();
  L.applyAxisAngle(a, $('spin') * Math.PI / 180);
  const ax = new V().crossVectors(L, a).normalize(); L.applyAxisAngle(ax, $('tilt') * Math.PI / 180); Rt.applyAxisAngle(ax, $('tilt') * Math.PI / 180); Rt.addScaledVector(L, -Rt.dot(L)).normalize();
  const U = new V().crossVectors(Rt, L).normalize(), K = 2, W = 512 * K, H = 382 * K, ppm = v.dia * K / (.034 * .85) * $('scale');
  const T = kat.localToWorld(new V(0, .08, 0)).addScaledVector(Rt, -(v.tsuba[0] * K - W / 2) / ppm).addScaledVector(U, -(H / 2 - v.tsuba[1] * K) / ppm);
  return { ppm, P: p => { const d = p.clone().sub(T); return [W / 2 + d.dot(Rt) * ppm, H / 2 - d.dot(U) * ppm, d.dot(L) * ppm]; } };
}
export function solve(O, { tip = [338, 342], ip = [362, 262], dl = [null, 100, -60, -175], restarts = 12, iters = 1500, seed = 99 } = {}) {
  const I = O.I, R = I.rig.real, V = R.hipsPos.constructor, Q = R.arm.R.ha.quaternion.constructor, Kt = I.rig.katana, B = basis(O), bone = n => R.bone['RightHand' + n];
  const fing = {}; for (const f of ['Index', 'Middle']) fing[f] = [1, 2, 3, 4].map(i => bone(f + i).getWorldPosition(new V()));
  const segDist = (p, a, b) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
  const rv2q = v => { const a = Math.hypot(...v) || 1e-9; return new Q().setFromAxisAngle(new V(v[0] / a, v[1] / a, v[2] / a), a); };
  const cur = I.FIST.thumbQR.map(q => { const qq = new Q().fromArray(q), a = 2 * Math.acos(Math.min(1, Math.abs(qq.w))), s = Math.sqrt(1 - qq.w * qq.w) || 1, sg = qq.w < 0 ? -1 : 1; return [sg * qq.x / s * a, sg * qq.y / s * a, sg * qq.z / s * a]; }).flat();
  const pos = () => ['Thumb1', 'Thumb2', 'Thumb3', 'Thumb4'].map(n => bone(n).getWorldPosition(new V()));
  function cost(p, detail) {
    TS.apply(I, [0, 1, 2].map(i => rv2q(p.slice(3 * i, 3 * i + 3)).toArray()));
    const P = pos(), S = P.map(w => B.P(w)); let c = (S[3][0] - tip[0]) ** 2 + (S[3][1] - tip[1]) ** 2 + .3 * ((S[2][0] - ip[0]) ** 2 + (S[2][1] - ip[1]) ** 2);
    for (let i = 1; i < 4; i++) if (S[i][2] > dl[i]) c += (S[i][2] - dl[i]) ** 2 * .5;   // stay in front of the hilt (depth is + away from the camera)
    const pk = P.map(w => Kt.worldToLocal(w.clone())); let hv = 0, fv = 0;
    for (let s = 0; s < 3; s++) for (let t = 0; t <= 1; t += .25) { const q = pk[s].clone().lerp(pk[s + 1], t); if (q.y < -.172 || q.y > .078) continue; const v = Math.hypot(q.x / 1.06, q.z / .86) - rad(q.y) - (TR[s] * .85 - .0012); if (v < 0) hv += (v * B.ppm) ** 2; }
    const req = [0, .0155, .0145];
    for (let s = 1; s < 3; s++) for (let t = 0; t <= 1; t += .25) { const q = P[s].clone().lerp(P[s + 1], t); for (const f in fing) for (let k = 0; k < 3; k++) { const d = segDist(q, fing[f][k], fing[f][k + 1]); if (d < req[s]) fv += ((req[s] - d) * B.ppm) ** 2; } }
    c += (hv + fv) * 3;
    for (let i = 0; i < 3; i++) { const m = Math.hypot(...p.slice(3 * i, 3 * i + 3)), lim = [1.3, 1.2, 1.4][i]; if (m > lim) c += ((m - lim) * 400) ** 2; }
    c += p.reduce((a, x) => a + x * x, 0) * 20;
    return detail ? { c: Math.round(c), S: S.map(s => s.map(Math.round)), hiltPx: Math.round(Math.sqrt(hv)), fingerPx: Math.round(Math.sqrt(fv)) } : c;
  }
  let s = seed; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296, gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(6.2832 * rnd());
  let best = null, bc = 1e18;
  for (let r = 0; r < restarts; r++) {
    let p = r === 0 ? cur.slice() : cur.map(x => x + gauss() * .4), c = cost(p), step = .25;
    for (let it = 0; it < iters; it++) { const q = p.map(x => x + gauss() * step * (rnd() < .5 ? 1 : .3)), cq = cost(q); if (cq < c) { p = q; c = cq; } else if (it % 100 === 99) step *= .8; }
    if (c < bc) { bc = c; best = p; }
  }
  const detail = cost(best, true);
  return { cost: Math.round(bc), ...detail, qs: I.FIST.thumbQR.map(q => q.map(x => +x.toFixed(5))) };
}
