---
name: blender-preserve-surface
description: Fit, reshape or layer any worn accessory or garment on the character (cloak, mask, hood, scarf, sleeve, armour, belt…) while keeping the source mesh's folds, sewn hems/stitches, weave, UVs and smooth shading — in Blender, a GLB export, or a runtime three.js deformation. Use it automatically, without being asked, whenever an accessory's shape/fit/placement/skinning/collision changes, and whenever the user reports cloth that looks torn, stretched, faceted, flattened or blotchy, skin showing between an accessory and the body or clothes, an accessory poking through clothes or another accessory, or missing stitch detail. Not for generating new textures or reducing mesh quality.
---

# Preserve the source surface while fitting a worn accessory

Reshape the large form; carry the source's small folds, sewn hems, weave and shading through one smooth deformation. Keeping the original image files does **not** by itself preserve the look: compressed geometry, collapsed cloth walls, cut rims or wrong normals still ruin it.

Apply the whole checklist on your own initiative every time a fit changes — the user should not have to ask for "smooth surface", "stitches", "no skin gap" or "check all views".

## 1. Establish the source and scope

- Read `CLAUDE.md` and the notes for the area (`docs/notes/architecture-details.md`, `docs/notes/blender-pitfalls.md`) and the accessory's current code. Later runtime changes may alter the rendered result.
- Keep the supplied source file unchanged; work on a derivative. Preserve topology, UVs, seams, materials, texture resolution and the existing rig. In Blender, work in the single master `.blend` (CLAUDE.md) — never save dated copies.
- Separate fitting from optimisation. Do not remesh, decimate, repack UVs, rebake or subdivide to hide a bad fit.
- **Inspect the source first** (render it headless: front/back/sides/top/bottom plus close-ups of every rim). Find its sewn rims, rolled hems, seams and openings, and whether stitches live in geometry or in the textures. These rims are the only edges that may be visible in the end.
- Capture the reported defect at the user's scale and angle, and compare with the accessory (and every other accessory) on and off.
- Work in one explicit coordinate system and rest pose. Do not bake a posed fit and then apply the pose again.

## 2. Fit with one smooth displacement field

1. Define the target large-form adjustment from measured body clearances (face, neck, head, shoulders). Measure the body as it is **rendered** (e.g. dual-quaternion skinning), not a simplified CPU skin.
2. Express every intended change — scale, hugging the face/neck, lowering a rim, squashing a panel — as a **smooth function of position**, sample its displacement on a padded coarse 3D grid, smooth the field, and evaluate it with cubic B-splines at the original vertices.
3. Apply it to the original high-resolution mesh. Smooth the **displacements**, never the mesh: smoothing positions erases folds and stitch relief.
4. Keep UVs on their original corners and keep split vertices at UV seams.

Never do any of these on the *visible* cloth (each one has broken a fit here):
- per-vertex projection or radial push onto the body (collapses both cloth walls, imprints body creases, stretches the weave);
- cutting, folding or clamping a rim onto a plane or line (raw edge with no stitches, sawtooth edge);
- warping relative to a per-angle / per-bin statistic such as "the highest vertex in this angle bin" (a bin that holds two rim heights drops the lower one and opens a gap);
- moving a whole collar or panel to fix one local contact.

To lower or raise a rim (e.g. leave the ears bare), squash or lift that region vertically with a smooth fall-off in height and angle so the **source's own stitched rim** moves to the new place.

## 3. Hide what must disappear without cutting it

Parts that must vanish under clothing (a gaiter tucked into a collar) should not be squeezed geometrically at the boundary. Either let the cloth pass cleanly under a raised clothing edge, or keep it as a smooth continuation and **clip it in the shader** along a smoothed boundary line evaluated in the rest/bind position (interpolated per fragment → clean edge that follows the skin in every pose). Apply the clip to the colour, depth and distance (shadow) materials.

Find boundaries from data, not guesses: e.g. classify the body surface by its base-colour texture (skin vs. garment vs. hair) per height × angle cell, take the first garment run after the skin, then median + box-blur the line.

## 4. Carry the source normals through the deformation

Capture the source **custom corner normals** before fitting, in the deformation's frame. For a map `q = p + s*d(p)`:

```python
J = I + s * gradient_d(p)
n_fitted = normalize(inverse(J).T @ n_source)
```

Preserve intentionally split normals. Regenerate tangents from fitted geometry and retained UVs; keep the normal-map convention. Neither raw recomputed geometric normals nor untransformed source normals are correct.

## 5. Skin it like the surface underneath

A rigid accessory parented to one bone slides against clothes that follow other bones. Give every accessory vertex the bone weights of the **body surface under it** (face → head, neck skin → neck, tucked hem → the garment's bones), and render it with the same skinning model as the body (this project: dual quaternion). A head-only neck band let the neck skin poke through when the head tilted.

## 6. Layer accessories

Each accessory is usually fitted to the bare body, so a second one (mask under a cloak) can poke through the first. Give the inner accessory a collision proxy the outer one already understands (here: a capsule in the cloak's GPU push list, axis offset so its reach matches the inner accessory's measured outer radii) instead of shrinking the inner one into the skin. Push outward only.

## 7. Make the stitches and folds read

If the source's stitches/rolled hems/folds are geometry and the project lighting is flat (ink style, black cloth), they vanish even with perfect normals. Lower roughness rarely helps. Read them back as a cavity term: signed curvature of the **source** surface (umbrella Laplacian on UV-welded vertices — atlas seams otherwise draw lines), robustly normalised, applied as a subtle contrast/ridge-light in the colour shader. Use the source glTF's `normalScale` (default 1) rather than an arbitrary weaker value.

## 8. Reject fold-overs

Check finite positions, normals, tangents and weights, and `det(J)` over the deformed mesh. Reduce strength while the minimum is too small — but evaluate it over the **visible** cloth only; hidden/clipped parts must not weaken the whole fit (it held a mask at 73 %). Positive determinants are not proof of non-intersection or even texture scale; look at the weave, seams and both sides of every hem.

## 9. Verify before reporting — every time

Open the game on a fresh load (`/?v=N`), hide scene props that block the camera, freeze and step deterministically (`__iso.stop()`, `__iso.frame(0,4,true)`; camera yaw is in **degrees**). Then look at, and report only what you actually looked at:

- idle: front, both sides, back, both rear obliques, and from above (the default iso pitch) — at gameplay scale and the user's close-up scale;
- every rim and boundary up close: no skin gap between accessory and body/clothes, no accessory over the clothes, stitched rims continuous, weave not stretched, no blotches (z-fighting);
- with each other accessory on and off;
- motion: combo beats 1–3, K, K K, L, run (step to the extreme head/torso poses, front and back);
- shader errors (`__iso.shaderErrors`), diagnostics (strength, min det, negative count), geometry bounds.

If a project hook requires `m.run()` / `m.views()` for the files you touched, run them and open the PNGs. Say plainly which poses/angles were not checked.

If topology must change, this preservation workflow no longer suffices by itself; explain the UV/normal-map transfer or rebake before treating it as the same operation.

## This repository

- Cloak (Blender-side fit, runtime capsule collision): [references/cloak-workflow.md](references/cloak-workflow.md)
- Mask (runtime field fit, collar clip, layering with the cloak): [references/mask-workflow.md](references/mask-workflow.md)

Reuse the maintained scripts/code; do not copy one asset's constants into another (sizes and units differ).
