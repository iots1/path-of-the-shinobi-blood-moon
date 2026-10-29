# Elbow and shoulder surface refinement — 2026-10-26

> Follow-up elbow fold / left 450-ms changes supersede the band, twist, fit and DQ parameters below. See `elbow-folds-and-left-support-2026-10-26.md`.

User reported distorted elbow folds on both arms and excessive shoulder bulk. The current working file remains `blender-ninja/new_ninja_raw_body_cloak_2026-10-25.blend`, Scene `ThreeJS_Rig`. Changes are saved there and in the in-game `assets/ninja-anatomical-preview.glb`.

## Backup and authoring changes

Verified SHA-256 backups of the pre-edit Blender master and 82-joint GLB are in `blender-ninja/backups/before-elbow-shoulder-20261026-195339/`, with `manifest.json`. The original 70-joint `assets/ninja.glb` remains untouched.

`tools/refine_arm_surface.py` always reads that backup GLB, avoiding cumulative edits. It adjusts shoulder weights over 8,906 left / 9,150 right vertices, and elbow weights over 12,979 left / 12,068 right vertices. The sleeve root follows the clavicle and chest; upper-arm influence grows outward, while the underarm retains chest influence. The elbow transition uses a continuous 90-mm band along the rest upper/forearm bisector. Remote forearm influence is transferred back to the upper sleeve, and remote upper-arm influence to the distal forearm; torso/clavicle leakage fades out before the elbow so four-slot truncation cannot alternate between competing chest and forearm weights. Twist stations are repopulated by segment coordinate. Coincident seam vertices share weights, normalized and sorted to at most four influences.

The shoulder sleeve cap is fitted inward using a padded 25-mm coarse displacement grid, smoothed displacements, and cubic B-spline interpolation. The transverse large form is compressed up to 12%, with smooth axial/radial falloff and an exactly fixed head/neck column. Actual maximum source-vertex displacement is **8.50 mm** over 17,090 vertices. This preserves existing fine folds rather than smoothing source positions. Normals and outline normals follow the inverse-transpose field Jacobian. Minimum sampled Jacobian determinant **0.786**; maximum **1.131**. No remesh, decimation, UV repack or texture edit.

The script writes source-derived geometry/weights and normals to the derivative GLB, retaining exact image/clip bytes. It removes unreferenced buffers/accessors without changing topology or reducing mesh detail (result 45,125,428 bytes). It also updates the Blender mesh, bone groups and custom normals. The Blender armature's linear preview remains available; the game uses the regional hybrid skinning described below. Re-export this revision with the new source-derived script, rather than the older `export_anatomical_rig.py`, whose unchanged-POSITION assertion intentionally rejects this fitted mesh.

## Runtime skinning fixes

`volume_skinning.js` now chooses the strongest **actual weight** as the DQ hemisphere reference, rather than assuming slot zero is the dominant influence. Arbitrary/low-weight reference choices can give adjacent vertices inconsistent quaternion signs under strong joint rotations. CPU `volume_skinning_math.mjs` uses the same rule. New tests exercise all 24 slot permutations (including a zero-weight first slot) and all 16 quaternion sign combinations.

Full-volume DQ also exaggerated the loose sleeve at bent hinges. A rest-space `jointVolume` attribute now blends DQ toward linear skin locally: shoulder core 18% DQ inside 75 mm, fading to full DQ by 160 mm; elbow core 35% DQ inside 45 mm, fading by 100 mm. Twisting limb regions and hands retain full DQ. Position, normal, tangent, outline and shadow paths use the same amount. CPU skin sampling mirrors the hybrid deformation, so fit/grip diagnostics observe the displayed surface.

No hand targets, grip offsets, IK endpoints, attack keys or the upper-arm continuity controller were changed.

## Validation

- `node --test client/rig/volume_skinning_math.test.mjs`: two property tests pass.
- Full Motion Check: **127 PASS, 0 FAIL**, including actual hand-surface grip, combo hits, dual draw/sheath and upper-arm continuity.
- `tools/check_arm_surface.py`: topology, UVs, node/bind hierarchy, inverse bind matrices, materials, texture bytes and every animation sample preserved. Hand/head/leg positions byte identical. Four-weight normalization and finite normals pass.
- Five posed CPU palette audits compare the pre-edit full-DQ mesh and final hybrid mesh. Maximum local arm edge-length ratio drops from 4.28→1.76 in idle, 8.94→6.95 in the overhead combo sample, 11.41→8.20 in the cutting sample, 4.98→3.90 in the rear-hilt reach, and 6.83→4.04 in the dual cut. P99 does not improve in every sample; this is a reduction of extreme local distortion, not a proof of perfect cloth deformation or self-collision avoidance.
- Bare/equipped inspections: nine poses (idle, three combo samples, two dual samples, run, finisher and thrust) × eight angles, including both rear obliques and elevated gameplay views. Idle cloak-only/mask-only sheets inspect separate layers. Accessory fitting is allowed to finish in idle before posing tests; fitting asynchronously during an attack can invalidate the inspection. Equipment preferences are restored after capture.
- Standard run/walk/combo sheets are regenerated and inspected; shader diagnostics are empty. Extreme source-cloth poses may still require corrective deformation; this pass does not claim every possible pose is artifact-free.

Reports: `out/elbow-shoulder/fit-report.json`, `validation.json`, `out/elbow-surface-before.png`, `out/elbow-surface-after.png`, `out/joint-surface-bare.png`, `out/joint-surface-equipment.png`, and `out/joint-surface-check.json`.

Diagnostic routes in `anatomical-game-check.html`: `mode=elbowbefore|elbowafter` captures skinning close-ups; `mode=jointsurface` captures all-angle bare/equipped sheets. The live asset's `extras.armSurface` also records fit parameters and regional counts.
