# Wait, That Happened?

Weekly animated true-history shorts for TikTok: flat 2D cartoon characters in a painted 3D world, English narration,
synthesized music and sound. Built on the MIT skill [mromidev/claude-animated-shorts](https://github.com/mromidev/claude-animated-shorts)
(three.js inside Remotion). Everything runs on GitHub Actions; nothing runs on a local PC.

## How an episode is made
1. `episodes/<id>/script.json` — the narration in beats (`vo`), Gemini voice name, sources. Pushing it runs
   **Voice** (`.github/workflows/voice.yml`): Gemini TTS → `voice/voice.wav`, faster-whisper → `voice/words.json`.
2. `src/episodes/<id>/` — the episode's world, characters, shots and cameras, timed to `words.json`
   (start from the engine in `src/episodes/ep000_bridge/`). `index.ts` exports `{ Short, FRAMES }`.
   `episodes/<id>/episode.json` gives `frames`; `episodes/<id>/audio/` holds the episode's sound timeline + mix.
3. Run **Render episode** (`render.yml`, input `episode`): up to 20 parallel chunks with software WebGL,
   joined, mixed, muxed, frame-checked, and published as the Release `<id>` (MP4 + QA report).

Local look checks: `node tools/stills.mjs out/x_ 100,400 0.5`. Kenney CC0 kits: `bash tools/fetch_kenney.sh`.

`topics_done.txt` lists every story already told; never repeat one.
`ep000_bridge` is the engine's original example, used only to test the pipeline. It is never posted.

Code and docs: MIT (see LICENSE). Kenney assets: CC0, downloaded at build time.
