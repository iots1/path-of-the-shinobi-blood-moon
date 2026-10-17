# CLAUDE.md — zanshin 残心

You are helping build an isometric ink-brush-style action game. The user is new to Blender and 3D, and speaks Thai — converse with them in Thai, explaining steps one at a time and naming exact menu/button labels.

## What the game is
- Protagonist: a ninja in a grey hood with a face covering and black kimono, two swords sheathed on the back, wielding one katana
- Look: black/white/grey ink-brush-on-paper style, with a single spot of red (the torii gate, the final combo kanji)
- 3-beat combo: 一 diagonal downward slash → 二 upward slash → 三 spinning sweep
- Map: a floating isometric island with a stone courtyard, a pond, cuttable bamboo, and straw training dummies

## Key files
- `client/index.html` — the entire game in one file (ES module, `three@0.160.0` via importmap from jsdelivr), divided into sections by comments `1) ART … 6) CAMERA`
- `client/legacy/ninja-dojo-2d.html` — the 2D prototype (PixiJS), kept for reference, do not edit
- `server/main.go` — Go dev server (serves the client + assets)
- `art/reference/` — reference images: `ninja-sword/` (no face covering, sword on the back), `ninja-body/` (no face covering, no sword — body/proportions only), `cloak/` (hooded — the current in-game model's source reference)
- `assets/ninja.glb` — the character: a full-body hooded model (Meshy multi-image-to-3D + rig, Git LFS), hood/cloak/back-swords sculpted into the mesh. Bone list + mapping: `docs/BONES.md`. Inspect with `python3 tools/inspect_glb.py assets/ninja.glb`. **Not Mixamo naming** — see BONES.md before touching bone names in code.

Run with `cd server && go run .` then open http://localhost:8080

## Client architecture (know this before making changes)
- Units = meters. The character faces +Z; the character's right hand is on the -X side. Height 1.75 m.
- **Color pipeline is pinned to r128 behavior**: `THREE.ColorManagement.enabled=false`, `renderer.outputColorSpace=LinearSRGBColorSpace`, `renderer.useLegacyLights=true` (deprecated in 0.160, removed in r165 — upgrading Three.js past that means retuning light intensities). Don't flip these without comparing screenshots.
- **Two rigs.** The procedural rig (nested `THREE.Group`s in `rig`: `root → hips → spine → chest → neck → head`, legs `thighL/R → kneeL/R → ankleL/R`) is now an **invisible driver**. `applySkeleton()` poses it exactly as before, then `driveRealBones()` copies each driver's rotation delta (relative to its rest) onto the matching real bone of `assets/ninja.glb` (`BONE_MAP`, section `3b`). If the glb fails to load, the procedural body stays visible as a fallback.
  - This model's bones have **no naming prefix** (`Hips`, `Spine`, `LeftArm`, …) and the spine order is reversed vs. a typical Mixamo rig — `Spine02` is closest to the hips, `Spine` (no suffix) is closest to the neck. See `docs/BONES.md`.
  - The Armature node carries a **0.01 scale** (mesh authored in cm-like units). Two consequences: (1) quaternions must be extracted via `Matrix4.extractRotation()` first, never `Quaternion.setFromRotationMatrix()` on a matrix that still has this scale baked in — it silently produces a non-unit quaternion and the whole rig collapses; (2) a `Mesh` parented directly as a child of one of these `Bone` objects doesn't render (looks like a frustum-culling quirk) — world-space props must be positioned every frame via `matrixWorld`, never literally `bone.add(prop)`.
  - Meshy's bind pose has the legs splayed; `real.corr` straightens each leg segment first so `spread` etc. mean the same as on the driver.
  - **Hood, cloak and back-swords are sculpted into this model's mesh** (not a separate driver-rig piece like the previous no-hood body) — the matching procedural shapes (`rig.back`, `rig.cloakRoot`, `rig.hood`, `rig.mask`) are just hidden, not re-homed.
  - The eye glow (`rig.eyes`, toggled by the `eye` pose parameter) is a code VFX, not part of the model — the source art's eyes are a flat 2D highlight that Meshy's 3D reconstruction couldn't reproduce (tried `retexture` with a text prompt; it altered unrelated parts of the model and still didn't add eyes — reverted). Positioned in world space from `Head.matrixWorld` each frame (see the scale/bone-mesh note above for why it can't just be parented).
- **Arms are not driven by the driver rig.** 2-bone IK (`solveIK`) runs from the real `LeftArm/RightArm` positions with the real segment lengths, then `aimArm()` aims the real upper/fore-arm bones at the IK elbow/wrist (with a twist so the mesh's elbow hinges in the bend plane). The right arm holds the sword (placed at the IK wrist); the left arm hangs or grips the hilt (`two`).
- **Poses are parameters, not direct bone keyframes**: `IDLE = {hx,hy,hz (hand position in chest-local coordinates), by,el (blade direction), hipY, hipYaw, chestYaw, lean, headYaw, spin, spread, two, eye, glint}`
- `COMBO[]` = a list of timelines `keys:[[time ms, pose, ease], …]` plus `impactMin`, `chain` (the time window to chain into the next combo hit), `end`
- Every parameter passes through `SOD` (second-order dynamics) before use; the (f, ζ, r) values differ per group (hand/blade/body/spin). This is what keeps poses from looking mechanical — **do not replace it with plain lerp**.
- The "hit" beat is detected from the sword tip's velocity starting to decrease, not from a fixed time (`maxSp`, `decel`). That's what triggers hit-stop, camera shake, and the combo kanji.
- Hit detection uses the distance from the blade's line segment (wrist→tip) to the target's axis on the XZ plane (`hitTest`)
- The loop uses a fixed 4ms substep (`step(T)`). The camera is orthographic isometric (yaw 45°, pitch 35.26°), rotating 90° at a time with Q/E.
- Debug: `window.__iso` exposes `{S, step, frame, stop, press, CAM, rotateCam, tiltCam, rig}`, used to drive the game deterministically for headless-browser testing (`stop()` then `frame(0,16)` repeatedly to step; `rig.real` holds the loaded model/bones)

## Status: real model is in the game (`assets/ninja.glb`)
Done: ES modules + GLTFLoader, T-pose → hanging arms (via IK), toon + skinned inverted-hull outline, IK/pose system driving real bones, sword at the IK wrist, full-body hooded model (hood/cloak/back-swords sculpted in, generated via Meshy MCP from `art/reference/cloak/`), eye glow re-tuned for the new head. All 3 combo beats, walking, and camera rotation verified in the browser.
Known follow-ups:
- Texture is 2048² + a 4096² metallic/roughness map — fine as-is, lower priority than before
- The glb contains one baked rest-pose animation clip — unused on purpose, never play it
- Skeleton debug view (`B`) still draws the driver rig, not the real bones
- The model's own face/eyes are blank under the hood (see the eye-glow note above) — the code VFX is the fix, not a model change

## Project rules
- **The Go side is the sole authority on outcomes** (whether a hit landed, how much health is lost) — never trust values sent by the client.
- Do not commit `.glb/.blend/.fbx` files until `git lfs install` has been run.
- Models from Meshy: record which plan was used to generate them in `docs/CREDITS.md` (free-tier plans = CC BY 4.0, credit required).
- Before declaring something done, run the game and look at the actual result (screenshot or open it in a browser) — not just reading the code.
- Work in small steps and explain what changed at each one, since the user is new to this.

## Blender
See `docs/BLENDER_MCP.md` — uses blender-mcp (configured in `.mcp.json`). The user needs to have Blender open and click Connect first. If the blender tools aren't visible, ask the user to check that step.
