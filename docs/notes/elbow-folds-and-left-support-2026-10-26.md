# Elbow folds and left support-arm bow — 2026-10-26

Follow-up to `elbow-shoulder-surface-2026-10-26.md`. User asked for less pinching at maximum elbow bend on both sides, preservation of source folds and sword grips, and less arching of the left arm in the left-camera combo frame at 450 ms.

## Current authoring and skinning

Master remains `blender-ninja/new_ninja_raw_body_cloak_2026-10-25.blend`, scene `ThreeJS_Rig`. `assets/ninja-anatomical-preview.glb` is the in-game derivative. Pre-edit master, GLB and relevant code snapshots are in `blender-ninja/backups/before-elbow-corrective-20261026/`, with verified uncompressed SHA-256 hashes in `manifest.json`. The master snapshot was deduplicated with a hard link while storage was constrained; the new master was subsequently saved to a temporary copy and atomically replaced, so the snapshot retains its original bytes. Do not truncate snapshot files in place.

`tools/refine_arm_surface.py` still rebuilds from the verified previous-pass source, avoiding cumulative deformation. New parameters supersede those in the previous note:

- Elbow upper/forearm transition widens from 90 to 140 mm. Brush has a 120-mm core and 55-mm falloff; remote influence cleanup follows the wider transition. Regions: 16,319 left / 14,852 right elbow vertices.
- Upper-arm twist distribution starts at 15% of segment length, spreading roll across the sleeve rather than concentrating it distally.
- Upper sleeve large form tapers transversely by up to 10%, smoothly joined with the existing 12% shoulder-cap fit. This removes the balloon immediately beyond the former cap-only adjustment. Same 25-mm smoothed displacement grid and cubic B-spline field; source positions are not smoothed. Maximum displacement from the preserved source 8.527 mm, 30,167 affected vertices, sampled determinant 0.7847–1.1312.
- DQ elbow core increases from 35% to 75%, retaining more cross-section at the hinge. Shoulder remains 18%; radii and smooth falloff remain unchanged. CPU diagnostics, render, normal/tangent, outline and shadow paths share the profile.
- DQ GPU hemisphere selection now signs **all four slots**, including X, relative to the dominant-weight reference. CPU already did this; a non-X dominant slot must not leave X's sign implicitly positive. Current exported weights are sorted, but other supported meshes need not be.

Normals and outline normals follow the inverse-transpose field Jacobian. Topology, UVs, hierarchy, binds, materials, embedded image bytes and animation samples remain intact. No remesh, texture reduction or fold smoothing. Hand/head/leg source positions remain byte-identical. At most four normalized influences. GLB size 45,125,476 bytes.

## Left arm at 450 ms

The actual left elbow was about 149 degrees interior, not hyperextended. Its supporting bend plane bowed upward while the sleeve also remained bulky. `client/rig/elbow_plane.js` runs after hand/finger solving and before `upper_arm_roll.js`. It rotates the upper/forearm chain about the shoulder–wrist axis, then restores the hand's world quaternion. Both segment lengths, elbow interior angle, wrist position and complete hand/finger orientation stay intact; sword poses, grip settings, timelines and IK hand targets are unchanged.

The plane adjustment is active only during the three combo definitions, while two-handed and near extension (125–155-degree smooth ramp). Search stays within ±55 degrees; response time 65 ms, requested rate 240 degrees/s. When a changing grip narrows the valid wrist envelope faster than the easing, the existing wrist envelope takes priority and projects the correction back toward zero. This was necessary: retaining residual correction through the thrust→dual handoff temporarily put the left wrist at 108% of its ellipse. No existing motion threshold was relaxed. Final peak correction rate about 245 degrees/s includes about 1 degree of boundary projection, with maximum correction 32 degrees.

In the final focused 450-ms capture, upward elbow offset above the shoulder–wrist centre line falls from 38.97 to 23.97 mm (about 38%); applied swivel about −20 degrees. `real.supportElbow.last` reports that measurement. This is an elbow-plane correction, not a change to the elbow bend angle.

## Validation and limits

- Full Motion Check: **129 PASS, 0 FAIL**, adding direct hand-pose preservation and bounded correction checks to the existing 127. Maximum direct wrist error 0.000273 mm; hand rotation error 0.000031 degrees. Existing grip-surface, wrist range, upper-arm continuity, combo hits and dual draw/sheath checks pass.
- Two DQ slot/sign property tests pass. Extracted game module syntax and diff whitespace checks pass.
- `tools/check_arm_surface.py` validates protected source data and finite four-weight skinning. `tools/check_sleeve_refinement.py` compares previous/current assets under the **same recorded palettes**, separately on each elbow. Reports live in `out/elbow-shoulder/`.
- Six close-up samples (combo 190/450/600, dual 900/1080/1320) × front/right/back/left. Extra `out/sleeve-450-after.png` is the focused left-camera 450-ms view. Nine bare/equipped poses × eight angles cover idle, combo, dual, running, finisher and thrust; separate idle cloak-only/mask-only sheets check layers.
- Fresh standard run/walk/combo/dual sheets inspected. Shader errors empty. Preferences restored after captures.

Compression is not uniformly reduced at every source edge: broadening the hinge trades some inner-fold compression for lower outer stretching. For example, the left 450-ms sample's elbow P99 edge stretch drops about 1.43→1.32 and its P01 compression ratio rises about 0.68→0.75; the deepest left dual bends still have locally compressed folds. Parameter scans rejected a uniformly narrow hinge because it amplified outer stretching. These diagnostics and the images establish improved distribution, not cloth self-collision or an artifact-free result at every possible pose.

Reproduce: `/debug/anatomical-game-check.html?mode=sleeveafter`, `jointsurface`, `check`, then fresh loads for `run`, `walk`, `combo`, `dual`. `sleevebefore` captures the currently loaded revision with a different output tag; it does **not** automatically restore a historical asset. `out/sleeve-before.png` was captured before this pass and should not be overwritten unintentionally.
