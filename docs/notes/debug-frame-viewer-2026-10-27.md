# Full-resolution motion frame viewer — 2026-10-27

The user could not zoom the `mode=powerdraw` diagnostic and suspected distorted frames. Backups of the previous launcher and capture module are in `out/debug-viewer-before/`.

`client/debug/anatomical-game-check.html` now hosts a separate frame inspector (`frame_viewer.js`, `frame_viewer.css`, with the original route/task mapping in `frame_tasks.js`). The diagnostic game renders in a fixed 1920×1080 iframe. `views()` sends full-frame PNG Blobs to the same-origin parent, independently of the existing downsampled contact sheet. The parent validates message origin and source, keeps Blob URLs for the current capture, and revokes them on replacement. No change to the character asset or production attack controller was required.

The inspector provides individual frame/time selection, front/right/back/left views, thumbnails, wheel/button/keyboard zoom, pointer panning, 100% and fit controls, skeleton capture, and download of the selected PNG. Arrow keys change samples; +/− zoom; 0 fits. Browser Ctrl/Meta zoom shortcuts remain available. Opening/closing the skeleton overlay rerenders from a fresh game and retains the selected frame, angle, and zoom. Legacy specialized surface tools retain their embedded game presentation; pure numerical audit modes show their reports.

The previous capture called `frame(0,0)` while changing the game camera's spring values. That still updated camera dynamics and inherited stored focus/pan/shake. `views()` now positions the actual orthographic camera directly for each angle and calls the skin/cloak render preparation and renderer without stepping the pose. It restores the camera, renderer pixel ratio, lunge values and skeleton toggle in `finally`. The existing legacy sheet outputs and filenames remain available.

Frame metadata distinguishes requested sample time (`t`), actual 4 ms simulation time (`simulatedTimeMs`), and attack time (`actionTimeMs`). For this K K scenario the dual attack begins at global 400 ms; global 1000 ms is K K 600 ms. A request at 1950 ms is rendered at the next simulation sample, 1952 ms. The UI shows actual time on the main image. Stage labels come from current DUAL boundaries.

Camera invariance checks compare normalized source-bone local quaternions and positions before and after rendering each angle. Powerdraw's 48 full-resolution images have maximum quaternion numerical difference ~0.0000034° and zero position drift. This verifies capture consistency, not visual anatomical correctness of every pose.

Validation: module syntax checks; browser verification of 100%/wheel zoom, pan, frame and angle selection, keyboard navigation, skeleton capture, overview and PNG download target; fresh numerical motion suite 134 PASS / 0 FAIL. Standard run and combo frame captures also use the new camera path. Unit math suite 7 PASS. Screenshot proof: `out/debug-frame-viewer-zoom.png`.
