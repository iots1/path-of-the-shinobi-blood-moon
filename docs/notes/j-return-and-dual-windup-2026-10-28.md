# J recovery and K K primary-arm wind-up — 2026-10-28

Continues the neutral RoM audit. Verified runtime `anatomy-20261028-v21` (final validation completed 2026-10-30). The original local sword grips and fingers are retained. No Blender, GLB, topology, UV, texture, weight or normal changes were made in this pass. Baselines: `out/rom-neutral-before/` and `out/j-return-before/` (including the pre-recovery v13 index and pre-wind-up v19 index).

## J shoulder and elbow recovery

The reported standing defect was reproducible in the controller. Its near-straight elbow swivel, blade roll and maximum-ever hand reach could settle into a different solution after J. Changing only the mesh would conceal the pose problem.

`client/rig/rest_return.js` caches an actual standing reference before the first attack: chest-relative upper-arm rotation, the perpendicular elbow pole, blade roll and right palm reach. Recovery uses the existing IK and second-order pose dynamics, with eased reference preferences. A full elbow direction is not a stable pole near extension; `neutralPole()` uses the perpendicular residual relative to shoulder→wrist. `returnReach()` permits a soft elbow fold during recovery and restores the same final standing reach. The source support-elbow correction eases out while the rest controller is active.

The upper-roll controller parallel-transports the saved axial reference onto the current upper-arm direction and counter-rotates the forearm to preserve the downstream chain. Its preference is gated below horizontal to avoid the ambiguous overhead swing branch. The left preference is suppressed while the hand supports the sword; a free-hand target adjustment never independently moves a fully held grip. Do not restore blade roll to zero: the actual standing roll is nonzero and must be measured.

`j_return_check.js` traces single J, J J, J J J and repeated single J at 4 ms through 10 seconds. Before correction, the single-J right upper arm remained about 9.9° from its fresh standing orientation. The v19 candidate returned both sides within 0.55° across those four cases. The transient chest-forward elbow-bend projection can be negative during a cross-body return; it is not by itself proof of anatomical hyperextension. Use the actual elbow geometry, source-frame measurements and rendered sleeve/shoulder views together.

## K K right wind-up

The primary hand now moves farther out and lifts the sword before the downward cut. `DUAL.rightKeys` enters through `dualRightTimeline()` before the ordinary SOD filters, overriding only the right-hand and right-blade targets. The main left/body keys and existing grip solve remain authoritative. The right wind-up leads the left full-spread phase slightly, allowing the bounded arm/wrist controller to rotate the sword down before recovery. Moving a large right wind-up to the old late peak left quick/run cuts pointing upward at their lowest hand position; that candidate was rejected.

Measured v19 candidate, quick/delayed/from-run: palm approximately 31–32 cm outboard of its shoulder, raised blade about 56–57° above horizontal, then roughly 20 cm hand descent with the blade pointing about 44–46° below horizontal. The original local right grip error was zero in those traces. `dual_windup_check.js` keeps these actual rendered-bone measurements and every 4 ms sample; the motion suite checks wind-up extent, downward cut and retained grip separately.

Saya extraction now ends at 1070 ms (40 ms later), retaining the 85 mm pull target. This gives the existing bounded left solver time to meet the original extraction-distance check when entering from a run. During K release only, the free left swivel rate eases to 250°/s instead of 500°/s; support while fully holding the hilt is unchanged. This addresses the isolated release elbow-speed spike without increasing the audit tolerance.

## Validation and limitations

The motion suite now includes J standing-return comparisons and right wind-up/downward-cut/grip guards in addition to the original regression, per-frame K K audit, full-body RoM trace and running two-hand contact checks. Final numerical and visual results are recorded below after execution. Fresh captures must match the final runtime revision.

The clinical reference flags described in `neutral-rom-audit-2026-10-28.md` remain visible. Passing game regression is not medical certification of every upper-limb proxy, particularly source elbow off-plane and virtual forearm pronation.

Debug routes: `?mode=jreturnview&bones=1` (J recovery), `?mode=dualwindup&bones=1` (right wind-up), `?mode=liftcheck&bones=1` (left reach), and `?mode=romsaved&revision=<runtime>` (last full-body report).

## Final validation — 2026-10-30

- Fresh v21 `out/motion-check.json`: **181 PASS / 0 FAIL**. Joint audit: zero violations in quick-repeat, delayed and run-entry at 4 ms; retained original tolerances. Maximum elbow speeds in the suite were approximately 5.81, 5.67 and 4.24 m/s respectively.
- J / J J / J J J / repeated J: both upper arms returned within **0.54°** of their fresh standing reference.
- Quick / delayed / running K K: right palm 31.4–32.0 cm outboard of the shoulder; hand descends 20.0–20.3 cm; blade points down at the end of the cut; exact original right local grip retained in the trace.
- Fresh final-revision run, walk, combo and stop PNG+JSON sheets reviewed in all four views. Final left-lift capture reviewed at 20 ms intervals from global 400–1000 ms, 31 poses × four directions, using the saved enlarged grids `out/left-lift-review-v21-*.png`. Final right-wind-up (40 images) and J recovery (48 images) sheets reviewed. Full-frame pose drift across camera views is below 0.000004° and position drift is zero.
- Saved browser proof: `out/kk-windup-verified-v21.png` (100% zoom, 1700 ms / K K action 1300 ms).
- Thirteen pure math tests passed; module syntax checks passed before final runtime validation.

Remaining work is explicit: virtual forearm pronation and shoulder axial coordinates are not clinically calibrated; legacy supporting-arm hinge-plane flags persist during cross-body J poses; some wrist deviation approaches the existing game limit (about 40°) and exceeds the stricter reference envelope. These flags were not suppressed and are not counted as clinical passes by the motion suite. No claim is made that every rendered frame is anatomically correct.
