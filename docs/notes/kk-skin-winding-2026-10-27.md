# K K skin winding and runtime twist limits — 2026-10-27

User supplied a screenshot of a hanging arm with a corkscrew sleeve after K K and asked why Blender did not lock rotation. Live Blender audit confirms the authoring controls already have enabled local Limit Rotation constraints (influence 1): arm roll ±90°, forearm roll ±85°, elbow bend −5…145°, plus shoulder/hand ranges in `anatomical-rig-limits.json`. The GLB exports deform joints and baked clips, not those CTRL/MCH constraints. The procedural Three.js arm solver runs independently.

## Cause

`twist_skinning.js` unwrapped bind-relative quaternion twist against its previous value without an anatomical range. Equivalent +360/-360 turns therefore accumulated in a **skin gradient**, although solved hand and elbow endpoints stayed finite and returned normally. Partial twist stations are not invariant under adding 360° to their source angle: 1/3 of 360° is 120°. Thus a visually identical endpoint rotation left a corkscrew in the sleeve. Repeated K K / recovery reproduces the user's symptom: maximum distributed roll **456.50°**, maximum scalar step **56.64° per 4 ms**. A recorded peak is left upper arm −456.20° at trace time 5764 ms. Previous tests recorded maximum roll but only asserted finiteness and endpoint agreement; this was a real coverage gap.

## Fix

- `boundedTwistTarget` in `twist_math.mjs` extracts the principal bind-axis twist, clamps the distributed component to upper ±90° / forearm ±85°, and retains the same stop across an out-of-range ±180° seam. On re-entering the allowed interval it returns through that interval rather than adding another revolution.
- `stepSkinTwist` eases the bounded scalar with 60-ms response and ≤450°/s rate. A zero-time update cannot advance it.
- `real.twist.advance(T)` runs exactly once per four-ms physics step, after support-elbow and upper-roll correction. `twist.update()` only builds palette matrices; rendering, shadows, accessory fitting and CPU surface queries cannot advance or accumulate twist.
- The proximal skin station subtracts the bounded distributed component and the later stations restore 1/3, 2/3 and 1 of it. Residual solved rotation remains common to the segment instead of being wound multiple turns along the sleeve. The last station still equals the complete solved source transform.

These are bounds on the **skin's distributed axial component**, not a claim that raw Mixamo Euler axes equal the Blender control axes. Existing runtime wrist/elbow/shoulder and DUAL solver limits remain active. No solver bone, wrist target, sword grip, attack key, geometry, weight, normal, UV, texture or Blender master was changed in this pass. The supplied source surface is retained. Small pre-fix code snapshots are in `out/kk-twist-before/`; this fix does not require another model export.

## Verification

- Two new pure-math regressions include 6,000 steps across multiple revolutions and alternating quaternion signs, bounded per-step motion, paused-update idempotence, re-entry from stops and eventual return to rest. The existing two DQ permutation/sign tests pass too.
- `twist_check.js`: nine synthetic arbitrary-bind-axis cases plus 800 four-ms steps each of walk, run, single attack and dual. Now asserts bounded roll and ≤1.8° per step, alongside endpoint equality, no solver mutation, fractional stations, rigid matrices and repeated palette-update idempotence. Zero failures and shader errors.
- `twist_recovery_check.js`: two K K cycles, capture times 700/1080/1700/2300/2800/4200/4700/5800/6500 ms. Includes draw, sheathe and settled idle after each cycle. Before/after reports `out/twist-recovery-before.json` and `after.json`; images `out/motion-views-dual-twist-before.png` and `after.png`. After: maximum roll **89.99°**, maximum step **1.8°**, skin update wrist displacement **0**, source quaternion difference only numerical angle-comparison noise (~0.000004°). `out/dual-return-after.png` is the focused standing view after K K.
- Full Motion Check **132 PASS / 0 FAIL**: adds skin axial bounds, scalar rate, and complete endpoint-matrix equality to the previous 129. The last check explicitly refreshes the palette after physics-only ROM traces, so it compares the same pose rather than a stale last-render palette. Existing hit, contact, hand-surface grip, loaded wrist and upper-roll checks stay intact; no existing threshold was relaxed.
- Fresh run/walk/combo/dual sheets inspected, plus nine bare/equipped poses × eight angles and separate cloak/mask layers. Shader errors empty. Syntax and diff-whitespace checks pass.

This removes the accumulated winding defect; it is not a cloth simulation or proof of zero intersection in every extreme sleeve pose. Future palette changes must preserve explicit axial bounds, physics-only advancement and source endpoint transforms, and test several complete attack→idle cycles rather than just impact frames.
