# Anatomical arm authoring rig — 2026-10-26

## Current working Blender file

`blender-ninja/new_ninja_raw_body_cloak_2026-10-25.blend` was the file actually open at the start of this task. It contains all earlier character scenes plus `CloakEquipment`, and supersedes the older master-path instruction in the 2026-10-24 notes. It is now saved with `ThreeJS_Rig` active, in Pose Mode, frame 16, left elbow control selected. The older `new_ninja_raw_body_rigged_rebuilt_hands_2026-10-23.blend` remains untouched.

The game's `assets/ninja.glb` had later hand/surface/weight changes than the old `RR_Combo` in the Blender file. The new Scene therefore imports the current game GLB rather than editing that older mesh. `Ninja_CurrentBody` has 392,678 vertices; `Ninja_ExportRig` preserves the original 70 deform-bone names, parent relationships, and bind matrices (evaluated zero-pose maximum matrix difference 4.77e-7).

User-requested backups were made **before any rig changes**, with SHA-256 verification:

`blender-ninja/backups/before-anatomical-rig-20261026-170718/`

This contains the complete original open `.blend`, original `ninja.glb`, and `manifest.json`. Original game GLB SHA-256: `0cb30940960a32f6a83920157b6f84d740f12f8627136fa50b64ccc2ddc6c533`. The game GLB was not replaced by this task.

## Pose controls

The blue controls in collection **01 Pose controls (rotate these)** use local XYZ Euler rotations. Red original deform joints, green twist joints, and internal rest-axis adapters have separate hidden bone collections. Original bind axes were not rolled/rebuilt: `MCH_` targets convert the anatomically oriented controls back into the original joint frames through pose-space Copy Transforms constraints.

| Control (suffix `.L` / `.R`) | Authoring limits, local degrees |
|---|---|
| `CTRL_Shoulder` | X −25…40, Y −20…20, Z −30…30 |
| `CTRL_Arm` | X −120…145, Y locked, Z −100…100 |
| `CTRL_ArmRoll` | Y −90…90; X/Z locked |
| `CTRL_ForeArm` | X −5…145; Y/Z locked |
| `CTRL_ForeArmRoll` | Y −85…85; X/Z locked |
| `CTRL_Hand` | X −70…70, Y −15…15, Z −25…25 |

Location and scale of every control are locked. Limits are evaluated by local-space Limit Rotation with Affect Transform enabled. Twenty checks, including deliberately out-of-range values and evaluated twist drivers, pass. These are useful animation authoring ranges, not a full coupled biomechanical shoulder model or a collision solver. They do not automatically add foot IK, body balance, centre of mass, or a relationship between shoulder elevation and clavicle lift.

For manual posing, choose **Scene > ThreeJS_Rig**, select `Ninja_ExportRig`, enter **Pose Mode**, and rotate the blue controls with orientation **Local**. `CTRL_ForeArm` local X bends; the separate `Roll` control local Y twists. The Text Editor datablock `READ_ME_ThreeJS_Rig` has the same directions. The active `Anatomical_Rig_Validation` Action has test keys from frames 1–121 at 30 fps; unlink that Action before free posing, or key changes into an Action normally.

## Twist and skin weights

Added 12 deform bones: `mixamorig:{Left,Right}{Arm,ForeArm}Twist{1,2,3}`. Each is a child of its corresponding original limb joint, with the same armature-space rest matrix. Evaluated roll-control Y drives helper local Y by 1/3, 2/3, and 1. The main segment follows swing/bend; the downstream control chain receives full roll. Thus hand orientation follows full forearm rotation while skin twist ramps down the limb.

Weights are redistributed over adjacent twist stations along each segment. Upper-arm twist starts after 35% of the segment to protect the shoulder attachment; forearm twist starts after 15%. Existing shoulder/elbow/wrist weights receive twelve local edge-smoothing passes; the regional mask covers 18,872 left / 17,559 right vertices. Finger-weighted vertices are excluded from these smoothing/cuff adjustments. At the shoulder, competing Spine/Spine1/Spine2 contributions are consolidated to Spine2 to reserve the four-influence budget for arm transitions. The wrist cuff uses a continuous longitudinal 75-mm blend instead of noisy adjacent forearm/hand weights. Coincident seam vertices share weights; influences are normalized and capped at four.

Linear skinning is used in Blender and in the standalone preview so it matches default Three.js. The existing game has DQ volume skinning, but it is not required by this asset. No geometry, topology, UV, normal, outline-normal, material, or texture edits were made.

## Export and Three.js scope

`assets/ninja-anatomical-preview.glb` is a separate candidate: **82 skin joints**, original Walking/Running clips and a four-second baked `Anatomical_Rig_Validation` clip (121 samples, 30 fps). No control or MCH nodes are exported.

`tools/export_anatomical_rig.py` appends the new skin data, twist nodes/inverse bind matrices, and baked animation to the original GLB. Its existing binary payload is preserved byte for byte, including images, surfaces, original animation samples, and outline normals. This avoids image re-encoding, exporter normal/UV changes, and the 24-fps import/30-fps export clip-duration trap. An import-space floating-point position residual of at most 1.13 micrometres is observed in Blender; exported original POSITION data remains byte identical.

`/debug/anatomical-preview.html` loads this candidate in Three.js 0.160.0, with clip selection, a time slider, orbit controls, and a pose-sheet capture. `/debug/anatomical-game-check.html?mode=check|run|walk|combo` runs the existing game regression tools in a fresh iframe.

The game still loads **the existing `assets/ninja.glb`**. This task prepares an authoring rig and a baked GLB proof; it does not replace the game's procedural arm/grip solver. To integrate the new skeleton, either animate the new model with baked clips, or teach the procedural solver to split limb swing/roll and drive the 12 twist joints. The JSON limit table describes the **control axes**, so it cannot be applied directly to the old raw Mixamo Euler components. Blender constraints and drivers do not run in Three.js.

## Validation and remaining limits

- `tools/check_anatomical_rig.py`: 20 constraint/driver checks, zero failures; normalized four-weight skin; nine sampled poses finite.
- Baked GLB CPU skinning versus Blender evaluated skin: 17,073 sampled vertices per pose, nine poses; max error about 1.15 micrometres.
- POSITION, NORMAL, TEXCOORD_0, `_OUTLINE_NORMAL`, triangle indices, original animation JSON/samples, and original binary payload preserved byte for byte.
- Three.js successfully loads 82 joints, 392,678 vertices, and all three clips. Inspect `out/anatomical-rig-threejs-sheet.png` for the representative bends, twists, wrist flexion, and raised-arm poses.
- The source cloth still stretches in extreme overhead combinations. Measured P99 edge-length ratio reaches about 1.34 and the worst small edge about 4.79 in the stress pose. The former jagged wrist transition had about 11x local stretch; it is now about 2.3x in that stress pose. These metrics are deformation diagnostics, not a guarantee of collision-free skin. Corrective shape keys or cloth-specific deformation would be a separate improvement.
- Existing-game motion checks and four-angle run/walk/combo sheets were rerun. They validate the retained game asset; the new rig has its separate tests above.

Reports and original weight arrays are in `out/anatomical-rig/`; the durable limit/rig summary is `blender-ninja/anatomical-rig-limits.json`. Scripts: `prepare_anatomical_rig.py` (fresh import only), `refine_anatomical_weights.py` (restarts from original saved arrays), `export_anatomical_rig.py`, and `check_anatomical_rig.py`.

## Runtime integration — subsequent user request

This supersedes the earlier scope paragraph above: the game now defaults to **`assets/ninja-anatomical-preview.glb`**, the tested 82-joint asset. `assets/ninja.glb` remains the original 70-joint source for preparation/export scripts and rollback. The baked validation clip is not played in gameplay; the original leg clips and procedural arm/grip controller still produce the motion.

`client/rig/twist_skinning.js` connects the four limb segments to the current controller. For each original arm/forearm it decomposes `inverse(bindLocalQuaternion) * solvedLocalQuaternion` into swing and twist about the actual bind child direction (`upDir` / `foDir`, **not** hardcoded local Y). Skin-only proxy joints receive 0, 1/3, 2/3 and 1 of the axial roll. Their bind matrices remain those of the original segment. Quaternion-sign changes and the ±π boundary are handled by angle unwrapping in `twist_math.mjs`.

The solver's original bones and their full inherited rotation are retained for wrist/elbow positions, grip-history state, fingers, sword placement, and accessory anchors. Proxies replace only the four primary limb entries and twelve helper entries in the shared skin palette. This avoids writing a post-solve correction back into the solver and feeding that correction into the next step. Original forearm/hand transforms still follow their original parents. The full-roll station matches its solved source world matrix; other stations spread skin rotation along the weighted limb.

`enableVolumeSkinning` calls the twist update after refreshing the source hierarchy and before updating the skeleton/DQ uniforms. The body, outline, linear-skinning fallback, depth/distance passes, and CPU skin queries all share that palette. Legacy 70-joint comparison assets produce zero twist segments and retain their normal skinning. A partly missing twist chain raises an error rather than silently deforming incorrectly.

Validation for the integrated model:

- Existing Motion Check: **125 PASS, 0 FAIL**, including walking/running/stopping, all combo beats, thrust, dual-wield draw/sheath/hit checks, finisher, wrist range and actual hand-surface grip checks.
- `client/debug/twist_check.js` / `anatomical-game-check.html?mode=twist`: nine synthetic cases in an arbitrarily rotated bind frame and 800 four-ms steps each for walk/run/attack/dual; verifies full-roll matrices, finite transforms, unchanged source quaternion/wrist position, fractional station rotation, idempotent repeated updates, rigid skin transforms and shader diagnostics. Results: `out/twist-check.json`.
- Fresh integrated-asset sheets: `out/motion-views-walk.png`, `out/motion-views-run.png`, `out/motion-views-combo.png` (eight frames × four angles), plus dual for draw/sheath inspection.

The test trace also records a pre-existing abrupt upper-arm axial rotation at some attack transitions (about 80–87° over one four-ms solver step in the sampled loop). Comparing source quaternion steps confirms that this originates in the retained controller, rather than a quaternion-sign flip introduced by twist extraction. The integration distributes the supplied motion; it does not redesign those attack transitions, enforce the Blender control limits on unrelated Mixamo Euler axes, or remove the previously documented extreme-cloth stretch.

**Subsequent continuity fix:** `client/rig/upper_arm_roll.js` now handles that abrupt roll with transported swing, bounded axial velocity/acceleration, and compensating forearm rotation that retains the grip pose. See `upper-arm-roll-2026-10-26.md` for before/after measurements and the 127-pass motion suite.

**Subsequent surface update:** both elbow/shoulder weight bands and the sleeve-cap shape have been refined; the game now uses regional hybrid DQ/linear skinning and strongest-weight quaternion references. Geometry around the shoulder is intentionally fitted, so earlier byte-identical POSITION statements describe the pre-fit stage. See `elbow-shoulder-surface-2026-10-26.md` and use `tools/refine_arm_surface.py` for this revision's source-derived export.

**2026-10-27 winding correction:** unbounded angle unwrapping in the skin gradient caused corkscrew sleeves after K K, including settled idle. `twist_skinning.js` now advances bounded ±90° upper / ±85° forearm gradients only during physics, with ≤450°/s slew. Palette queries are idempotent. This supersedes the unbounded extraction behavior above; see `kk-skin-winding-2026-10-27.md`.
