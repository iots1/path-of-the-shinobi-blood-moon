# CLAUDE.md — Path of the Shinobi: Blood Moon

You are helping build an isometric ink-brush-style action game. The user is new to Blender and 3D, and speaks Thai — converse with them in Thai, explaining steps one at a time and naming exact menu/button labels.

## What the game is
- Protagonist: a ninja in a grey hood with a face covering and black kimono, two swords sheathed on the back, wielding one katana
- Look: black/white/grey ink-brush-on-paper style, with a single spot of red (the torii gate, the final combo kanji)
- 3-beat combo: 一 diagonal downward slash → 二 upward slash → 三 lunging horizontal cut (right → left, two-handed, body leaning forward, big ink-arc finisher)
- Map: a floating isometric island with a stone courtyard, a pond, cuttable bamboo, and straw training dummies

## Key files
- `client/index.html` — the entire game in one file (ES module, `three@0.160.0` via importmap from jsdelivr), divided into sections by comments `1) ART … 6) CAMERA`
- `client/legacy/ninja-dojo-2d.html` — the 2D prototype (PixiJS), kept for reference, do not edit
- `server/main.go` — Go dev server (serves the client + assets)
- `art/reference/` — reference images: `ninja-sword/` (no face covering, sword on the back), `ninja-body/` (no face covering, no sword — body/proportions only), `cloak/` (hooded — the current in-game model's source reference)
- `assets/ninja.glb` — the character (the no-hood Meshy ninja, Mixamo rig, 70 joints incl. fingers + palm metacarpals; Git LFS; carries its own `Walking`/`Running` clips — see "Current model at a glance"). Older models/backups: `assets/raw/backup-*`. Inspect with `python3 tools/inspect_glb.py assets/ninja.glb`.

Run with `cd server && go run .` then open http://localhost:8080

## Detailed notes live in `docs/notes/` — read the relevant one BEFORE touching that area
CLAUDE.md is kept short (size limit). Every finding, measurement, dead end and "don't regress" note that used to be here was moved **verbatim** into these files (backup of the full old file: `assets/raw/backup-claude-md-2026-10-22/CLAUDE.md`). Code comments that say `see CLAUDE.md "<name>"` now point at a bullet in one of these — `grep -rn "<name>" docs/notes`. Notes are chronological: when two entries disagree, the **later** one wins (most say "supersedes …").

| File | Read before touching |
|---|---|
| `docs/notes/model-no-hood-2026-10-19.md` | the character asset's basics, `IDLE`, `CARRY`, `GRIP_CFG.R.phi`/`poleR` trade-offs, sword-arm swing, `SHOULDER.dropR`, standing pose vs. reference |
| `docs/notes/hands-grip.md` | anything in `GRIP_CFG`, `RUN_HOLD`/`CARRY_HOLD`, `FIST.*` (`ringAng`, `ringLean`, `thumbQR`, `thumbRelaxL`, `cup`…), `setFingers`/`prepFingers`/`adaptLeft`, `TSUKA_S`, finger/hand mesh, the grip solvers |
| `docs/notes/run-locomotion.md` | `RUN_*` constants, `RUN_CLIP`/`locoArmPose`, `WRIST_LIM`/`limitWrist`, `client/rig/reference_run.js`, `S.armRun`, run overlay |
| `docs/notes/combo-attacks.md` | beat 1 raise / `SHOULDER.raise`, `GRIP_TUNE.seatFlex`, two-handed off-hand wrist range |
| `docs/notes/face.md` | head/face mesh, `blender-ninja/face_sculpt_scripts/`, outline normals/bias, face overlay |
| `docs/notes/model-2026-10-18.md` | key reach rescaling policy, beat-2 stiffness dead end, post-attack droop (`IDLE_RELAX_MS`), grip-flicker history, `embeddedImageTexture()`, shoulder-mesh fix lessons |
| `docs/notes/architecture-details.md` | rig driving, leg correction, ground snap, locomotion clips, arm/grip continuity, every attack's design (beats 1–3, Space blink, K, K K, L), `BODY`/off-hand, material, back cloak, back swords, debug tips |
| `docs/notes/blender-pitfalls.md` | any Blender edit/export of `ninja.glb` |
| `docs/BONES.md`, `docs/BLENDER_MCP.md`, `docs/RUN_V2.md`, `docs/CREDITS.md` | bone names, Blender MCP setup, run v2, credits |

When you finish a piece of work, add its write-up to the matching `docs/notes/*.md` (new file if no topic fits, and add it to the table) — only add a one-line pointer or a genuinely global rule to CLAUDE.md.

## Current model at a glance (2026-10-22)
- `assets/ninja.glb` = Meshy no-hood ninja (visible face, no hood/cloak/mask), Mixamo rig in **metres, no armature scale**, faces +Z, right hand on −X. **70 joints** (28 body + finger chains on both hands + `Left/RightHandRing0`/`Pinky0` metacarpals), ≈33k verts / 50k tris. Hands rebuilt in Blender (2026-10-21, adult proportions, fingerless glove), face re-sculpted + photo-projected (2026-10-22). Own `Walking`/`Running` clips, **30 fps, 1.0333 / 0.6333 s**.
- **Any re-export starts from the current glb** (it carries the face/hand work), then run `add_outline_normals.py` LAST; verify: face verts unchanged, images byte-identical, clips 1.0333/0.6333 s, joint count. Backups of every pass are in `assets/raw/backup-*`.
- Loader: `canonBone()` maps Mixamo names to the code's short names (`Spine`→`Spine02`, `Spine2`→`Spine`, …, see `docs/BONES.md`). Base-colour/normal images are decoded by `embeddedImageTexture()` (GLTFLoader texture race) and the base-colour image index is read from the glb JSON — never assume image order; verify texture changes at close zoom. The loader takes the **last** `SkinnedMesh` — never add a second mesh/material to the glb.
- Back swords, the wielded katana (`rig.katana`, `rig.katana2`) and the eye glow are code-built world-space props placed from bone `matrixWorld` each frame. Blade tip is .82 m from G — `hitTest`/trail assume it.
- `m.run()` (motion check) is all PASS as of 2026-10-22. Known open items are listed at the end of each note (`Not done`).

## Client architecture (short — details in `docs/notes/architecture-details.md`)
- Units = metres, height 1.75 m. One-file game `client/index.html`, sections `1) ART … 6) CAMERA`.
- **Colour pipeline pinned to r128 behaviour**: `ColorManagement.enabled=false`, `outputColorSpace=LinearSRGBColorSpace`, `useLegacyLights=true` (removed in r165 — upgrading means retuning lights). Don't flip without comparing screenshots.
- **Two rigs**: a procedural `THREE.Group` rig is an invisible driver; `applySkeleton()` poses it, `driveRealBones()` copies rotation deltas onto the glb bones (`BONE_MAP`, section 3b), legs corrected with `real.corr` (same quaternion for thigh+shin, not the foot), then a ground-snap post-pass. Legs while moving = the glb clips on one shared phase `loco.u` (walk↔run blend) or the video-reference run (`client/rig/reference_run.js`); standing/attacking legs are procedural.
- **Arms are IK, not driver-driven**: `gripPass()` (wrist target from grip point G, reach clamp, elbow swivel search with continuity/`liftCost`/torso `BODY` costs), blade roll `rollToward()`, off-hand slides along the hilt with grab/release hysteresis (`S.gripOn`, `S.twoEff`), `aimHand`/`aimArm`, then fingers (`setFingers`). The sword is glued to the fist after the solve.
- **Poses are parameters**: `IDLE`/`CARRY` = `{hx,hy,hz (chest-local hand), by,el (blade), hipY, hipYaw, chestYaw, lean, step, two, dual, …}`. `COMBO[]`/`ATTACK2`/`DUAL`/`ISSEN` = timelines `keys:[[ms, pose, ease], …]` + `hit`, `chain`, `end`, etc. Every parameter passes through `SOD` (second-order dynamics) — **never replace with plain lerp**.
- Controls: J = 3-beat combo, K = lunging thrust, K K = dual-wield cut, L = finisher 一閃 (delayed hit), Space = blink, Q/E = camera rotate, N = day/night, B = skeleton view, 8 = capture sheet.
- Hit beat = sword-tip velocity starting to drop (`maxSp`, `decel`); hit test = blade segment vs. target axis on XZ. Fixed 4 ms substep `step(T)`. Orthographic iso camera (yaw 45°, pitch 35.26°).
- **Debug**: `window.__iso` exposes `{S, step, frame, stop, press, CAM, rig, GRIP_CFG, GRIP_TUNE, IDLE, CARRY, COMBO, ATTACK2, ISSEN, FIST, …}`; `stop()` then `frame(0,16)` to step deterministically. `THREE` is not a global (borrow constructors from live objects). Tools in `client/debug/` (`motion_check.js`, `ref-overlay.html`, `face-overlay.html`, `run-overlay.html`, `grip_solver.js`, `ring_solver.js`, `thumb_solver.js`, `thumb_landmark_solver.js`, `run-compare.js`, `head-shots.js`) — usage in each file's header and the notes.

## Gotchas that have bitten more than once
- **Browser caches `client/index.html` and `ninja.glb`** (no `Cache-Control`): load `/?v=N` after editing; after replacing the glb `await fetch('/assets/ninja.glb',{cache:'reload'})` then reload. Overlay iframes cache too.
- **A `//` comment appended to a line with more code after it kills the whole module** (many one-line functions) — use `/* */`, and run `node --check` on the extracted module script after every edit.
- Port 8081 is a live-reload dev server: it reloads the page on every save and kills a running test script.
- Don't change `CAM.zoomT/pitchT` before `m.run()` (changes run direction → different numbers). Judge history-sensitive things (first attack after reload, run start in `CARRY`) on **fresh reloads**, not repeated runs in one tab.
- `setFingers` chains joint rotations (joint k = qa1·…·qak) — solvers must store relative rotations.
- Check grips from the gameplay camera AND `/debug/ref-overlay.html` (the user judges the right hand in the BOTTOM view, thumb leftmost) — each view hides different defects.
- Changing the tsuka size means updating `TSUKA_S` and every debug copy of the profile (see `hands-grip.md`).

## Project rules
- **three.js skills** (`.claude/skills/threejs-*`, from CloudAI-X/threejs-skills, see `.claude/skills/README.md`) are written for r186. This project is pinned to `three@0.160.0` with the r128 colour/light pipeline above — when a skill's advice disagrees (WebGPU/TSL, physical light units, colour management, newer addon APIs), these project rules win; check an API exists in 0.160 before using it.
- **The Go side is the sole authority on outcomes** (whether a hit landed, how much health is lost) — never trust values sent by the client.
- Do not commit `.glb/.blend/.fbx` files until `git lfs install` has been run.
- Models from Meshy: record which plan was used to generate them in `docs/CREDITS.md` (free-tier plans = CC BY 4.0, credit required).
- Before declaring something done, run the game and look at the actual result (screenshot or open it in a browser) — not just reading the code.
- **Motion check = definition of done (enforced by a hook, 2026-10-21).** `.claude/settings.json` runs `.claude/hooks/motion_guard.py`. Any Edit/Write to movement code in `client/index.html` (keyword lists in the script), to `client/rig/*.js`, or a Blender MCP script that exports the glb / touches bones, weights or the armature writes `.claude/.motion-dirty` (its mtime = the latest motion change). The Stop hook then refuses to finish until ALL of this exists and is newer than that change: (1) `out/motion-check.json` from `await m.run()` with 0 FAIL (`const m = await import('/debug/motion_check.js?'+Date.now())`; it now also has **per-frame (4 ms) shoulder checks** — shoulder joint speed in the chest bone's frame, clavicle angular speed — and **run sway** checks: torso roll / shoulder-line roll swing while running); (2) `out/motion-views-<mode>.png/.json` from `await m.views({mode})` — the same **8 frames from the front, right, back and left**, with per-frame balance numbers under each frame — for every mode the touched parts need (arms/torso → run + combo, legs → run + stop + walk, sword → combo, rig/skin → run + walk + combo); (3) a Read of each of those PNGs in the session (= actually looked at). Once satisfied the hook deletes the marker itself; a Bash command touching the marker is denied (if an edit really changed no motion, the USER removes it). After 3 blocked stops in a row it lets the session end with a warning. Reload the page (`/?v=<new>`) between `m.run()` and each `m.views()` — they freeze the loop. `m.shoulderTrace({...})` / `m.poseMetrics()` are exported for digging into one scenario. If a limit is changed on purpose, update `LIMITS` and say why. Note: `headRoll` reads ~4.7° even standing (the Head bone is rolled in the bind pose) — judge head tilt relative to idle.
- Work in small steps and explain what changed at each one, since the user is new to this.

## Blender
See `docs/BLENDER_MCP.md` — uses blender-mcp (configured in `.mcp.json`). The user needs to have Blender open and click Connect first. If the blender tools aren't visible, ask the user to check that step (and restart `claude` after approving the MCP server). Read `docs/notes/blender-pitfalls.md` before any edit/export; export recipes for the current model are in `docs/notes/hands-grip.md` ("Rebuilt hands" → Export) and `docs/notes/face.md`. **Render headless (`Blender -b`) — a render through the MCP crashed the user's Blender once.**
