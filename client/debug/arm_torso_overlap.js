// Arm ↔ torso overlap on the REAL skinned mesh (2026-10-23). The bare-torso ellipse of motion_check.js (torsoPen) overestimates; this samples the
// skin: ~12k vertices whose dominant joint is Hips/Spine*/Spine1/Spine2 (the arm's own mesh is excluded), and for points along each arm (tube
// radius ≈ the sleeve: measured 2026-10-23 on the skinned mesh — upper arm p50 6.3 cm / p90 8 cm, forearm p50 4.0 / p90 5.4) reports  overlap = radius − distance to the nearest torso skin vertex  (≤ 0 = clear; > 0 = the tube sinks into the torso).
//   const o = await import('/debug/arm_torso_overlap.js?'+Date.now());
//   await o.overlap({from:340, to:800, step:40})   // single J (beat 1) from a fresh scenario; returns a one-line summary + per-frame rows
// Needs S.speed 1 (motion_check's ready() forces it). Run on a fresh load; it moves the character like motion_check does.
const D = 180 / Math.PI;
export async function overlap({ from = 340, to = 800, step = 40, presses = [0], fn, until = to + 8 } = {}) {
  const m = await import('/debug/motion_check.js?' + Date.now());
  await m.shoulderTrace({ until: 8, runMs: 0 });   // ready() + reset()
  const I = window.__iso, R = I.rig.real, S = I.S, V = R.hipsPos.constructor;
  let mesh = null; I.rig.root.parent.traverse(o => { if (o.isSkinnedMesh) mesh = o; });
  const ids = mesh.geometry.attributes.skinIndex, wts = mesh.geometry.attributes.skinWeight, names = mesh.skeleton.bones.map(b => b.name), verts = [];
  for (let i = 0; i < ids.count; i += 7) { let best = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = wts.getComponent(i, k); if (w > bw) { bw = w; best = ids.getComponent(i, k); } } if (bw > .7 && /Spine|Hips/i.test(names[best])) verts.push(i); }
  const torso = () => { R.skinning.update(); mesh.updateMatrixWorld(true); const a = new Float32Array(verts.length * 3); verts.forEach((i, j) => { const p = R.skinning.getVertexPosition(i, new V()).applyMatrix4(mesh.matrixWorld); a[j * 3] = p.x; a[j * 3 + 1] = p.y; a[j * 3 + 2] = p.z; }); return a; };
  const minD = (a, p) => { let b = 9; for (let j = 0; j < a.length; j += 3) { const dx = a[j] - p.x, dy = a[j + 1] - p.y, dz = a[j + 2] - p.z, d = dx * dx + dy * dy + dz * dz; if (d < b) b = d; } return Math.sqrt(b); };
  const worst = { L: [0, 0, ''], R: [0, 0, ''] }, sum = { L: 0, R: 0 }, rows = []; let n = 0, pi = 0;
  for (let t = 4; t <= until; t += 4) {
    if (pi < presses.length && t - 4 >= presses[pi]) { (fn ? I[fn] : I.press)(); pi++; }
    I.frame(0, 4, true);
    if (t < from || t > to || t % step) continue;
    const tor = torso(), o = []; n++;
    for (const s of ['L', 'R']) {
      const a = R.arm[s], sh = a.up.getWorldPosition(new V()), el = a.fo.getWorldPosition(new V()), wr = a.ha.getWorldPosition(new V());
      let dp = 0, nm = '';
      for (const [k, p, r] of [['up.5', sh.clone().lerp(el, .5), .063], ['up.8', sh.clone().lerp(el, .8), .060], ['el', el, .050], ['fa.3', el.clone().lerp(wr, .3), .042], ['fa.6', el.clone().lerp(wr, .6), .040]]) { const pen = r - minD(tor, p); if (pen > dp) { dp = pen; nm = k; } }
      sum[s] += dp; if (dp > worst[s][0]) worst[s] = [dp, t, nm]; o.push(`${s}:${(dp * 100).toFixed(1)}${nm}`);
    }
    rows.push(`${t} ${o.join(' ')}`);
  }
  const f = s => `${(worst[s][0] * 100).toFixed(1)} cm @${worst[s][1]} ${worst[s][2]} (mean ${(sum[s] / n * 100).toFixed(1)})`;
  return `torso-skin overlap  L max ${f('L')} | R max ${f('R')}\n` + rows.join(' | ');
}
