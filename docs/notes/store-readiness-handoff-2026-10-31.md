# Ninja asset — store readiness handoff

วันที่: 2026-10-31 (Asia/Bangkok)

## เป้าหมายและขอบเขต

เตรียมตัวละครให้พร้อมเป็นสินทรัพย์ขายแยกจากเกม ก่อนเลือก store ผู้ใช้ยังไม่มีประสบการณ์ขายและต้องการให้เตรียมโมเดลก่อน ยังไม่เผยแพร่สินค้า ไม่อ้างว่าได้รับการรับรองจาก store ใด

แพ็กเป้าหมายเบื้องต้น: Blender authoring scene + GLB portable asset + PBR textures + baked motion clips + README/rig guide + preview renders. FBX/Unity/Unreal integration เป็นขั้นถัดไปเมื่อเลือกกลุ่มลูกค้าและทดสอบจริง

## สภาพงานที่ตรวจพบจริง

- Repo: `/Users/PEEPO/Project/game/path-of-the-shinobi-blood-moon`, branch `feature/new-ninja`, remote `origin` GitHub `iots1/path-of-the-shinobi-blood-moon`.
- Live Blender 5.2.2 LTS เปิด master `blender-ninja/new_ninja_raw_body_cloak_2026-10-25.blend`; มี unsaved changes ตอนเริ่ม ต้องสำรอง live state ก่อนแก้
- Scene `ThreeJS_Rig`: `Ninja_CurrentBody`, 392,678 vertices / 731,584 triangles, 1 material, 1 UV map, scale 1, สูงประมาณ 1.75 m
- `Ninja_ExportRig`: 102 authoring bones, 82 deform bones, root `mixamorig:Hips`; มี anatomical controls/constraints และ twist drivers
- PBR มี base color 4K sRGB, normal 4K Non-Color, packed metallic/roughness 2K Non-Color เชื่อม B→metallic / G→roughness ถูกโครงสร้าง ไม่ควรลด roughness ทั้งตัวโดยไม่มี reference
- Active action `Anatomical_Rig_Validation` frames 1–121 ที่ 30 fps เป็น stress test ไม่ใช่สินค้าท่าต่อสู้ มี Walking/Running หลายเวอร์ชันในไฟล์ ต้องตรวจ slot/target และ duration ก่อนนำมาแพ็ก
- Master มีหลายฉากทดลองและ high-poly cloak 641,566 triangles; ไม่ควรส่งทั้งหมดเป็นไฟล์ลูกค้า
- เกมใช้ `assets/ninja-anatomical-preview.glb`, procedural IK/grip/attacks, hybrid DQ skinning และ runtime accessories; ภาพใน Blender linear skinning จึงไม่รับประกันผลเหมือนเกม
- Latest runtime notes อ้าง 218 PASS / 0 FAIL เมื่อ 2026-10-30; เป็นหลักฐานเดิม ยังไม่ได้รันใหม่ในรอบนี้
- Credits ระบุ body Meshy Pro; แหล่ง concept/ภาพอ้างอิงยังว่าง และ plan ของ cloak ยังไม่ระบุ ต้องหาหลักฐานสิทธิ์แจกจ่าย source model/animations ก่อนขาย ไม่อนุมานจากสิทธิ์ใช้ในเกม
- Add-on protocol 13 / server expected 15; fallback อ่าน scene และรัน Python ได้ ไม่อัปเดต add-on ระหว่างงานโดยไม่จำเป็น

## ลำดับงานและเกณฑ์รับ

### P0 — สำรอง / baseline / จัด authoring scene (เริ่มรอบนี้)

1. Commit/push handoff นี้ก่อนเปลี่ยน Blender ตามคำขอ แยกจาก existing dirty worktree ของผู้ใช้
2. Save-copy live unsaved state ลง `out/store-readiness/` และเก็บ hash ไม่ commit backup ขนาดใหญ่
3. สร้าง scene `Store_Authoring` ใน master เดิม ด้วย body/rig สำเนาอิสระ แยก mesh, armature, material datablocks; คง UV/texture bytes/weights/bind/rest axes และ constraints
4. ตัดฉากทดลองออกจากขอบเขตส่งออกด้วย scene/selection whitelist ไม่ลบ source scene
5. Audit topology, finite data, UV degeneracy, weights (normalization/≤4 influences/unweighted), material/image connections, bone hierarchy, actions และแหล่งข้อมูล
6. วาง baseline report และ script ที่รันซ้ำได้ใน repo; แยกข้อพบจริงจากเป้าหมาย/สิ่งยังไม่ตรวจ

รับเมื่อ: original geometry/UV/weights hashes ไม่เปลี่ยน, copied constraints/drivers ไม่มีการชี้กลับ source rig, image references ยังอยู่, source scene/frame/mode ไม่เสีย และมีภาพตรวจจริงของ candidate

### P1 — Model / surface / LOD

- เก็บ source high-res เป็น LOD0 authoring; ทำ lower-detail candidate บนสำเนาเท่านั้น
- เป้าทดลอง LOD1 ประมาณ 120–180k triangles และ game LOD ประมาณ 40–80k (เป็นงบภายใน ไม่ใช่ข้อกำหนด store); ปรับตาม silhouette และ deformation จริง
- ป้องกัน face/fingers/cloth hems; ไม่ apply global decimate เป็น final โดยอัตโนมัติ เริ่ม modifier preview ที่ปิดไว้ตามปกติ
- ตรวจ connected seams ก่อน weld; UV-split vertices อาจตั้งใจอยู่ ห้าม merge ทั้งตัว
- Retopology/rebake ต้อง transfer UV/normal/weights แล้วเทียบภาพ head/hands/shoulders/elbows/knees ระยะใกล้กับทุกมุม บันทึกความต่างและ triangle count จริง
- สร้าง texture files ตั้งชื่อชัดเจน, packed channels อธิบายใน README, normal convention ระบุและทดสอบ; ตรวจ texel density/UV overlap แบบตั้งใจ/normal-map seams
- หากแก้ fit ของ cloak/mask ใช้ `.claude/skills/blender-preserve-surface/SKILL.md`; แยก fitting จาก optimization

### P2 — Rig portability / deformation

- รักษา 82 deform skeleton และ bind transforms; แยก authoring controls กับ export skeleton
- เพิ่ม usable full-body controls/foot IK/root control เมื่อเห็น workflow ที่ต้องการชัด; ไม่ตั้งชื่อ retarget เป็น Humanoid compatibility โดยยังไม่ทดสอบ
- ทำ pose suite: rest, shoulder raise, elbow 90/130°, forearm twist ±, wrist, fist/grip, hip/knee crouch, ankle และ body turn
- แก้ cloth volume collapse ด้วย weights/correctives ตามผลจริง; ตรวจ linear skinning ที่ใช้ได้ข้าม renderer ไม่อาศัยเฉพาะ shader เกม
- ตรวจ finite/normalized weights, ≤4 influences ตาม export target, no orphan groups, rest/bind invariants; ถ้าเปลี่ยน rig/weights ต้องรัน rig checker + fresh game motion suite และดู run/walk/combo sheets ตาม CLAUDE.md

### P3 — Motion ที่ลูกค้าใช้ได้เอง

- กำหนด manifest ทุก clip: name, fps, start/end, duration, looping, in-place/root motion, required props และ provenance
- Baseline pack ที่วางแผน: idle, walk, run, stop, J1/J2/J3, thrust K, dual draw/cut/sheath K K, finisher L; ยังไม่อ้างว่า clips เหล่านี้ bake แล้ว
- Capture final evaluated runtime transforms ที่ 30/60 fps แล้ว bake deform skeleton, fingers, sword sockets และ cloak; รวม blade/grip constraints ให้ motion เล่นได้โดยไม่มี JS solver
- แยก stress-test animation จาก production clips; ตรวจ loop seam quaternion/translation, root drift, foot sliding/contact, left-hand hilt gaps, sword cutting plane และ transitions
- คงเวลาของ Walking/Running จาก GLB source (1.0333/0.6333 s) อย่า resample ด้วย scene fps จนความเร็วเปลี่ยน
- ทดสอบ import ใน clean Blender scene และ Three.js viewer โดยไม่โหลด game controllers แล้วเทียบ contact sheets กับ runtime

### P4 — Accessory pack

- Body-only เป็นฐาน, cloak/mask/swords เป็น optional objects พร้อม sockets; runtime props ยังไม่ถือว่าอยู่ใน Blender asset
- ตรวจ bare / cloak / mask / combined ใน idle และทุก action ทุกมุม พร้อม close-up ริมผ้า
- Cloth simulation ถ้ามีต้อง bake หรือมี bone fallback; ไม่บังคับให้ลูกค้ารัน simulation เพื่อเห็นภาพตาม listing

### P5 — Packaging / release gate

- Export เฉพาะ deliverable collection, pack/copy textures, relative paths; ไม่มี debug scenes/cameras/test actions ในไฟล์ลูกค้า
- GLB round-trip: hierarchy, bind matrices, clip durations, normals/tangents, UVs, materials, bounds, texture bytes; clean import ไม่มี missing assets
- ทำ beauty turnaround + wireframe + rig-controls preview + animation demo จากไฟล์ที่ส่งจริง (render headless ตาม repo rule)
- README ระบุ poly/tri count แต่ละ LOD, bone counts, texture sizes/channels, units/facing, supported Blender version ที่ทดสอบ, clip list, import steps และ known limitations
- เก็บ asset-specific provenance/license evidence; ข้อมูลที่ยังไม่ยืนยันเป็น release blocker ไม่ลบคำเตือนเพื่อประกาศพร้อมขาย
- เลือก store หลัง technical pack พร้อม แล้วค่อยเทียบข้อกำหนดปัจจุบันของ store นั้น ไม่เผยแพร่ระหว่างเตรียม

## ความเสี่ยง / ห้าม regress

- Repo เริ่มต้นมี modified CLAUDE.md, client/index.html, debug/rig code และ untracked wrist/plant files; ไม่ stage/commit/reset งานเหล่านั้น
- ทุก binary commit ต้อง `git lfs install` ก่อน (มี .gitattributes อยู่แล้ว); สำรอง out/ ไม่เข้ากิต
- ใช้ master เดียวตาม repo rule; store scene เป็น derivative ภายใน master ไม่สร้าง dated master เพิ่ม
- Existing tools/export_anatomical_rig.py มี assertion geometry แบบเก่า ไม่ใช่ exporter สำหรับ fitted current body; ดู notes elbow/shoulder และ sleeve refinement ก่อน export
- ไม่อ้าง clinical correctness/physical weight transfer จาก proxy metrics; left-hand support gaps และ extreme cloth distortion ยังเป็น open items

## Resume checklist

อ่านเอกสารนี้ + CLAUDE.md + latest area notes → ตรวจ git status/live dirty → ตรวจ `out/store-readiness/` reports และ source hashes → ทำทีละ P ตาม gate → อัปเดตส่วน progress ด้านล่างด้วยผลที่ตรวจจริง

## Progress

- Handoff prepared from live scene and repository audit; implementation follows after handoff commit/push.
- รอบนี้ตั้งใจทำ P0 และ reversible P1 preview เท่านั้น ไม่ถือว่าโมเดลพร้อมวางขายแล้ว
