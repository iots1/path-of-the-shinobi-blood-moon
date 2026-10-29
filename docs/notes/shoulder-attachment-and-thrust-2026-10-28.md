# Shoulder attachment and original K support — 2026-10-28

Supersedes the rigid distal-pose / large clavicle-offset solution in `left-lift-detail-2026-10-27.md`. That solution passed joint-angle checks while moving the upper-arm head about 5–6.4 cm from the ordinary shoulder and stretching the sleeve. This pass changes runtime motion, not the Blender master, GLB, weights, UVs, textures, normals, fingers, or local sword grips. Source and defect captures were backed up in `out/shoulder-attachment-before/`.

## K remains the original two-handed thrust

The authored anatomical controller is for K K and its recovery. Applying it to the original K also changed the off-hand reach / release gate, so the left hand stopped supporting the right-hand sword. K again uses its original IK, hilt sliding, seat flex, grip hysteresis, and finger wrapping. The right fist still determines the sword transform.

Once support weight exceeds .8, two small IK feedback passes use the actual bounded hand quaternion to correct the left palm toward the existing support seat. Strength fades in jointly over weight .8–.98 and time 180–320 ms. Upper/forearm frames are parallel-transported to the nearby IK solution, preserving their existing twist; re-running `aimArm` here had reset pronation and caused a large local-wrist spike. The current elbow selects the same elbow-circle branch. K's original support-seat candidates additionally pay for excess reach, so the off-hand may use the existing 6–17 cm support rail instead of reaching past its arm length. Neither sword's local grip calibration changes.

`finishAttackArm` blends the actual incoming arm pose into K over 140 ms and into K K's hinge frame over 180 ms. This avoids projecting a near-straight K arm into another authoring frame in one step. K from running additionally caps only the right arm's local rotation rates (clavicle 300, upper/forearm 1200, hand 2400 degrees/s), using the previous actually applied pose, saved after the upper-roll pass. The geometric elbow interval is 35–178 degrees. K's IK minimum reach also enforces the 35-degree fold stop.

## K K keeps the upper arm attached

`constrained_grip.js` bounds actual shoulder-head displacement in the procedural chest frame, rather than accepting arbitrary clavicle Euler offsets. The displacement lies inside an ellipsoid with 12 mm lateral / forward-back / downward radii and 35 mm upward elevation. Swing is capped at 12 degrees; twist around the clavicle-to-arm-head axis is capped at 15 degrees. This permits an overhead shrug while preventing the previous downward/outward pull. The audit reads the applied shoulder head after the final pose pass.

The forearm and wrist are no longer hard-frozen to an endpoint fitted against an earlier torso pose. Their late-lift rates are bounded, and the solver checks wrist comfort before the final wrist projection. Draw/extraction comfort uses a 50-degree flexion/extension envelope, with 20–25-degree radial and 25-degree ulnar deviation; the ordinary global anatomical wrist limits remain unchanged. Local authoring hinge/axial checks start after the 180 ms pose-frame transition. Actual geometric joint ranges, velocities, and K support contact are checked throughout that transition and throughout K.

The draw uses the actual moving back hilt. Preserve the raw `dualGoal` before `gripPass`, which mutates its reach guide. Keep the back-hilt target through sheathing, then return to the raw release guide. The straight extraction distance is 8.5 cm (formerly 11 cm), followed by full lateral extension and the existing downward cut. This keeps the extraction inside the available reach without compensating by moving the shoulder away from the garment.

## Diagnostics

- `?mode=liftcheck&bones=1`: 400–1000 ms at 20 ms intervals, four angles, full-size PNGs.
- `?mode=thrustdetail&bones=1`: the first K, including support contact and recovery.
- `?mode=attachmentview&bones=1`: shoulder, extraction, spread and cut close-ups.
- `?mode=powerdraw&bones=1`: complete K K sequence.
- `?mode=check`: full motion checks plus the 4 ms joint/contact audit, including quick repeat, delayed second K, repeated K K, and run entry.

Reports include `runtimeRevision` / `revision` so results from an older iframe cannot be mistaken for a current verification. `shoulder_attachment_check.js` samples the rendered hybrid skin via `R.skinning.getVertexPosition`; the diagnostic-only `R.skinning.mesh` reference exposes that mesh. Skin-only proxy bones must be matched by name, not by source-bone object identity.

Do not alter DQ coefficients or twist-root distribution to conceal a joint-position problem. Those experiments were rejected; `twist_skinning.js` was restored from the pre-pass backup.

## Verification

Verified runtime: `shoulder-20261028-v10`.

- Full `m.run()`: **136 PASS, 0 FAIL**; unit tests: **7 PASS**. Inline module and changed JS syntax checks pass.
- Joint/contact audit: **7,900 arm samples at 4 ms**, no violations, across quick repeat (including a second full K K), delayed second K, and running entry. Worst K support-seat distance: 6.3 mm / 5.2 mm / 6.8 mm respectively (25 mm tolerance). Applied shoulder attachment, extraction, full lateral extension, cut extension, and joint/velocity checks pass. Shader errors: none.
- Fresh run, walk and three-beat combo sheets: eight poses from four sides each, inspected. The capture's pose drift across camera changes is under 0.000004 degrees, position drift zero.
- Left-lift review: **31 times × four sides = 124 full-resolution frames**, every 20 ms from global time 400–1000 ms; all reviewed as arm close-ups in `out/shoulder-final-review-*.png`. Additional K support (32 images) and complete K K draw/spread/cut (48 images) sheets were inspected.
- Clothing/layer review: **11 poses × eight angles × two layer states = 176 images**, inspected, plus cloak-only and mask-only idle views. Included both K K approach frames (840/1000 ms), spread/cut, combo beats, K, running and L. Source folds remain visible and the shoulder no longer has the previous depressed/displaced sleeve root.
- `twist_skinning.js` exactly matches its pre-pass backup (SHA-256 `6063a681adad66c31c9c695d2eca76eaf37e31eb136aea46419fb1480ac113f0`).

Verification covers the listed deterministic game scenarios and captured rendered frames. No Blender or asset re-export was needed for this runtime regression.
