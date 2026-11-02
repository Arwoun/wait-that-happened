# Weekly episode runbook — "Wait, That Happened?"

One ~60-75 s vertical animated short per week: a surprising **true** story from world history, English narration,
flat 2D cartoon characters in a painted 3D world (three.js inside Remotion), burned-in word-synced subtitles,
original synthesized score + SFX. Delivered as an MP4 the owner posts to TikTok by hand. Everything runs in the
cloud (this repo's GitHub Actions); nothing runs on the owner's PC.

Read `docs/ENGINE_SKILL.md` (the engine's own notes) once. Episode 1 (`ep001_emu_war`) is the reference
implementation of everything below.

## Constraints that never change
- **True story, checked facts.** Every number and claim verified with web search, sources listed in `script.json`.
  Not in `topics_done.txt` (append the new one). Prefer stories with a physical, visual cause and effect, no human
  deaths or gore (cartoon tone), from anywhere in the world; vary countries and centuries week to week.
- Story, characters and drawings are always our own. Never reproduce a real artwork, logo, flag in detail, or a
  copyrighted character. No real photos. No captions other than the narration subtitles.
- English narration, Gemini voice (`"voice": "Charon"`, deadpan documentary style), 230-260 words, `max_seconds` 70.
- Burned-in subtitles synced to `words.json` (src/common/Subtitles.tsx) — the owner wants them on every video.
- Vertical 1080x1920, 30 fps, -14 LUFS.

## Pipeline (in order)
1. **Topic + facts** (web search). Write `episodes/<id>/script.json` (copy ep001's format: `id, title, voice, style,
   max_seconds, beats[{vo}], caption, sources`). Beat formula: hook (absurd fact in one line) → setting → 3-4
   escalating beats → the snap → deadpan "Luckily / Unluckily" double → one analogy → consequence → callback twist.
   `id` = `epNNN_slug` (next number).
2. **Voice.** `bash tools/new_episode.sh <id>` then commit + push `script.json`: the **Voice** workflow runs Gemini
   TTS, trims anything read before the first word (the model sometimes reads the style prompt aloud), shortens beat
   pauses, nudges the pace to <= `max_seconds`, re-aligns with faster-whisper and commits `voice/voice.wav` +
   `voice/words.json`. Wait for it (`gh api repos/Arwoun/wait-that-happened/actions/runs`), then `git pull`.
   Check the log line `aligned N/N words exactly`.
3. **Shot plan** in `src/episodes/<id>/story.ts`: `TOTAL` = ceil((last word end + 1.7 s) * 30). 12-16 shots, cuts
   on words (reaction 0-3 frames before the word), crossfades only at place/time changes, white flash after the hook,
   kicks on impacts, every hold creeps in. Places are fixed world coordinates (one set per location).
4. **World** (`world.ts`): ground, sky, set pieces for each location, dynamic objects posed per frame. Vegetation is
   procedural (`prop(b, kit, "tree_default"|"tree_oak"|"plant_bush"|"hedge", ...)`), Kenney kits are optional.
5. **Characters** (`creatures.ts` for non-humans and props, `toon.ts` outfits/hats for people): check them on a
   contact sheet without the 3D engine: `npm i --no-save canvas tsx` then `npx tsx tools/sheet.ts <id> out/sheet.png`
   (edit `sheet_items.ts`) and **look at the PNG**.
6. **Staging** (`cast.ts` `stage()`): one `case` per shot. Helpers: `emu()`-style creature placer, `human()`,
   `gun()`, `crate()`, `puff()`, `flash()`, `blob()` contact shadows.
7. **Framing check — always.** `npx tsx tools/framing.ts <id> '<json>'` with the head/feet of every subject at the
   start/end of every camera key. The frame is 9:16: anything more than ~0.2 rad off-axis is out. Fix every MISS.
8. **Stills.** `CHROME=/usr/bin/google-chrome node tools/stills.mjs out/s/x_ <frames> 0.5` (~40 s per still here,
   software WebGL). Look at one frame per shot; fix, repeat.
9. **Sound** (`episodes/<id>/audio/mix.py`): copy ep001's, rewrite the cue times (score sections, stabs, SFX) to
   the new picture. Run it locally to check it finishes and lands near -14 LUFS.
10. **Render.** `printf '{"id":"<id>","frames":TOTAL,"title":"..."}' > episodes/<id>/episode.json`, commit, push, then
    `gh api -X POST repos/Arwoun/wait-that-happened/actions/workflows/render.yml/dispatches -f ref=main
    -f "inputs[episode]=<id>"`. 20 parallel chunks, ~25-30 min. The MP4 lands in the Release `<id>`.
11. **QA + delivery.** Download the MP4 via the REST API (asset id from `releases/tags/<id>`, then
    `-H "Accept: application/octet-stream" .../releases/assets/<asset_id>`), look at frames from every shot and the
    QA report, fix and re-render if anything is wrong, then send the MP4 to the owner with the TikTok caption
    (3-5 hashtags) and the sources.

## Lessons from episode 1
- The 9:16 frame is narrow: a subject 1.3 m to the side at 6 m is out. Use tools/framing.ts before rendering.
- Characters are billboards (front or side view only): stage people facing the camera; side views for walkers.
- Gemini TTS can read the style prompt aloud: tools/voice_post.py trims it using the alignment.
- A crashed chunk must fail the job (`set -o pipefail` + `test -s` in render.yml).
- Commit only sources: `mix.wav` and stems are generated in CI.
