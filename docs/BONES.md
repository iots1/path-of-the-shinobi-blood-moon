# Bones — `assets/ninja.glb`

Generated from `python3 tools/inspect_glb.py assets/ninja.glb` on 2026-10-18.
Confirmed values, not guesses — this is the real file.

This is the **second** version of the model: a full-body hooded ninja (cloak, hood, face
mask and back-swords all sculpted into the mesh), generated via Meshy's multi-image-to-3D
from `art/reference/cloak/` and rigged through the Meshy API. It replaced an earlier
no-hood body that used Mixamo bone names — **this model uses a different naming
convention entirely**, so don't assume `mixamorig:`-style names.

## Summary
- 1 mesh, 38,329 triangles, 30,771 vertices
- Height (Y-axis bounds, before node scale): 1.750 m — matches the project spec
- 1 skin, 24 joints, **no naming prefix** (not Mixamo — plain names like `Hips`, `LeftArm`)
- **The Armature node has a 0.01 scale** (mesh authored in cm-like units, scaled down to
  meters). This matters: a `Mesh` parented directly as a child of one of these `Bone`
  objects silently fails to render (looks like a frustum-culling quirk interacting with
  the nested scale) — world-space props (eyes, and before them the arms/sword) must be
  positioned every frame via `matrixWorld`, never literally `bone.add(prop)`.
- 1 baked animation (`Armature|clip0|baselayer`, 0.03s — a single rest-pose frame) — unused,
  same as before: all poses are driven by the game's own IK/SOD system.
- Textures: `texture_0` (2048×2048 base color), `texture_0_metallic_roughness` (4096×4096),
  `normal` (2048×2048, unused — the toon material only reads `.map`)

## Bone hierarchy (as in the file)
```
Hips
  Spine02
    Spine01
      Spine
        neck
          Head
            head_end
            headfront           ← extra, a Meshy rig-placement marker (chin point), not a real joint
        LeftShoulder
          LeftArm
            LeftForeArm
              LeftHand
        RightShoulder
          RightArm
            RightForeArm
              RightHand
  LeftUpLeg
    LeftLeg
      LeftFoot
        LeftToeBase
  RightUpLeg
    RightLeg
      RightFoot
        RightToeBase
```
Note the spine order is the **reverse** of the previous model's Mixamo convention:
`Spine02` is closest to the hips, `Spine` (no number) is the top-most one, closest to the neck.

## Mapping: game code (`rig.*` in `client/index.html`) → real bone name

| Game code | Real bone | Notes |
|---|---|---|
| `rig.hips` | `Hips` | direct match |
| `rig.spine` | `Spine02` | bottom-most spine bone |
| `rig.chest` | `Spine` | top-most spine bone — carries the combined torso rotation |
| `rig.neck` | `neck` | direct match |
| `rig.head` | `Head` | direct match |
| `rig.thighL` / `kneeL` / `ankleL` | `LeftUpLeg` / `LeftLeg` / `LeftFoot` | direct match |
| `rig.thighR` / `kneeR` / `ankleR` | `RightUpLeg` / `RightLeg` / `RightFoot` | direct match |
| arm IK shoulder pivot | `LeftArm` / `RightArm` (world position read each frame) | |
| arm IK chain | `LeftArm → LeftForeArm → LeftHand` / `RightArm → RightForeArm → RightHand` | |
| eye glow (code VFX) | positioned from `Head.matrixWorld` each frame, not parented | see note above on why |

**In code:** `BONE_MAP` in `client/index.html` holds this table. `Spine01`, `LeftShoulder` and
`RightShoulder` are not directly driven — they stay at bind pose and just follow their parents.

**Left/right confirmed in the browser:** `RightArm` loads on the -X side as expected, so the
flip-detection check in `loadNinja()` doesn't trigger for this file (kept anyway in case a
future export comes in mirrored).

## Why the hood/cloak code changed
The previous (no-hood) model needed the cloak, hood and back-swords built procedurally in
code and attached to the real `chest`/`head` bones (see git history). This model has all of
that **sculpted into the mesh itself**, so that procedural geometry is now hidden
(`rig.back/cloakRoot/hood/mask.visible = false`) rather than re-homed. Only the eye glow
remains as a code effect, since the model's own eyes are a flat 2D highlight in the source
art that Meshy's 3D reconstruction couldn't reproduce (see project history / HANDOFF).
