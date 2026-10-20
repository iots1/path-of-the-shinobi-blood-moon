# Model versions

Current locomotion (2026-10-20): `assets/anim/run-v2.glb:RunningV2` supplies running legs; walking uses `assets/ninja.glb:Walking`. The embedded `Running` is a fallback. Tables below describe historical versions; the old `backup-hood-v2-2026-10-18/anim/run.glb` is not loaded. See `docs/RUN_V2.md`.

Every model Meshy produced for this project, kept so nothing has to be regenerated (or paid for) again.
Meshy API task links expire after a few days, and tasks made through the API/MCP never show up in the
Meshy web app — this folder is the only lasting copy. The live in-game file is `assets/ninja.glb` (the 2026-10-19 "no-hood ninja"; it carries its own Walking/Running clips).
The previous hooded/masked model (2026-10-18) + that day's client code is in `backup-hood-v2-2026-10-19/`. The hooded model before that (2026-10-18 swap) + its `anim/` clips, client code and uncommitted diff of that day is in `backup-hood-v2-2026-10-18/`.

| File | What it is | Meshy task | Credits |
|---|---|---|---|
| `2026-10-17_nohood-v1_rigged-mixamo.glb` | First character: no hood, rigged with Mixamo bone names (`mixamorig:*`). Made on the Meshy website. Replaced by v2. | (web app) | — |
| `2026-10-18_hood-v2_1-generated.glb` | Hooded full body, straight out of multi-image-to-3D (meshy-7.1, from `art/reference/cloak/`). 814k triangles, unrigged. | `01a14b0d-933b-7196-94f3-08eff92a0a96` | 30 |
| `2026-10-18_hood-v2_2-remesh-20k-quad.glb` | The above, remeshed to ~20k quads. Unrigged; this is what got rigged. | `01a14b11-9240-7400-8e5e-0ff0578d5574` | 5 |
| `../ninja.glb` | The above, rigged (24 bones, no name prefix, Armature scale 0.01). **In use.** | `01a14b18-2c2d-7369-a569-3e53ac33565f` | 5 |
| `../anim/run.glb`, `../anim/walk.glb` | The free running/walking clips from that rig task — skeleton + clip only (no character mesh), in place (no root motion). Run 0.667 s/cycle, walk 1.067 s/cycle. **In use** (legs only, blended by speed). | same rig task | free |

Not kept: a `retexture` attempt (task `01a14b15-556d-741b-84ae-77088912492b`, 10 credits) that tried to add
eyes through a text prompt — it changed unrelated parts of the outfit and still had no eyes.

## 2026-10-18 swap to the new ninja
| File | What it is |
|---|---|
| `../ninja.glb` | `Meshy_AI_Ninja_Remeshed_for_Ri_All_Animations.glb` from `blender-ninja/new_ninja_original/`: cloaked, hooded, face-masked ninja, remeshed (10,260 tris), Mixamo rig (66 bones with fingers), 1.75 m, metres, 2 animation clips `Running` 0.67 s + `Walking` 1.04 s. **In use.** |
| `backup-hood-v2-2026-10-18/` | The previous `ninja.glb`, `anim/walk.glb` + `run.glb`, the `client/index.html` and `client/debug/motion_check.js` of that day, plus `uncommitted-changes.patch` (working-tree diff vs HEAD). Everything needed to go back. |

Still only in `blender-ninja/new_ninja_original/` (outside the repo): the unrigged sources of the new ninja — `…_1018162359_texture.glb` (remeshed + textured, what got rigged), `…_1018162236_image-to-3d-texture.glb` (756k-tri textured original) and `…_1018162326_generate.glb` (untextured companion). Meshy task IDs/credits for them are not recorded here.

## 2026-10-19 swap to the no-hood ninja
| File | What it is |
|---|---|
| `../ninja.glb` | `Meshy_AI_Unmasked_Male_Ninja_T_All_Animations.glb` from `blender-ninja/new_ninja_no_hood/`: unmasked (visible face, no hood/cloak), Mixamo rig (28 bones, no fingers), 18,887 tris, 1.75 m, metres, no Armature scale, 2 animation clips `Running` 0.63 s + `Walking` 1.03 s. **In use.** |
| `backup-hood-v2-2026-10-19/` | The previous (2026-10-18) `ninja.glb`, `client/index.html` and `client/debug/motion_check.js` as they were right before this swap. Everything needed to go back. |

Still only in `blender-ninja/new_ninja_no_hood/` (outside the repo): the unrigged sources — `…_1019103506_generate.glb` (750k-tri untextured generate), `…_1019103458_image-to-3d-texture.glb` (750k-tri textured original) and `…_1019104746_image-to-3d-texture.glb` (18,887-tri remeshed + textured, what got rigged). Meshy task IDs/credits not recorded here.
