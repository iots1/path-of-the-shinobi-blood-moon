# Codex setup (2026-10-20)

Blender MCP is registered globally in `~/.codex/config.toml` as `blender`:

```toml
[mcp_servers.blender]
command = "/Users/PEEPO/.local/bin/uvx"
args = ["--offline", "mcp-for-blender"]
```

Blender's add-on listens on `127.0.0.1:9876`. A real MCP initialize, tool listing,
`get_scene_info`, and `execute_blender_code` succeeded. New MCP configuration may
require reopening Codex or starting a new chat before native Blender tools appear.
The running add-on reports protocol 13; the cached server expects 14. These tested
commands work through its compatibility fallback; the add-on was not replaced.

`tools/build_run_v2.py` runs inside Blender via `execute_blender_code` and creates
`assets/anim/run-v2.glb` without modifying the open scene. See `docs/RUN_V2.md`.

# Working with Blender via Claude CLI

## Setup (one-time)

1. Install `uv`: `brew install uv`
2. The `.mcp.json` file at the project root is already configured. The first time you open Claude CLI, it will ask whether to allow the `blender` MCP server — approve it.
   (Or add it manually with `claude mcp add blender uvx blender-mcp`)
3. Download `addon.py` from the blender-mcp GitHub repo (ahujasid/blender-mcp)
4. In Blender → Edit → Preferences → Add-ons → install from the `addon.py` file → enable "Interface: Blender MCP"
5. In the 3D viewport, press `N` to open the side panel → BlenderMCP tab → click Connect

## Every time you use it

1. Open Blender → Connect (step 5 above)
2. Open a terminal at the project root → `claude`
3. If the connection succeeds, Claude will see a tool called `blender`

## Prompt for sculpting a character from scratch (not relying on Meshy)

```
art/reference/ninja-sword/ contains ninja_sword_front.png, ninja_sword_side.png, ninja_sword_back.png (T-pose, 1.75 m tall)
Help me build the character in Blender via MCP as follows:
1. Place the front and side reference images as viewport backgrounds, scaled so the ground is at Z=0 and the head is at Z=1.75
2. Sculpt a low-poly ninja character in separate pieces: head with face covering, kimono torso, sleeves, hakama pants, leg wraps, shoes — use Bevel to soften edges
3. Add a humanoid Armature (hips, spine, chest, neck, head, arms, legs, hands) and apply Automatic Weights
4. Take viewport screenshots from front, side, and back after finishing each part, and compare against the reference before moving to the next part
5. Test deformation: rotate the arms, legs, and waist, and fix any areas where the mesh collapses
6. Export as assets/ninja.glb (check Skinning) — do not include a sword
```

## Prompt for cleaning up a model from Meshy

```
Import assets/ninja.glb into Blender and check:
1. Character height is about 1.75 m, and Apply All Transforms
2. If polygon count exceeds 30,000, reduce it with Decimate or QuadriFlow to about 20,000 without distorting the fingers and leg wraps
3. Test rotating the arms, legs, and waist; report any areas where the mesh collapses or tears
4. Downscale textures to 1024x1024
5. Export over assets/ninja.glb (check Skinning)
6. Write the full list of bone names to docs/BONES.md
```
