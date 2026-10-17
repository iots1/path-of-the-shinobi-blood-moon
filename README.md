# Path of the Shinobi: Blood Moon

An ink-brush-style isometric action game. The protagonist is a ninja in a black hood, with a 3-beat slash combo (一 二 三).

Client: Three.js · Server: Go · Art: Blender + Meshy

## Running the game

```bash
cd server
go run .
# open http://localhost:8080
```

No Go? You can still run it this way (view-only, no server logic):

```bash
cd client && python3 -m http.server 8000
```

> Always run it through a server — don't double-click the file open. Browsers block `fetch` from `file://` when loading `.glb` files.

An internet connection is required too, since Three.js and fonts load from a CDN.

## Controls

| Key | Action |
|---|---|
| `W A S D` / click ground | Run |
| `Shift` (held) | Walk instead of run |
| `J` / `Space` | Slash (press repeatedly = 3-beat combo) |
| `Q` `E` | Rotate camera 90° |
| `R` `F` | High / low camera angle |
| Click-drag (or right-click drag), scroll wheel | Free rotate, zoom |
| `B` | Show skeleton |
| `T` | Slow-mo |

## Structure

```
client/            The game (index.html is the single file with everything)
client/legacy/     Earlier 2D prototype (kept for reference)
server/            Go dev server
art/reference/     Character reference images (T-pose front/side/back)
art/blender/       .blend files and scripts
assets/            .glb files the game actually loads
docs/              Notes
CLAUDE.md          Project context for Claude CLI
```

## First-time setup

```bash
brew install git-lfs go uv     # if not already installed
git lfs install                # required before committing .glb/.blend files
```

Working with Blender via Claude CLI: see `docs/BLENDER_MCP.md`

## Credits

See `docs/CREDITS.md`
