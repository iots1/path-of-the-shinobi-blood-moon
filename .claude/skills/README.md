# Project skills

`threejs-*` — copied unchanged from https://github.com/CloudAI-X/threejs-skills (commit `0e18186`, MIT, see
`THREEJS-SKILLS-LICENSE`) on 2026-10-21. Reviewed before install: markdown only, no scripts; the only commands are
`npx @gltf-transform/cli …` / `npx gltfjsx` examples.

**They target three.js r186. This game is pinned to `three@0.160.0` with an r128-style colour pipeline** (see CLAUDE.md →
"Client architecture"): `ColorManagement.enabled=false`, `LinearSRGBColorSpace` output, `useLegacyLights=true`, WebGLRenderer
only (no WebGPU/TSL, no React). Where a skill's advice needs a newer API or a different colour/light setup, CLAUDE.md wins —
check the API exists in 0.160 before using it.

To update: re-clone the repo and copy `skills/*/SKILL.md` over these folders (review the diff first).
