---
name: replay-testing
description: Use when analyzing an abi-ear-js recording (a folder like 2026-11-07-214528 the author recorded), replaying recordings to measure a change in the engine, vision or label models, checking pickups that went to no box or the wrong box, boxes without category, phantom boxes, or building label models for a game language.
---

# Replay testing (abi-ear-js)

## Overview
The author records vendor visits with the dev page (frames, audio, `events.jsonl` of what the live page did). The
replay runs the same engine over a recording, frame by frame and sound by sound, so a change can be measured on real
data before it ships. All scripts below live in `.claude/skills/replay-testing/scripts/` and are run with `bash`/`node`.

## Quick reference

| Need | Command |
|---|---|
| Replay and summarize | `bash scripts/replay.sh [--base <previous round dir>] <names \| en \| pt \| all>` |
| Grid the page would show at given moments | `bash scripts/replay.sh --snap <ms>,<ms> <name>` |
| Compare two rounds again | `node scripts/summarize.mjs <dir> [<previous dir>]` |
| When is the vendor open, unread labels | `bash scripts/probe.sh <name> timeline [from-ms] [to-ms] [step-ms]` |
| Boxes, category and the two best scores in frames | `bash scripts/probe.sh <name> boxes <frame>,<frame>` |
| Own score vs best rival on the ground truth | `bash scripts/probe.sh <name> truth` |
| Frames the recorder dropped | `bash scripts/gaps.sh <name> [min-ms] [from-ms] [to-ms]` |
| See a frame (then Read the jpg) | `bash scripts/frame.sh <name> <ms> [vendor\|full\|top\|bottom\|zoom:X,Y,W,H]` |
| Rebuild label models of a language | `bash scripts/build-labels.sh pt\|en` |

Groups: `en` = the 5 English recordings with the desktop app log (the attribution and category reference);
`pt` = recordings whose `labels-truth.json` says `"language": "pt"`; `all` = both. Known recordings: `recordings.md`.

## Analyzing a new recording
1. Read `events.jsonl` pickups: `grep '"type":"pickup"' <rec>/events.jsonl` (outcome, reason, box, label).
2. `probe.sh <rec> timeline` to find when the vendor is open and how many boxes have text but no category.
3. For each complaint, find the moment (ms = frame name), look with `frame.sh`, and confirm with `probe.sh ... boxes`.
4. Missing categories: write `<rec>/labels-truth.json` (frames where the cursor is off the boxes, boxes as listed
   by `probe.sh boxes`, category by its English base name, `"language"`), then `build-labels.sh <lang>`, then check
   held-out frames with `probe.sh boxes` and `probe.sh truth`.
5. Engine fix: failing unit test first (session/grid tests), then `replay.sh all --base <last round>`.
6. Report with the summary numbers; say which differences are improvements and which are regressions.

## Reading the results
- `concorda` / `errada`: same / other box than the desktop app (only `en`). The app is not always right: when a
  difference looks wrong, look at the frame before calling it a regression (it merged boxes under tooltips).
- `contra o ao vivo`: replay vs what the live page did. Box rows can differ by a constant (the session anchors rows
  at the first scan): `diferente` with every row shifted by the same amount is not a real difference.
- `? (moving)`, `? (no-box)`, `? (no-cursor)`: pickup left unassigned on purpose; check the frames before the sound.
- `? (no-frame)`: the recording has no frame in the window before the sound (`gaps.sh`); it cannot be judged.
- `moving` on one side and a box on the other is usually frame timing (live and replay analyze different frames).

## Common mistakes
- A round takes 10–15 min (frames are read from the Windows disk): run it in the background and wait for the
  notification. Stop a stale round (TaskStop) before starting another after a code change; `replay.sh` refuses to
  start while replays run.
- Never `pkill -f "vitest run src/engine/replay"`: it matches the shell running it. Use `[v]itest`.
- `matchArrow is fast enough` and `peaks are fast enough` fail under CPU load (replays running); rerun alone.
- Do not switch branches in the main checkout while the dev server runs (a half-written file breaks Vite); merge
  in a worktree.
- Recording paths contain the Windows user name: never write them into repo files (use `<usuário>`).
