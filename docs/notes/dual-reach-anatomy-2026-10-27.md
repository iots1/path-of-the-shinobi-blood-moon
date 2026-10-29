# K K reach, hinge frames and continuous constrained grip — 2026-10-27

Supersedes the earlier K K source-arm roll treatment in `upper-arm-roll-2026-10-26.md` and the pose-only validation in `kk-skin-winding-2026-10-27.md`. The bounded skin twist fix remains active. This change edits runtime poses only; the working Blender master, GLB, weights, UVs, cloth detail and local sword grip offsets are unchanged. Before-work copies: `out/dual-reach-before/index.html` and `out/dual-reach-before/upper_arm_roll.js`.

## Why the previous checks missed it

Endpoint elbow angle, wrist bend and skin twist can pass while the elbow bends sideways in its parent's frame. A post-IK upper-arm roll filter counterrotated the forearm to retain the hand transform; it preserved the sword while changing the elbow hinge axis. Near extension, inverse reconstruction can also choose the other carrying-angle branch. Filtering that reconstructed roll cannot correct the anatomical error.

`hinge_frame.js` derives Blender control frames from the source bind rotations and the control recipe in `tools/prepare_anatomical_rig.py`. Do not treat a Mixamo source-bone Euler angle or raw swing/twist as a Blender control angle. The source bind includes an elbow carrying/prebend angle: distance must account for `C cos(flex) + S sin(flex)`, rather than assume a straight, zero-angle bind. Equivalent XZY shoulder Euler representations are compared against the control limits before selecting one.

## Runtime solve

- K thrust, K K, their standing recovery and the gap before a delayed second K use anatomical IK. Upper controls are bounded to X −120…145°, abduction −100…100°, axial roll ±90°. The forearm is built as its control-rest frame × X hinge flexion × Y pronation × source adapter: forearm Z stays locked. Reach bounds retain a geometric elbow interior angle of at least 35°.
- Shoulder controls, forearm flexion and pronation have temporal bounds. The generic post-solve upper-roll controller skips anatomical IK; re-projecting an already solved hinge would undo its continuous branch. Its 450°/s continuity check now explicitly covers poses outside anatomical IK. K K physical joint velocities are checked separately on every 4 ms simulation step.
- `constrained_grip.js` solves the palm position and blade axis together with bounded shoulder, elbow, pronation and wrist controls. A damped least-squares step with coordinate refinement works inside temporal bounds. Draw and return prepare feasible back-hilt endpoint poses, interpolate the joint coordinates, then refine against the moving hilt. This avoids a discontinuous selection of opposite elbow-circle solutions. The first dual frame starts from the previous hinge state, avoiding a second flexion step in the same physics frame.
- Wrist swing uses one XZ rotation vector followed by a separate Y twist; multiplying independent X/Z rotations introduces unintended axial twist. The actual wrist bend ellipse is enforced after the solve. Residual wrist twist is at most 25°; pronation belongs to the forearm.
- Forearm pronation may use the Blender authoring stop ±85° during back-hilt contact. The previous dual contact check's ±70° preference was narrower than this rig's actual limit; it is now ±85°. Loaded cutting wrist limits (22/25° flexion/extension, 15/20° deviation) still apply. Sword grips remain the original local `K` and `pt`; props follow the solved fists.
- `arm_arc.mjs` provides a spherical shoulder-centred approach preference. The constrained joint trajectory has final authority. The approach captures the last *solved* wrist pose, because `driveRealBones()` resets the bones before IK each frame.

## Reproduction and acceptance

Use fresh loads of `/debug/anatomical-game-check.html?mode=...`; each mode freezes its own simulation.

`jointaudit` saves `out/joint-audit.json`: every physics step, both arms, quick K K repeated twice, delayed second K, and entry from running, including thrust, draw, cuts, sheathe and idle recovery. 3,950 simulation steps / 7,900 arm samples, at 4 ms, must have zero violations and no shader errors. It checks shoulder control bounds, geometric elbow range, source hinge direction, forearm X/Y/Z, wrist ellipse and axial twist, shoulder quaternion speed, elbow speed, forearm flexion/pronation speed, and wrist axial speed. Numerical tolerances are small; forearm Z and hinge errors must be under 0.02°. Temporal caps: forearm flexion 650°/s, pronation 600°/s; diagnostic tolerances 651°/s. The diagnostic shoulder quaternion cap is 1800°/s, allowing combined bounded axis motion; it is not the former independent 450°/s roll filter.

`check` remains the full game regression suite: contacts at actual draw/sheathe times for quick, delayed and running entries, loaded cutting wrists, no wrist winding, hits, shoulder motion, locomotion, torso penetration, grips, skin twist and preserved chain checks. Zero failures required.

`reachafter` saves the exact 440/540/640/740/840/940 ms frames and recovery frames from front/right/back/left, plus source control data every 4 ms. Inspect Back 640/740/840 and Left 540/640/740 explicitly. Fresh `run`, `walk`, `combo`, `dual`, `kkfix`, and `jointsurface` cover locomotion, single/dual blades, repeated recovery and clothing/accessory views. Unit tests: `node --test client/rig/{arm_arc,twist_math,volume_skinning_math}.test.mjs`.

The audit validates the named game scenarios and configured character joint envelope, not every possible future animation or a clinical model of individual human joint limits. Any changed target, grip, bind frame or animation needs these checks again.

## Verified results

The integrated motion suite passes 134 checks, including all three per-step anatomical audits (7,900 arm samples, zero violations). Back-hilt palm gaps are 0.4 cm at draw and 0.6–0.7 cm at return across quick/delayed/running entry tests, with blade-axis differences 11–16° (test thresholds 2.5 cm / 25°). The seven arc/twist/volume math tests pass. Frame audit peaks: elbow speed approximately 3.5–5.0 m/s, forearm flexion 650°/s, pronation 600°/s, residual wrist axial speed 600°/s. Numerical source hinge errors remain below the 0.02° tolerance.

`m.run()` now invokes `jointAudit()` itself, so anatomical frame coverage is mandatory in the normal regression report. Contact-sheet default width increased from 0.34 to 0.75: the narrower crop hid a complete arm in side views at the current browser viewport.

The constrained solver normalizes all three source bone quaternions after converting its world solution back into local rotations. Without this, small accumulated non-unit bind-frame errors made `Quaternion.angleTo()` report a ~0.107° change even when comparing identical stored rotations. The repeated recovery check now passes with zero wrist-position change from skin updates, source rotation difference below 0.000005°, bounded skin twist below 90°, and maximum skin step 1.8° per 4 ms. The check saves its JSON before raising on failure, retaining diagnostic evidence.

Visual verification completed: fresh run/walk/combo/dual contact sheets, named Back/Left reach frames, repeated K K recovery, 9 poses × 8 angles both bare and equipped (144 views), plus cloak-only and mask-only idle. No shader errors. The cloth folds and local sword grips were retained.
