# Continuous upper-arm roll — 2026-10-26

Follow-up to anatomical rig integration: abrupt upper-arm axial motion during attack/recovery is now bounded while retaining existing grip trajectories. No Blender or GLB changes were needed.

## Implementation

`client/rig/upper_arm_roll.js` runs after both arms, wrists and fingers have been solved, on every four-ms physics step. It parallel-transports the previous upper-arm local orientation onto the newly solved shoulder-to-elbow direction. Only the residual axial rotation eases: maximum **450 degrees/s**, acceleration **6,000 degrees/s²**, response time **0.045 s**. State is in the clavicle/parent frame, so body turns remain normal body motion. Signed quaternion residuals handle ±180 degrees. A reversing target permits small overshoot rather than an abrupt velocity reset.

The controller saves `upperQuaternion * forearmQuaternion`, then writes forearm-local `inverse(newUpperQuaternion) * savedProduct`. Rotation about the actual upper-arm child axis retains the elbow position; the saved product restores the downstream orientation, preserving wrist, hand, fingers and both swords. It does not change grip settings, attack keys, hand targets, SOD, hit timing, or the original roll-target state. The twist-skin palette reads the corrected bones normally.

`real.upperRoll.stats` exposes rate and preservation diagnostics. Two permanent motion checks enforce ≤450 degrees/s and downstream preservation (elbow <1 micrometre; orientation <0.001 degree). The full suite now has **127 checks**, all passing.

## Measured validation

`client/debug/upper_roll_check.js` compares **3,625 four-ms steps** through five scenarios. Rates measure axial motion after removing the segment's changing direction, not a raw bind-relative angle.

| Scenario | Before: peak degrees/s | After |
|---|---:|---:|
| Single cut | 2,171 | 450 |
| Three-beat combo | 2,257 | 450 |
| Quick K K | 2,275 | 450 |
| Delayed K K | 1,656 | 450 |
| K K from movement | 41,147 | 450 |

The recorded before/after comparison has maximum wrist/elbow/visible-sword position difference about **0.00026 mm**, and maximum hand/visible-blade orientation difference about **0.000059 degrees**. Per-step correction diagnostics show about 0.000052 mm elbow error and 0.000003 degrees downstream orientation error. Differences reflect imported bind precision and independently initialized browser runs. Cross-run tolerances are 1 mm / 0.1 degree; direct correction invariants are much tighter. Normalize both quaternion operands when comparing orientations, to avoid false angle errors from imported float32 bind data.

Synthetic validation exercises two arms for 600 frames with arbitrary bind/parent rotations, moving swing and abrupt ±175-degree targets. It checks bounded velocity/acceleration and unchanged wrist pose; maximum position error <3e-16 m, orientation error about 0.000002 degrees. Shader diagnostics are empty.

Reports: `out/upper-roll-before.json`, `out/upper-roll-check.json`, `out/motion-check.json`. Fresh four-angle sheets cover combo, dual, run and walk. Dense `upper-roll` sheets inspect single-cut recovery/re-entry at 970–1110 ms (second press at 1020 ms) and the dual transition at 810–950 ms.

## Reproduce

Use `/debug/anatomical-game-check.html?mode=armroll` for synthetic/rate/preservation checks. For a future before/after comparison, capture the pre-edit revision with `mode=armbaseline`, temporarily copy `out/upper-roll-before.json` to `client/debug/upper-roll-baseline.json`, then run `mode=armroll` on the edited revision. Remove that temporary public fixture afterward; reports remain under ignored `out/`. Without it, the test reports `baselineCompared:false` and still validates synthetic motion, physical rate and correction invariants.

`mode=check` runs the full suite. `mode=combo|dual|run|walk` creates the normal sheets; `mode=rollcombo|rolldual` creates dense sheets. Load a fresh page between modes because these tools freeze the game.

The source clothing's previously documented extreme-pose stretch remains; this is a roll-continuity correction, not a new elbow IK model or corrective geometry.
