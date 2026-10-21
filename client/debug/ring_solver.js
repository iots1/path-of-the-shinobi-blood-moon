// Ring-grip solver for the right fingers (FIST.ringAng; see ringQ in client/index.html: each finger is turned ⟂ to the hilt, then every joint flexes
// about the hilt axis, so the finger forms a ring round the hilt). Searches the three per-joint flexion increments so the finger's bone centreline
// follows a circle of radius (tsuka radius + finger radius·k) round the hilt axis and never comes closer than that minus `slack`.
// Use from /debug/ref-overlay.html with pose 'idle' drawn (grip settled):
//   const rs = await import('/debug/ring_solver.js?'+Date.now()); const sol = rs.solve(refOverlay.I); // → {Index:[a,b,c], …, report}
//   refOverlay.I.FIST.ringAng = sol.ang; refOverlay.reset(); refOverlay.set({view:'bottom'});
const PROFILE = [[-.172, .0158], [-.15, .0168], [-.06, .0176], [.03, .0168], [.054, .0162], [.06, .0185], [.076, .0175], [.078, .0175]];
const rad = y => { for (let k = 1; k < PROFILE.length; k++) if (y <= PROFILE[k][0]) { const a = PROFILE[k - 1], b = PROFILE[k]; return a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]); } return .0172; };
const FR = { Index: [.0094, .0085, .0076], Middle: [.0097, .0088, .0078], Ring: [.0092, .0083, .0073], Pinky: [.0080, .0072, .0064] };   // bone line → skin (mesh build radii ×1.07 × ~.9 for the oval section)
export function solve(I, { k = .92, slack = .0012, step = .05 } = {}) {
  const R = I.rig.real, V = R.hipsPos.constructor, Q = R.arm.R.ha.quaternion.constructor, M4 = R.arm.R.ha.matrixWorld.constructor;
  const ha = R.arm.R.ha, K = I.rig.katana; ha.updateMatrixWorld(true); K.updateMatrixWorld(true);
  const H2K = new M4().copy(K.matrixWorld).invert().multiply(ha.matrixWorld), toK = p => p.clone().applyMatrix4(H2K);
  const h = I.runCurlAxis('none', new V()).normalize(), ang = {}, report = {};
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) {
    const c = R.fingers.find(x => x.side === 'Right' && x.f === f);
    // bind joints in hand-local: pose the chain at bind (qa = identity) and read positions
    const save = c.joints.map(j => j.b.quaternion.clone());
    c.joints.forEach(j => j.b.quaternion.copy(j.prevInv).multiply(j.bindH)); c.joints[0].b.updateMatrixWorld(true);
    const hinv = ha.matrixWorld.clone().invert(), HL = b => b.getWorldPosition(new V()).applyMatrix4(hinv);
    const J = [...c.joints.map(j => HL(j.b)), HL(R.bone[`RightHand${f}4`])];
    c.joints.forEach((j, n) => j.b.quaternion.copy(save[n])); c.joints[0].b.updateMatrixWorld(true);
    const seg = [0, 1, 2].map(n => J[n + 1].clone().sub(J[n]));
    const d = seg[0].clone().normalize(), dp = d.clone().addScaledVector(h, -d.dot(h)).normalize(), D = new Q().setFromUnitVectors(d, dp);
    const sgn = dp.clone().applyAxisAngle(h, .2).x < dp.x ? 1 : -1;
    let best = { sc: Infinity };
    for (let a = 0; a <= 1.6; a += step) for (let b = 0; b <= 1.8; b += step) for (let cc = 0; cc <= 1.4; cc += step) {
      if (cc > b + .3) continue;
      const th = [a, a + b, a + b + cc]; let p = J[0].clone(), err = 0, bad = false;
      for (let n = 0; n < 3 && !bad; n++) {
        const q = new Q().setFromAxisAngle(h, sgn * th[n]).multiply(D), e = seg[n].clone().applyQuaternion(q), p2 = p.clone().add(e);
        for (let t = .25; t <= 1.001; t += .25) {
          const s = toK(p.clone().lerp(p2, t)); if (s.y < -.172 || s.y > .078) continue;
          const r = Math.hypot(s.x / 1.06, s.z / .86), target = rad(s.y) + FR[f][n] * k;
          if (r < target - slack) { bad = true; break; }
          if (n > 0 || t > .5) err += (r - target) ** 2;
        }
        p = p2;
      }
      if (bad) continue;
      const sc = err * 1e5 + ((b - 1.2 * a) ** 2 + (cc - .75 * b) ** 2) * .5;
      if (sc < best.sc) best = { sc, ang: [+a.toFixed(2), +b.toFixed(2), +cc.toFixed(2)], rms: Math.sqrt(err / 10) * 1000 };
    }
    ang[f] = best.ang; report[f] = { ang: best.ang, rmsMm: +best.rms?.toFixed(1) };
  }
  return { ang, report };
}
