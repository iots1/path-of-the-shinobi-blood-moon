# Running V2 — 2026-10-20

Reference: `art/reference/ninja-no-hood/ninja_katana_run_side.jpeg`.

The archived `assets/raw/backup-hood-v2-2026-10-18/anim/run.glb` is not used.
Before V2 the game used the `Running` clip embedded in `assets/ninja.glb` for
legs, with procedural torso/arm/sword IK. V2 preserves this architecture.

- `assets/anim/run-v2.glb`: 23 KB, 0.633-second cyclic `RunningV2`, eight leg
  quaternion tracks, no mesh/textures/root motion. Derived from the current
  ninja's embedded `Running`, increasing rotation relative to bind by 12% at
  the thighs and 10% at the knees for more knee drive and heel recovery.
- `tools/build_run_v2.py`: reproducible builder, executed inside Blender via MCP
  for `mathutils.Quaternion`. It reads the source model and writes only the
  separate animation asset; it does not edit the open Blender scene.
- `client/index.html`: loads V2 and calibrates its stride and phase against the
  current skeleton; retains embedded `Running` if loading fails. Walking stays
  on embedded `Walking`. `RUN_V2` raises/retracts the rear hand; existing forward
  lean remains. Running hand orientation keeps the wrist neutral and thumb down,
  so `RUN_HOLD` angles the blade down ~35° from the forearm. The final local wrist
  turn is capped at 300°/s to prevent reversal-dependent roll snaps.
- `client/debug/run-v2-review.html`: review page with motion-check and run/front/
  side/walk/combo contact sheets. Wait for “RunningV2 loaded” before checking.

Validation uses `client/debug/motion_check.js`, including run/stop, walk/stop,
attacks and 12 reversals. The former blade/forearm limit of 25° is intentionally
45° for V2's downward blade; the actual wrist-bend limit remains 25°. A separate
check requires the blade to point at least 10° below horizontal through settled
reversal samples, guarding against the old history-dependent upward blade.

The leg asset alone does not contain the full upper-body pose: the game supplies
that pose through its procedural IK. The original character and archived run
assets remain available.

## Reference overlay correction

`/debug/run-overlay.html` plays the actual game rig against the reference with
adjustable opacity, pause/frame-step, a lean toggle/slider, phase search, anatomy
markers and PNG/JSON capture. The renderer is transparent only with the debug
query `motionOverlay=1`; ordinary gameplay rendering remains opaque.

The debug iframe's stage fills a true 1024×768 surface before capture. The page
rejects a different aspect ratio instead of stretching it. An early prototype
had stretched the game's shorter stage to 1024×768, invalidating its ~19° angle
reading and exaggerating body proportions; those prototype captures are not a
basis for editing the mesh or rig.

Manual reference hip/neck landmarks measure ~40.2°. `RUN_TUNE.lean=.65` applies
pitch at the pelvis (with clip thighs counter-rotated to preserve their world
motion), rather than folding only the lower spine. `headCounter=1.05` keeps the
head more upright. Pitch is eased over 80 ms. A motion regression checks the
actual hip-to-neck axis stays 35–45° through settled direction changes.

The right arm run target is relative to the actual shoulder and character axes
(`RUN_ARM.back=.44`, `drop=.08`, `out=.045`), so torso pitch does not lift the hand
above the back. Its target is eased over 110 ms. The hand-behind-shoulder regression
uses the character frame, rather than the steeply pitched chest frame.

Alignment uses a manually marked hip/neck pair and a uniform scale fixed at
initialization, with no image rotation or warping. Other landmark differences
remain visible and are recorded in the capture JSON; torso-angle agreement does
not imply identical body proportions or a pixel-perfect full-body silhouette.

## Body stability correction

The live `assets/ninja.glb` now contains corrected abdomen skin weights; the
identical candidate is `assets/ninja-bodyfix-v1.glb`. The source model was backed
up before editing in `assets/raw/backup-before-run-body-fix-2026-10-20/` together
with the animation, game source and motion checker. The source model SHA-256 is
`a3102780110272d828ddcde3a3ee7844b2501f5aaadb85447716043afe67efea`.

`tools/fix_ninja_abdomen_weights.py` runs in Blender, transfers thigh/leg
influence from 3,212 central abdomen vertices to Hips/Spine with smooth spatial
falloffs, and preserves vertex order, topology, textures, skeleton and animation.
Only JOINTS_0/WEIGHTS_0 binary bytes change; the GLB JSON stays identical.
The original leg clip remains unchanged. A Blender inspection copy is saved as
`blender-ninja/run-bodyfix-v1.blend`.

`client/rig/volume_skinning.js` adds dual quaternion skinning to the game body,
outline and shadow materials, retaining the original linear path for comparison.
Bone scale outside the rigid-transform tolerance automatically selects linear
skinning. `tools/test_volume_skinning.mjs` verifies rigid transforms, opposing
twist volume and quaternion hemisphere continuity using the shared CPU math.
This preserves volume during twists; it does not repair every topology or
anatomical limitation of the source mesh.

Locomotion uses critically damped hand/blade/body responses, reduced vertical
bounce and torso twist, and cadence multiplier 1.0 instead of 1.2. Attacks keep
their authored response settings. The run clavicle retracts by .65 radians and
the blade grip uses phi=70 degrees. These change the full game, not just the
reference viewer.

The reference viewer can instantly switch original/fixed weights and toggle
volume skinning at the same pose. “แคปก่อน / หลัง” saves a same-frame comparison
of original weights + linear skinning, corrected weights + volume skinning,
and the reference. Both model panels use the same camera, scale and bone pose.
It demonstrates deformation changes only; the BEFORE panel already uses the
current locomotion, so it is not an old-animation comparison.

Validation artifacts (local, ignored by Git):
- `out/run-v2-motion.json`: latest full motion report.
- `out/run-body-before-after-ref.png`: same-frame skinning comparison.
- `out/run-overlay-fixed.png` / `.json`: transparent overlay and measurements.

Torso matching alone does not mean all joints or the silhouette match the
reference. The source character has different proportions and the leg cycle is
still derived from embedded Running. Manual reference landmarks are approximate.

Latest body-stability validation: all motion checks PASS after a fresh load and
after viewing contact sheets. Fresh-load run/stop elbow peak 5.177 m/s (limit 6),
with no threshold changes. Body shader compiled without errors and the rigid
scale fallback was inactive. Side/front run contact sheets were visually checked.
