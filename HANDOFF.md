# HANDOFF — zanshin project status as of 2026-10-17

This document summarizes what was discussed in the Claude web chat, to hand off to Claude CLI working in the project folder.
**Read alongside `CLAUDE.md`** (CLAUDE.md = code architecture / this file = status and open work)

## 0. The user and how to work with them
- New to Blender/3D — explain in Thai, one step at a time, naming exact menu/button labels
- Can write Go (wants a Go backend); the game itself is HTML/JS/CSS
- **Dislikes** anything that looks geometric/stiff — wants the soft, curved ink-brush look of the original art, and slashes that feel weighty, not like perfect circular arcs
- Working via Claude CLI on their own machine at `/Users/PEEPO/Project/game/zanshin` (macOS)

## 1. Goal
An isometric ink-brush-style action game. Protagonist is a hooded ninja, 3-beat slash combo.
The camera needs to rotate (left/right/up/down), so **3D** (Three.js) was chosen over 2D.
Backend = Go (judges hit results, saves, multiplayer later).

## 2. What's done
| Item | Status |
|---|---|
| 2D prototype (PixiJS, mesh skinning from the original artwork) | Done, retired, kept at `client/legacy/`, do not edit |
| Isometric 3D prototype (`client/index.html`) | Done: walking, 3-beat combo, ink sword trail, cuttable bamboo, swaying straw dummy, camera rotate/tilt/zoom |
| T-pose reference images (front/side/back) | Done, in `art/reference/` |
| Repo skeleton + Go dev server | Done (`server/main.go` not yet compile-tested) |
| Character model from Meshy | **Created on the Meshy website, not yet downloaded into the repo** (see section 4) |

The character in `client/index.html` **is currently a temporary procedurally-generated model** (cylinders + spheres + outline), not the real asset.

Prototypes published on claude.ai (viewable for comparison, if same account as the user):
- isometric: https://claude.ai/artifact/FJMhKuyurxNx7E6WagR8B6
- 2D: https://claude.ai/artifact/VCaLVfmea4KzGRQfkxqVQM

## 3. Decisions already made (don't change without asking the user)
1. **Three.js** for the client, **Go** for the server, **Blender** for model work
2. The character is layered: **base body (ninja, no cloak) + cloak/hood as a separate piece**. The cloak flutters via spring bones (prototype exists in `rig.cloak[]`)
3. The sword is built in code, attached to the wrist, not part of the glb
4. The ink look comes from **in-game shaders** (3-tone toon + outline + paper texture), not from AI-generated textures
5. Poses use the existing system: pose parameters + arm IK + second-order dynamics (do not replace with plain lerp — the user dislikes the geometric look that produces)
6. The Go side is the sole authority on outcomes; never trust values from the client

## 4. Current task: bringing the Meshy model into the game

### 4.1 The model the user already created
- The **ninja (no cloak)** body, T-pose, not holding a sword, built from the images in `art/reference/ninja-sword/`
- At the time of the screenshot: 424,492 triangles, 227,408 vertices
- Created on the free plan → **CC BY 4.0** license (Meshy credit required). The user has since subscribed to a paid plan — if they want the no-credit-required license, the model needs to be regenerated after subscribing. **Ask the user which one applies, and record it in `docs/CREDITS.md`**

### 4.2 Steps the user has to do themselves on the Meshy website (Claude CLI can't do this part)
In order (per the Meshy guide: Remesh before Rig):
1. Remesh: Fixed, Custom **20,000**, Topology **Quad**, then Confirm
2. Check the texture after remeshing (the guide says remeshing requires new UVs, and retexturing afterward gives better results)
3. Rigging (the running-person icon, rightmost button on the bottom bar, or the Animate menu on the left): place markers on the body (e.g. chin, shoulders, knees), enable symmetry, try switching between T-pose/A-pose to check for limb distortion
4. Download the **GLB** with the skeleton applied → `assets/ninja.glb` (optionally keep the pre-rig GLB as a backup at `assets/raw/`)
5. (Optional) Apply idle/walk/run poses from Meshy's animation library — check the credit requirements before applying

Spots where auto-rig is likely to fail: the hood covering the chin, wide hakama pants covering the knees, T-pose arms. If the skin deforms incorrectly, fix the weights in Blender (Weight Paint → Smooth).

### 4.3 What Claude CLI can do once the file exists
1. `python3 tools/inspect_glb.py assets/ninja.glb` → see triangle count, bone names, hierarchy, animations, texture sizes **without opening Blender**, then write the results to `docs/BONES.md`
2. Inspect/fix in Blender via MCP (`docs/BLENDER_MCP.md`): scale to ~1.75 m tall, downscale textures to 1024, test limb deformation, export over the existing file
3. Replace the temporary in-game character with the glb (details in the "Current task" section of `CLAUDE.md`)

### 4.4 Bone name mapping (guessed — must be verified against the real file)
If the rig follows the Mixamo convention (the Meshy guide says Mixamo animation libraries are compatible), names are usually like this, but **must be confirmed with `inspect_glb.py` first**.

| In the game code (`rig.*`) | Likely name |
|---|---|
| hips | Hips |
| spine | Spine |
| chest | Spine1 or Spine2 |
| neck / head | Neck / Head |
| thighL / kneeL / ankleL | LeftUpLeg / LeftLeg / LeftFoot |
| thighR / kneeR / ankleR | RightUpLeg / RightLeg / RightFoot |
| arms (IK uses shoulder-elbow-wrist) | LeftArm / LeftForeArm / LeftHand (and right) |

Note: in the game code, the character's "right" is on the **-X** side — double-check that left/right in the glb isn't swapped.

## 5. Known issues / things to watch for
- The Three.js r128 build on cdnjs **has no GLTFLoader** at the paths tried (404s) → switch to ES modules + an importmap from jsdelivr `three@0.160.0` (confirmed `build/three.module.js` and `examples/jsm/loaders/GLTFLoader.js` return 200), then verify the toon shader/outline/lighting still look the same
- The Meshy model is in **T-pose**, but the game's standing pose has the arms hanging — needs retargeting on load
- The inverted-hull outline needs to work with `SkinnedMesh`
- The prototype has no system yet for making occluding objects transparent (walking into the bamboo grove hides the character)
- Must run through the dev server — don't open the file via `file://` (`.glb` won't load)
- `server/main.go` hasn't been compile-tested yet
- Not yet done: save-data API, WebSocket, cloak as a separate piece, sword model, callout art (face, hands, obi knot)

## 6. Next steps in order
1. Confirm the game runs: `cd server && go run .` → http://localhost:8080 (fix any Go errors)
2. Wait for the user to provide `assets/ninja.glb` → run `inspect_glb.py` → write `docs/BONES.md`
3. Move to ES modules + GLTFLoader
4. Load the glb in place of the temporary character, retarget T-pose → standing pose, wire up the existing IK/pose-parameter system
5. Adjust the toon shader + outline for `SkinnedMesh`, compare the look against the reference art
6. Make the cloak a separate piece + spring bones
7. Add the occlusion-transparency system
8. Go: player save data → WebSocket (server judges hit results)

## 7. Suggested opening message for Claude CLI
```
Read CLAUDE.md and HANDOFF.md, then give me a short summary of your understanding of the project.
Then check that the server runs (cd server && go run .) and report the result before doing anything else.
```
Once the model file exists:
```
I've placed assets/ninja.glb. Please run python3 tools/inspect_glb.py assets/ninja.glb,
explain the results to me, write docs/BONES.md, and propose a plan for replacing the temporary
character with this model before touching any code.
```
