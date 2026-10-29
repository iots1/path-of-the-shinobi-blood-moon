# K K left-arm lift: detailed frame review — 2026-10-27

Supersedes the reach-shape selection and 480 ms reach window in `shoulder-led-draw-2026-10-27.md`. The user still saw unnatural twisting after the full-resolution viewer made the frames inspectable. Backups before this pass are in `out/left-lift-refinement-before/` (runtime, constrained solver and diagnostics). The original 31 × 4 before images are `out/motion-frame-left-lift-before-<time>-<angle>.png`.

## What the range checks missed

The old draw endpoint satisfied the broad wrist ellipse but used approximately 64° wrist extension and an elbow interior angle of 56°. The first fit was computed while the body was still recovering from the thrust. Its joint-space approach folded the hand across the chest/face and then corrected the shoulder late. A valid authoring joint box alone did not produce the requested outside-elbow, shoulder-led lift.

## Changes

- Choose the draw endpoint with a narrower wrist comfort ellipse (35° flexion/extension, 20° radial / 25° ulnar deviation), an outboard elbow preference, and a blade-axis cone. The palm position has high priority; the original local `real.grip.L.pt` and `K`, the back sword placement and `KAT_TSUBA` remain unchanged.
- Use three bounded clavicle correction coordinates instead of two, adding protraction/retraction. Stored order is X, Z, Y to retain the existing first ten solver indices. Offset bounds are X −25…40°, Y ±20°, Z ±30° and rates 120°/s. These are offsets applied to the procedural shoulder base, not a claim about an individual's clinical joint limits.
- Refit the endpoint once at 24% of the approach (144 ms), after the torso has begun rising from the thrust. Keep the original trajectory start and the current live joint state when replanning. Early preparation bends the elbow; forearm pronation and wrist orientation wait for this refit, avoiding an initial turn toward an obsolete goal followed by a reversal.
- Preparation ends at 44% (264 ms); thereafter elbow and wrist local shape remain fixed while shoulder/clavicle motion carries the hand. The approach now lasts through the existing 600 ms draw hand-off, with bounded shoulder-only refinement in its final 20%. The draw/extract/cut/sheath action boundaries are unchanged.
- Keep the narrower wrist envelope during extraction too. Radial room eases from 20° to the rig's existing 25° while pulling along the saya. Position tracking and a 23° blade-axis preference retain the 11 cm requested pull without compensating with ~60° wrist extension. The existing extraction tolerances (2.5 cm pull allowance / 4 cm lateral / 25° blade) were not relaxed.
- The audit now checks wrist comfort through draw/extraction, an outboard elbow and limited forward collapse near contact, and all three clavicle correction coordinates. The shape-lock sampling starts after the actual 264 ms preparation boundary, with the original rotation tolerances unchanged.

## Reproduction and review

`/debug/anatomical-game-check.html?mode=liftcheck&bones=1` captures global 400–1000 ms every 20 ms: 31 frames × front/right/back/left = 124 full-resolution images. Global 400 ms is K K time 0; global 1000 ms is K K 600 ms. The mode appears in the scenario dropdown. Review all 124 images, including the original Back 640/740/840 and Left 540/640/740 views. Full PNGs are saved as `out/motion-frame-left-lift-after-<time>-<angle>.png`. Capture metadata includes both arms' angles and screen projections for reproducible close-up contact sheets.

`views({saveFrames:true})` saves individual PNGs in addition to the legacy sheet. It is optional for other modes. The temporary numerical endpoint study was removed from the client; its investigation outputs remain in ignored `out/`.

## Validation

The final numerical motion suite passes 134 checks, including 7,900 arm samples at 4 ms across quick repeated K K, delayed second K, and running entry, with zero violations and no shader errors. New draw/extraction comfort and elbow-plane tests are included in those audits. The reviewed standing lift samples use approximately 20° maximum flexion/extension magnitude rather than the former 64°, while retaining the fixed distal shape during the lift. Source hinge and wrist constraints remain active.

Final extraction audit: lateral error below 0.8 cm; blade-axis error below 24°; required pull distance passes in all three scenarios. Draw/sheathe contacts, original grip checks, cut extension, hit timing, no wrist winding, shoulder velocity and bounded skin twist remain passing. The arc/twist/volume math unit suite passes all seven tests. Fresh run/walk/combo, powerdraw, repeated dual recovery and bare/equipped pose-angle sheets are also reviewed before completion. No mesh, weight, texture, Blender master or GLB changes are part of this pass.

Final contact measurements: draw palm gap 0.8–1.0 cm and blade difference about 21°; sheathe gap 0.3 cm and blade difference 8–9°. The local grip offsets themselves are unchanged. Screenshot proof of the latest 100% viewer at global 940 ms: `out/left-lift-detail-verified.png`. All 124 lift views and the 48 powerdraw phase views were inspected in close-up sheets, along with fresh locomotion/combo and 144 bare/equipped views. Repeated recovery through 7300 ms retains source-bone rotations within 0.000005°, wrist position exactly, and bounded skin twist without non-finite values.
