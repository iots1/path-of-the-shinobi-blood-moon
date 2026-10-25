# Cloak implementation in this repository

Read this when applying the skill to the ninja cloak. These values describe this asset, not universal cloth-fitting settings. Read the current files because runtime collision and other accessories may have changed since the original fitting work.

## Maintained files

Paths below are relative to the repository root:

- `tools/prepare_cloak.py`: Blender fitting field, source-normal transport, independent accessory rig and export. It executes against the live Blender project and replaces its own fitted cloak/rig objects; inspect it before running.
- `assets/cloak.glb`: untouched supplied source.
- `assets/cloak-fitted.glb`: full-resolution fitted runtime derivative.
- `client/equipment/cloak.js`: runtime skinning, material and any current collision deformation. Inspect this when an artifact appears only in the game or in movement.
- `client/debug/cloak_check.js`: sampled fit checks; read its current probe locations, pose handling and limits before interpreting its output.
- `docs/notes/architecture-details.md`: chronological findings, including failed fitting approaches and subsequent runtime changes.
- `docs/notes/blender-pitfalls.md` and `docs/BLENDER_MCP.md`: project-specific Blender/export constraints.
- `blender-ninja/new_ninja_raw_body_rigged_rebuilt_hands_2026-10-23.blend`: existing master; keep normal version backups enabled when saving.

## What preserved the source appearance

The source and derivative retain 351,097 exported vertices and 641,566 triangles. The three embedded source images were retained byte-for-byte; export may reorder them. The folded hem is original geometry, not a painted replacement.

The fitted duplicate starts with applied Blender XYZ scale `(.51, .60, .52)` and translation `(0, .015, 1.047)`. Blender Z is height and +Y is rear; in the game, Y is height and -Z is rear. The script's fitting/normal calculations use the applied Blender coordinate system.

`raw_fit()` defines the measured large-form target. The implementation samples its displacement on a 20-mm grid with 100-mm padding, runs six separable `[.25, .5, .25]` smoothing passes, and samples with cubic B-splines. Original dense positions are moved through that field; the source mesh itself is not smoothed. The analytic sampling derivatives provide the deformation Jacobian.

Source custom corner normals are captured before fitting. The inverse-transpose Jacobian for each corner's vertex transports those normals. `normals_split_custom_set()` installs the transported normals; glTF export regenerates tangents. Export is scoped with **both** `use_selection=True` and `use_active_scene=True` so selected ninja objects in other scenes do not leak into the accessory GLB.

The script tries full displacement, then reduces strength by `.9` steps while the sampled determinant minimum is below `.15` and the strength remains above `.2`. Its final hard assertion is `min(det(J)) > .05`; these are distinct checks. A tested fit used strength `.81` and minimum determinant about `.152`, with no non-positive sampled determinants. Check the actual script/output rather than assuming that value still holds. This is neither a global collision proof nor a bound on anisotropic texture stretch.

## Failures to avoid repeating

- Compressing rear depth point by point flattened source fold relief and stretched the weave.
- Per-vertex nearest-body projection imprinted shirt creases or created irregular bulges.
- A tight shoulder envelope and narrow height transitions made bands or inverted local patches. Smoothing the displacement field, with a Jacobian check, addressed this mechanism.
- Recomputing only geometric normals did not restore the source scan's shading. Keeping unchanged normals after deformation was also wrong.
- Moving the collar inward/upward to hide a tiny shirt breakthrough brought the hem into the jaw. Measure the actual contact and keep face clearance separate from nape/shoulder fitting.
- Body/cloth root-local coordinates are not necessarily the original source coordinates. One right hem contact near game `(-.22, 1.34, -.004)` mapped back near applied source Blender `(-.186, -.135, 1.320)`. Targeting the correction at the wrong source depth missed it. Use the source↔fitted vertex correspondence when locating a correction.

## Validation and reporting

Keep the source/derived image hashes, mesh counts and UV/material bindings consistent. Inspect macro weave and the continuous stitched edge, with the cloak both on and off as needed.

The development fit check is invoked on a **fresh loaded game** after the cloak is ready:

```javascript
const c = await import('/debug/cloak_check.js?' + Date.now());
await c.run();
```

It saves `out/cloak-fit-check.json` and freezes/steps the game. Reload before another motion scenario. Read current tests before citing their coverage: rear torso and hilt checks do not cover all sleeves, and lateral arm-edge probes should sample the portion actually covered by the asymmetric hem. A ray below the hem may hit cloth on the far side of the body; that is not a valid local clearance measurement. CPU skinning/raycast results may omit GPU-only collision or volume corrections.

Follow `CLAUDE.md` for `m.run()` and fresh-load `m.views()` requirements after exports/rig changes. Open the required run/walk/combo sheets, plus dual when relevant. Close-up previews alone are not sufficient to declare all movement intersections solved. Report only the poses, points and views actually checked.
