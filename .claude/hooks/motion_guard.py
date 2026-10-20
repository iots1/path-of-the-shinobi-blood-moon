#!/usr/bin/env python3
"""Motion guard for Claude Code -- enforces the project's definition of done for motion / rig changes.

post (PostToolUse Edit|Write|MultiEdit|mcp__blender__execute_blender_code):
      an edit to movement code in client/index.html, to client/rig/*.js, or a Blender script that exports the glb / touches the
      armature, records the touched parts in .claude/.motion-dirty (its mtime = time of the latest motion change).
pre  (PreToolUse Bash): refuses commands that delete/overwrite the marker -- only this hook clears it, once the evidence exists.
stop (Stop): while the marker exists, blocks finishing until ALL of this exists and is newer than the marker:
      * out/motion-check.json   written by m.run(), with 0 FAIL (it includes the per-frame shoulder / sway checks)
      * out/motion-views-<mode>.json + .png for every required mode, written by m.views(): 8 frames x front/right/back/left
      * a Read of every one of those PNGs in this session's transcript (= the images were actually looked at)
      then it removes the marker itself.
"""
import datetime, json, os, re, sys

ROOT = os.environ.get("CLAUDE_PROJECT_DIR") or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MARK = os.path.join(ROOT, ".claude", ".motion-dirty")
COUNT = os.path.join(ROOT, ".claude", ".motion-stop-count")
OUT = os.path.join(ROOT, "out")
ANGLES = {"front", "right", "back", "left"}
MIN_FRAMES = 8

PARTS = {
    "arms / hands / grip": r"gripPass|aimHand|aimArm|solveIK|rollToward|clampRoll|GRIP_TUNE|GRIP_CFG|makeGrip|wristFor|twoEff|gripOn|rho\b|swivel|eRel|haPrev|hang\b|pole[RLH]?\b|\bhx\b|\bhy\b|\bhz\b|real\.arm|FIST|setFingers|RUN_ARM|RUN_FREE|RUN_HOLD|wristPitch|wristYaw",
    "legs / feet / locomotion": r"thigh|knee|ankle|\bloco|locoPose|calibrateClip|walkAmt|walkPhase|spread|CADENCE|RUN_SPEED|WALK_SPEED|real\.ground|real\.corr|UpLeg|ToeBase|RUN_V2",
    "torso / hips / shoulders": r"\bhips\b|\bchest\b|\bspine\b|\blean\b|hipYaw|chestYaw|hipY\b|RUN_LEAN|RUN_TUNE|runPitch|headYaw|breathe|SHOULDER|shAx|Shoulder",
    "sword / slashes": r"COMBO|\bIDLE\b|CARRY|katana|\bby\b|\bel\b|timeline|EASE|setDyn|\bDYN\b|SOD|hitTest|impactMin|lunge|kHit|S\.edge",
}
RIG = "rig / skin (Blender or skinning code)"
# which m.views() modes prove each part
MODES = {
    "arms / hands / grip": ["run", "combo"],
    "legs / feet / locomotion": ["run", "stop", "walk"],
    "torso / hips / shoulders": ["run", "combo"],
    "sword / slashes": ["combo"],
    RIG: ["run", "walk", "combo"],
}
BLENDER_RX = r"export_scene\.gltf|armature|pose\.bones|edit_bones|vertex_groups|\.weight|bone"


def read_marker():
    try:
        with open(MARK) as f:
            return [l.strip() for l in f if l.strip()]
    except FileNotFoundError:
        return None


def mark(parts):
    have = read_marker() or []
    merged = have + [p for p in parts if p not in have]
    with open(MARK, "w") as f:   # rewriting bumps the mtime: evidence must be newer than the LATEST motion change
        f.write("\n".join(merged) + "\n")
    try:
        os.remove(COUNT)
    except FileNotFoundError:
        pass
    return merged


def post(data):
    ti = data.get("tool_input") or {}
    tool = data.get("tool_name") or ""
    if tool.startswith("mcp__blender__"):
        code = ti.get("code") or ""
        if re.search(BLENDER_RX, code, re.I):
            parts = mark([RIG])
            emit_post("Blender rig/skin script ran (" + ", ".join(parts) + ").")
        return
    path = (ti.get("file_path") or (data.get("tool_response") or {}).get("filePath") or "").replace("\\", "/")
    if "/client/rig/" in path and path.endswith(".js"):
        emit_post("Skinning code changed (" + ", ".join(mark([RIG])) + ").")
        return
    if not path.endswith("client/index.html"):
        return
    chunks = [ti.get("old_string", ""), ti.get("new_string", ""), ti.get("content", "")]
    chunks += [e.get("old_string", "") + "\n" + e.get("new_string", "") for e in ti.get("edits", []) or []]
    text = "\n".join(chunks)
    parts = [p for p, rx in PARTS.items() if re.search(rx, text)]
    if parts:
        emit_post("Motion code changed (" + ", ".join(mark(parts)) + ").")


def emit_post(what):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext":
        what + " Definition of done before finishing: m.run() with 0 FAIL, then m.views() for every required mode "
        "(8 frames x front/right/back/left) and open each out/motion-views-<mode>.png with the Read tool. "
        "The Stop hook checks all of it and clears the marker itself."}}))


def pre(data):
    cmd = (data.get("tool_input") or {}).get("command") or ""
    # only commands that would delete / move / overwrite a marker (mentioning the name, e.g. in .gitignore text, is fine)
    if re.search(r"(\brm\b|\bmv\b|\bunlink\b|\btruncate\b|\bcp\b|\btouch\b|\bsed\s+-i|\btee\b|>)[^;&|\n]*\.motion-(dirty|stop-count)", cmd):
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
            "permissionDecisionReason": "The motion marker is cleared only by the Stop hook once the evidence exists "
            "(m.run() 0 FAIL + m.views() 4 angles x 8 frames for each required mode, PNGs opened). If the edit really did not "
            "change motion, ask the user to remove .claude/.motion-dirty themselves."}}))


def mtime(p):
    try:
        return os.path.getmtime(p)
    except OSError:
        return None


def read_pngs_seen(transcript, since):
    """file paths of every PNG opened with the Read tool after `since` (epoch seconds)."""
    seen = set()
    if not transcript or not os.path.exists(transcript):
        return seen
    with open(transcript, encoding="utf-8", errors="replace") as f:
        for line in f:
            if '"Read"' not in line or ".png" not in line:
                continue
            try:
                e = json.loads(line)
            except ValueError:
                continue
            ts = e.get("timestamp")
            try:
                t = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp() if ts else None
            except ValueError:
                t = None
            if t is not None and t < since:
                continue
            content = (e.get("message") or {}).get("content")
            for c in content if isinstance(content, list) else []:
                if isinstance(c, dict) and c.get("type") == "tool_use" and c.get("name") == "Read":
                    fp = (c.get("input") or {}).get("file_path") or ""
                    if fp.endswith(".png"):
                        seen.add(os.path.normpath(fp))
    return seen


def missing_evidence(parts, transcript):
    since = mtime(MARK) or 0
    miss = []
    rep = os.path.join(OUT, "motion-check.json")
    if (mtime(rep) or 0) < since:
        miss.append("out/motion-check.json is missing or older than the last motion change -> run m.run()")
    else:
        try:
            with open(rep) as f:
                r = json.load(f)
            if r.get("fail", 1):
                miss.append("m.run() still has %s FAIL: %s -> fix them (or change a LIMIT on purpose and say why)" % (r.get("fail"), ", ".join(r.get("failed", []))))
        except (OSError, ValueError):
            miss.append("out/motion-check.json is unreadable -> run m.run() again")
    modes = []
    for p in parts:
        for m in MODES.get(p, ["run", "combo"]):
            if m not in modes:
                modes.append(m)
    seen = read_pngs_seen(transcript, since)
    for m in modes:
        js, png = os.path.join(OUT, "motion-views-%s.json" % m), os.path.join(OUT, "motion-views-%s.png" % m)
        if (mtime(js) or 0) < since or (mtime(png) or 0) < since:
            miss.append("views '%s' missing or older than the last change -> await m.views({mode:'%s'})" % (m, m))
            continue
        try:
            with open(js) as f:
                v = json.load(f)
            ang, n = set(v.get("angles", [])), len(v.get("frames", []))
            if not ANGLES <= ang or n < MIN_FRAMES:
                miss.append("views '%s' has angles %s / %d frames (need front, right, back, left x %d)" % (m, sorted(ang), n, MIN_FRAMES))
        except (OSError, ValueError):
            miss.append("out/motion-views-%s.json unreadable -> run m.views({mode:'%s'}) again" % (m, m))
        if os.path.normpath(png) not in seen:
            miss.append("open %s with the Read tool and actually check every frame/angle" % png)
    return miss, modes


def stop(data):
    parts = read_marker()
    if not parts:
        return
    miss, modes = missing_evidence(parts, data.get("transcript_path"))
    if not miss:
        for p in (MARK, COUNT):
            try:
                os.remove(p)
            except FileNotFoundError:
                pass
        return
    # don't trap the session forever (server down, browser gone): after 3 blocked stops in a row, let it end but say so loudly
    n = 0
    try:
        with open(COUNT) as f:
            n = int(f.read().strip() or 0)
    except (OSError, ValueError):
        pass
    if data.get("stop_hook_active") and n >= 3:
        print(json.dumps({"systemMessage": "Motion definition of done NOT met (" + "; ".join(miss) + "). The marker stays in .claude/.motion-dirty."}))
        return
    with open(COUNT, "w") as f:
        f.write(str(n + 1))
    reason = (
        "Motion/rig change not verified yet (" + ", ".join(parts) + "). Definition of done -- still missing:\n- " + "\n- ".join(miss) + "\n\n"
        "How: server running (cd server && go run .); in http://localhost:8080 (reload past the cache: open /?v=<new number>) run\n"
        "  const m = await import('/debug/motion_check.js?'+Date.now()); await m.run();\n"
        "then, for each of " + ", ".join(modes) + ":  await m.views({mode:'<mode>'})  (reload the page between scenarios), "
        "and open out/motion-views-<mode>.png with the Read tool. Look at every frame from the front, right, back and left: "
        "shoulders level and not popping, no side-to-side lean, arms/legs in the right plane, blade never through the body. "
        "Report what you saw and the numbers to the user in Thai. The hook clears the marker itself once this is all present."
    )
    print(json.dumps({"decision": "block", "reason": reason}))


if __name__ == "__main__":
    try:
        data = json.load(sys.stdin)
    except Exception:
        data = {}
    {"post": post, "pre": pre, "stop": stop}.get(sys.argv[1] if len(sys.argv) > 1 else "", lambda d: None)(data)
