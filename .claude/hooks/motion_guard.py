#!/usr/bin/env python3
"""Motion guard for Claude Code.

post  (PostToolUse Edit|Write|MultiEdit): if client/index.html was edited in movement/animation code, record which body parts
      were touched in .claude/.motion-dirty and remind Claude to test them.
stop  (Stop): while .claude/.motion-dirty exists, block finishing until Claude has run the motion check in the browser and
      looked at the changed limbs, then removed the marker.
"""
import json, os, re, sys

ROOT = os.environ.get("CLAUDE_PROJECT_DIR") or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MARK = os.path.join(ROOT, ".claude", ".motion-dirty")

PARTS = {
    "arms / hands / grip": r"gripPass|aimHand|aimArm|solveIK|rollToward|clampRoll|GRIP_TUNE|GRIP_CFG|makeGrip|wristFor|twoEff|gripOn|rho\b|swivel|eRel|haPrev|hang\b|pole[RLH]?\b|\bhx\b|\bhy\b|\bhz\b|real\.arm",
    "legs / feet / locomotion": r"thigh|knee|ankle|\bloco|locoPose|calibrateClip|walkAmt|walkPhase|spread|CADENCE|RUN_SPEED|WALK_SPEED|real\.ground|real\.corr|UpLeg|ToeBase",
    "torso / hips / shoulders": r"\bhips\b|\bchest\b|\bspine\b|\blean\b|hipYaw|chestYaw|hipY\b|RUN_LEAN|headYaw|breathe",
    "sword / slashes": r"COMBO|\bIDLE\b|CARRY|katana|\bby\b|\bel\b|timeline|EASE|setDyn|\bDYN\b|SOD|hitTest|impactMin|lunge|kHit|S\.edge",
}


def touched_parts(text):
    return [p for p, rx in PARTS.items() if re.search(rx, text)]


def read_marker():
    try:
        with open(MARK) as f:
            return [l.strip() for l in f if l.strip()]
    except FileNotFoundError:
        return None


def post(data):
    ti = data.get("tool_input") or {}
    path = ti.get("file_path") or (data.get("tool_response") or {}).get("filePath") or ""
    if not path.replace("\\", "/").endswith("client/index.html"):
        return
    chunks = [ti.get("old_string", ""), ti.get("new_string", ""), ti.get("content", "")]
    chunks += [e.get("old_string", "") + "\n" + e.get("new_string", "") for e in ti.get("edits", []) or []]
    parts = touched_parts("\n".join(chunks))
    if not parts:
        return
    have = read_marker() or []
    merged = have + [p for p in parts if p not in have]
    with open(MARK, "w") as f:
        f.write("\n".join(merged) + "\n")
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext":
        "Motion code changed (" + ", ".join(parts) + "). Before finishing: run the motion check in the browser and look at "
        "these limbs in slow-mo contact sheets (see the Stop-hook instructions / CLAUDE.md 'Motion check')."}}))


def stop(data):
    parts = read_marker()
    if not parts or data.get("stop_hook_active"):
        return
    reason = (
        "Movement code was edited (" + ", ".join(parts) + ") but not yet verified. Before finishing:\n"
        "1. Make sure the server runs (cd server && go run .), open http://localhost:8080 with the claude-in-chrome tools, "
        "and reload past the cache: await fetch('/',{cache:'reload'}); location.reload().\n"
        "2. In the page: const m = await import('/debug/motion_check.js?'+Date.now()); await m.run()  — fix every FAIL.\n"
        "3. LOOK at the changed parts: await m.sheet({mode:'combo'|'run'|'walk', yawOff:0 /*front*/ | -90 /*side*/ | 180 /*back*/}) "
        "then take a screenshot; check that arms and legs swing in the right direction/plane, the off-hand stays on the hilt in "
        "two-handed beats, the blade never passes through the legs and nothing pops between frames. Cover every part listed above "
        "from at least two angles.\n"
        "4. Tell the user (in Thai) what you checked and the numbers, then remove the marker: rm .claude/.motion-dirty\n"
        "If this turn did not really change motion (comment-only edit), say so and remove the marker."
    )
    print(json.dumps({"decision": "block", "reason": reason}))


if __name__ == "__main__":
    try:
        data = json.load(sys.stdin)
    except Exception:
        data = {}
    {"post": post, "stop": stop}.get(sys.argv[1] if len(sys.argv) > 1 else "", lambda d: None)(data)
