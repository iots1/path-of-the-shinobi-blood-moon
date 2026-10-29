# Shoulder-led back draw and extended downward cut — 2026-10-27

User reference: `art/reference/arm-draw/shoulder-led-grip-2026-10-27.png` (the supplied 07:44 screenshot). Supersedes the simultaneous eight-joint draw interpolation in `dual-reach-anatomy-2026-10-27.md`.

The requested motion is a sequence: abduct slightly and prepare the bent elbow/hand; preserve that distal shape while the left shoulder carries it to the hilt; pull upward along the saya; extend the arm sideways; use shoulder and torso motion for a downward cut. A pose passing joint-range tests alone is not sufficient to match this reference.

Backups before this revision: `out/shoulder-led-reach-before/` (index, constrained solver, reach diagnostic). Geometry, weights, UVs and the local sword grip remain unchanged.

## Implementation

- The draw prepares forearm flexion, pronation and wrist swing/twist during its first 44% (about 211 ms). The subsequent lift retains those five coordinates through the 600 ms hand-off. Shoulder rotation carries the existing bent-arm shape; a sideways elbow endpoint preference prevents the reach from collapsing in front of the face.
- The initial endpoint fit predicts a relaxed clavicle, rather than using the raised/protracted shoulder left over from the thrust. Tentative IK elbow positions no longer drive the clavicle while the final arm uses a different FK plan.
- The constrained grip solver also controls a small, rate-limited clavicle adjustment (local X/Z up to ±20°, 120°/s). This lets the shoulder girdle bring the fixed hand shape to the hilt, instead of compensating with elbow or wrist rotation. Clavicle offsets ease back after the sword return, before idle takes over.
- Stages: draw through 600 ms, extraction 600–1030 ms, sideways extension 1030–1350 ms, downward cut 1350–1590 ms, follow-through to 1680 ms, return by 1960 ms, sheathe at 2100 ms, recovery through 2600 ms. The preparation has time to finish; the downward stroke remains fast. Each stage prepares a constrained endpoint and interpolates bounded joint coordinates. Spread/cut endpoints favour an almost extended elbow (at least 165° interior angle before the cut), retaining a safe bend. The downward stroke changes forearm flexion by at most 5° from its extended start and must keep an interior angle of at least 160°.
- Extraction targets an initial 11 cm pull of the hilt along the back saya's +Y axis before the lateral sweep completes the draw. Extraction uses a continuous palm/axis solve rather than interpolating between shoulder poses, which would produce an arc away from the sheath. The fist's local grip stays fixed. The downward cut targets the lower forward diagonal with a near-neutral loaded wrist and added torso rotation/lean.

## Verification

Use fresh `/debug/anatomical-game-check.html?mode=check` for all motion checks, including the every-4-ms joint audit. Added phase-specific audit conditions measure the forearm/hand local quaternion drift during the shoulder lift, arm extension/outboard reach before the cut, and actual palm/blade alignment during extraction. These measure solved source bones and the unchanged sword grip, not just requested key values.

`mode=powerdraw` produces `out/motion-views-dual-shoulder-draw.png` covering preparation, hilt contact, extraction, full extension and cut, from all four sides. `reachafter` retains the original named-frame comparisons. Also verify repeated quick/delayed/running K K, skin twist recovery, standard run/walk/combo/dual sheets and the bare/equipped all-angle sheets.


## Constraints and results

The normal motion suite passes 134 checks. Its integrated 4 ms audit covers 7,900 arm samples across repeated quick K K, delayed second K, and running entry, with zero joint/phase violations. The lift retains both forearm and hand local orientation within the 0.02° / 0.05° tolerances; measured drift is effectively zero. Before the cut the elbow interior angle is at least 165° and the wrist is at least 34 cm outboard of its shoulder. Extraction measures movement from the actual solved grip (not the ideal hilt point), allowing the same 2.5 cm positional tolerance as hand-off contact; palm lateral error is about 1 cm and blade-axis error is below 25°.

Quick/delayed/running contacts pass: draw palm gaps 0.7–1.3 cm, return gaps 0.3–0.4 cm. Thrust and dual-cut hits both pass. Existing joint bounds, wrist winding, skin twist, locomotion, shoulder motion and torso checks remain active. No geometry or grip-offset changes were needed.

Every endpoint candidate must start from the same clavicle base quaternion. Recursive fits modify that bone: failing to restore it before each seed compounds shoulder rotation and makes a nominally good endpoint wrong when applied to the original base. Candidate temporal bounds use the actual stage start and duration; the cut limits forearm-roll and wrist changes so shoulder/torso carry the stroke. The lift is locked in joint coordinates, while extraction follows the moving sheath in Cartesian space.

At XZY shoulder gimbal positions, a control representation is accepted only if reconstructing it matches the actual source-bone quaternion within 0.005°. This handles equivalent x/y combinations at 90° abduction without relaxing the joint bounds or blindly trusting cached controls. Final hand quaternions are normalized after the wrist projection.

The diagnostic also records per-step CPU timing. On this host the audited runs had peak simulation calls around 12 ms and mean calls around 1.6–2.1 ms; this is diagnostic CPU timing, not an FPS guarantee. Endpoint fits are bounded by the stage duration, and normal extraction refinements use four iterations per step.

Final visual checks include run/walk/combo/dual, the five-stage close comparison, repeated K K through settled recovery at 7300 ms, and all 144 bare/equipped pose-angle views with separate cloak/mask idle views. Skin updates retain source poses and wrist positions, remain within 90° twist, and advance at most 1.8° per 4 ms; shader errors are empty. The reach comparison preserves the original six named frames and now also includes new draw/cut/return and settled-recovery timestamps.

Later refinement: `left-lift-detail-2026-10-27.md` supersedes the 480 ms approach and broad draw/extraction wrist shape described above.
