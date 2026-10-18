# Character: ninja

One character, many avatars. `character.json` holds what is shared (units, facing, skeleton, animations).
Each folder in `avatars/` is one skin/model with its own `avatar.json`:

- `model`   — path of the glb relative to the repo root
- `heightM` — height the model was rigged at (keep 1.75 so poses/IK stay valid)
- `scale`   — in-game multiplier on top of heightM (change this to make an avatar bigger/smaller; never re-rig for size)

Avatars must share the bone names in `docs/BONES.md`, otherwise `BONE_MAP` in client/index.html needs a per-avatar map.
The client does not read these json files yet (it still loads `assets/ninja.glb`); they are the plan for the avatar switcher.
