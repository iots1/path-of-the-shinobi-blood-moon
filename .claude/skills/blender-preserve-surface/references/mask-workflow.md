# Mask implementation in this repository

Read this when applying the skill to the face/neck mask, or as a worked example of a **runtime** (three.js) fit. Values describe this asset only. Read the current code: it may have changed since.

## Files

- `assets/mask.glb` — untouched supplied source (342k verts, 641k tris; textures: fragmented Meshy base colour, near-flat weave normal map, metallicRoughness = rough 1 / metal 0). Its stitched rolled top rim, centre-back seam and bottom hem are **geometry**; the back top rim already sits at the nape (~1.548 m in game) and two "horns" rise at the ears.
- `client/equipment/mask.js` — the whole fit, done once at load in root-local space: body measurement → target `mapPoint` → smoothed B-spline field (`buildFitField`/`sampleFit`) → Jacobian normal transport → weights from the body surface → unpose through the body's DQ (`toBodyBind`) → `SkinnedMesh` with DQ + collar-clip + relief shader (`installSkin`).
- `client/equipment/cloak.js` — appends `mask.collisionCapsule()` to its capsule list so the hood stays outside the mask.
- `docs/notes/architecture-details.md` — chronological mask entries ("Removable mask", "Mask collar + trim", "Mask surface pass", "Mask nape fit + cloak layering"). Later entries win.

## What the fit does

- Body measurement (`skinField`): rendered DQ positions; a front height-field (face) and a polar map around the neck/head axis (height × 120 angle bins, 3 mm rows) storing the outermost radius, its texture class (skin / hair / other) and vertex index.
- Collar line (`collarCut`): per angle, scanning down from 1.545, the first 3-cell non-skin run after ≥2 skin cells (hair highlights look like garment, so nothing before the neck skin counts). Back ≈1.526 → front V tip ≈1.448.
- Target (`mapPoint`): FIT scale/offset; face hug in z (blurred, grown, keeps 25 % source relief); side/back radial wrap (nape uses the surface at the same height, not the hair overhang above); neck band = skin + 6 mm, continued below the collar line as a tube; rim squash `MASK_TRIM` (front ×.86 → rim mid-nose, ears ×.5, fading out by 2.2 rad, nape lift 18 mm).
- Field strength limited by the minimum `det(J)` over visible vertices only (≈.81, min det ≈.07, no negatives).
- Collar clip: attribute `maskRest` (fitted root-local position) + uniform `maskCut[120]` (median + ±3-bin blur), 2 mm below the line, in colour/depth/distance materials.
- Weights: each vertex copies the 4 weights of the polar cell's outermost body vertex at its height (below the line: just under the line → garment).
- Relief: `sourceRelief()` → attribute `maskRelief`; colour shader `MASK_RELIEF` {x .5 contrast, y .25 ridge light}. `normalScale` 1, roughness .95, `FrontSide`.

## Failures to avoid repeating

- Rigid Head-bone mask: the hem slid over the collar when the head turned.
- Per-vertex radial tuck under the collar / per-vertex push of the neck band: collapsed cloth walls, stretched weave, "torn" jagged hem.
- Rim lowered relative to "this angle bin's highest vertex": dropped the back rim under the collar → skin wedge at the nape.
- Folding cloth above a cut line onto the line: raw, stitch-less, sawtooth edge.
- Strength limited over hidden vertices too: the whole visible fit weakened to 73 % and the neck band sank into the skin.
- Head-only weights on the neck band: neck skin poked through when the head tilted (combo beat 1).
- Wrap radius taken from rows above (hair overhang): the nape band stood off the neck and showed skin inside from above.
- Mask not known to the cloak: the hood edge sat inside the mask behind the ears.
- `DoubleSide` with coincident walls: grey z-fighting blotches.
- Dividing by a radius to rescale a vertex: near-axis vertices flew metres away — set positions from the angle.

## Verifying

Fresh load, `__iso.setCloak(on)`, `__iso.setMask(true)`, hide every scene child that is not the character/katanas/eyes, `__iso.stop()`, set `CAM.zoomT/zoom`, `CAM.pan.y`, `CAM.yawT/yaw` (degrees: 0 front, 90/270 sides, 180 back), step `__iso.frame(0,8,true)` to settle, render with `__iso.frame(0,0.001)`. For attacks: `__iso.press()` / `pressK()` / `pressL()` then step 4 ms frames. `rig.real.equipmentMask.diagnostics` has the fit numbers; `collarLine` the cut.
