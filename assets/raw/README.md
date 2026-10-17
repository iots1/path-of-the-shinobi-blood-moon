# Model versions

Every model Meshy produced for this project, kept so nothing has to be regenerated (or paid for) again.
Meshy API task links expire after a few days, and tasks made through the API/MCP never show up in the
Meshy web app — this folder is the only lasting copy. The live in-game files are `assets/ninja.glb`
and `assets/anim/*.glb`.

| File | What it is | Meshy task | Credits |
|---|---|---|---|
| `2026-10-17_nohood-v1_rigged-mixamo.glb` | First character: no hood, rigged with Mixamo bone names (`mixamorig:*`). Made on the Meshy website. Replaced by v2. | (web app) | — |
| `2026-10-18_hood-v2_1-generated.glb` | Hooded full body, straight out of multi-image-to-3D (meshy-7.1, from `art/reference/cloak/`). 814k triangles, unrigged. | `01a14b0d-933b-7196-94f3-08eff92a0a96` | 30 |
| `2026-10-18_hood-v2_2-remesh-20k-quad.glb` | The above, remeshed to ~20k quads. Unrigged; this is what got rigged. | `01a14b11-9240-7400-8e5e-0ff0578d5574` | 5 |
| `../ninja.glb` | The above, rigged (24 bones, no name prefix, Armature scale 0.01). **In use.** | `01a14b18-2c2d-7369-a569-3e53ac33565f` | 5 |
| `../anim/run.glb`, `../anim/walk.glb` | The free running/walking clips from that rig task — skeleton + clip only (no character mesh), in place (no root motion). Run 0.667 s/cycle, walk 1.067 s/cycle. **In use** (legs only, blended by speed). | same rig task | free |

Not kept: a `retexture` attempt (task `01a14b15-556d-741b-84ae-77088912492b`, 10 credits) that tried to add
eyes through a text prompt — it changed unrelated parts of the outfit and still had no eyes.
