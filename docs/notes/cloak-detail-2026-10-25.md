# Cloak surface and collision rendering refinement — 2026-10-25

The reference images `art/reference/new_ninja_mask/ninja_front.jpeg` and `ninja_side.jpeg` show a soft shoulder mantle, continuous folded/sewn hem, and cloth draped behind the arms. This pass retains the existing hood-down selection and full-resolution fitted source; it does not change source geometry, UVs, textures, the ninja model, animation parameters, or Blender assets.

## Runtime change

The previous GPU capsule collision changed only the skinned vertex positions. The cloth retained pre-push normals/tangents, and shadow depth passes still used the unpushed silhouette. `client/equipment/cloak.js` now shares a smooth collision deformation between the color, custom depth and custom distance materials. The directional shadow path compiles in the game; the distance material is configured for point shadows but no point-shadow scene was specifically exercised.

The capsule push still uses the measured sleeve/glove/sword radii and existing cloth margin. Its old hard outer cutoff is replaced by a cubic falloff to zero (2×SOFT to 4×SOFT). The shader analytically differentiates the tapered capsule map, composes local Jacobians, transports the source normal with the cofactor/inverse-transpose map, and transports its UV tangent with the forward Jacobian. The normal/default-varying chunks run after collision so normal mapping follows the displayed surface. Degenerate capsule axes and vanishing transformed normal/tangent vectors have finite fallbacks. Toggling collision while paused also invalidates the prepared state, so the displayed switch does not wait for clock advancement.

`equipmentCloak.getVertexPosition(mesh,index,out)` CPU-mirrors the displayed cloak position (linear accessory skin + the same collision function), in mesh-local coordinates. It is for development sampling and does not rewrite the original attributes or add a per-frame CPU deformation pass.

## Audit changes

- New `client/debug/cloak_surface_check.js`: fresh reset for each sampled idle/walk/run/combo/dual scenario; records pre-push and displayed depths separately. Samples 20,653 vertices per pose against the current sleeve/hand/hilt/blade capsules. All five inspected poses were finite with 0 mm residual inside those capsules including their cloth margin. These are sampled capsule checks, not exact-body/all-frame/self-collision proof.
- `client/debug/cloak_check.js` now evaluates collision-deformed cloak positions and the body's displayed DQ skinning when enabled. Ray tests use temporary static probe geometry built from those displayed positions, avoiding raw `SkinnedMesh.raycast` results that omit GPU deformation.
- Hem probes use a fixed 2-mm cross around each historical ray. They retain the 5-mm clearance threshold, require at least three cloth/body-covered rays per side, and report missing-body/uncovered samples explicitly. In the sampled idle pose, all five rays around the lower right 1.33-m location are below the raised hem (no local fabric hit); the 1.34-m covered location is clear. Treating a missing/far-side cloth hit as a negative local clearance was misleading. A real same-side fabric hit behind the shirt still fails.
- `client/debug/cloak_arm_check.js` remains available for historical multi-frame pre-push measurements, but its header/report now explicitly says these are linear-skin depths before GPU collision. Use the new surface check for visible penetration.

The updated displayed-surface fit check passes. Representative rear minima are about 3.4–4.5 cm; hilt-axis minima about 5.1–8.3 cm. Covered hem rays in idle/walk are about 4.2–5.3 cm clear. The margins are conservative capsule fitting, not a full cloth simulation.

## Verification artifacts

All changed JS files pass `node --check`; changed-file whitespace checks pass. Fresh Chrome shader diagnostics report `__iso.shaderErrors = []`. Inspected images:

- `out/motion-views-idle-cloak-detail.png`: macro front/right/back/left collar, mantle and source hem.
- `out/motion-views-run-cloak-detail.png`: three running samples, four angles.
- `out/motion-views-combo-cloak-detail.png`: three attack samples, four angles.
- `out/motion-views-dual-cloak-detail.png`: three dual-wield samples, four angles.
- `out/motion-views-combo-cloak-detail-before.png` and `...-after.png`: same close-up attack for an old/new shader comparison; shading differences are subtle, not a redesigned garment.
- `out/cloak-surface-check.json`: sampled displayed collision audit.
- `out/cloak-fit-check.json`: updated dense displayed-surface fit audit.

The A/B script also recorded a small synchronous frame timing sample in `out/cloak-detail-ab.json`; that microbenchmark is not representative gameplay FPS and should not be cited as a performance guarantee. Parent integration runs the shared motion suite and combined cloak/mask screenshots after both accessory agents finish.
