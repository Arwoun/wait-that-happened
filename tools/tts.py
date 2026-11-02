"""Gemini TTS narration for an episode (same setup as the VERDICT pipeline).

usage: python tools/tts.py episodes/<id>/script.json voice_raw.wav
script.json: {"voice": "...", "style": "...", "beats": [{"vo": "..."}, ...]}
Lit la clé dans la variable d'environnement GEMINI_API_KEY (secret GitHub).
"""
import json, mimetypes, os, struct, sys, time
from google import genai
from google.genai import types

MODEL = os.environ.get("TTS_MODEL", "gemini-3.8-flash-tts")


def to_wav(pcm, mime):
    bits, rate = 16, 24000
    for p in mime.split(";"):
        p = p.strip()
        if p.lower().startswith("rate="):
            try: rate = int(p.split("=", 1)[1])
            except ValueError: pass
        elif p.startswith("audio/L"):
            try: bits = int(p.split("L", 1)[1])
            except ValueError: pass
    ba = bits // 8
    return struct.pack("<4sI4s4sIHHIIHH4sI", b"RIFF", 36 + len(pcm), b"WAVE", b"fmt ", 16, 1, 1,
                       rate, rate * ba, ba, bits, b"data", len(pcm)) + pcm


def synth(text, voice):
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    cfg = types.GenerateContentConfig(
        temperature=1, response_modalities=["audio"],
        speech_config=types.SpeechConfig(voice_config=types.VoiceConfig(
            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice))))
    contents = [types.Content(role="user", parts=[types.Part.from_text(text=text)])]
    audio, mime = bytearray(), ""
    for chunk in client.models.generate_content_stream(model=MODEL, contents=contents, config=cfg):
        if chunk.parts is None: continue
        part = chunk.parts[0]
        if part.inline_data and part.inline_data.data:
            audio.extend(part.inline_data.data); mime = part.inline_data.mime_type
    if not audio: raise RuntimeError("aucun audio reçu")
    data = bytes(audio)
    return data if mimetypes.guess_extension(mime) == ".wav" else to_wav(data, mime)


def main():
    script = json.load(open(sys.argv[1], encoding="utf-8"))
    text = "\n\n".join(b["vo"] for b in script["beats"])
    style = script.get("style", "Read this like a calm, deadpan storyteller narrating a funny true story: steady tone, clear, unhurried, no shouting.")
    text = style + "\n\n## Transcript:\n" + text
    voice = script.get("voice", "Bodi")
    for attempt in range(4):
        try:
            data = synth(text, voice)
            open(sys.argv[2], "wb").write(data)
            print(f"voix {voice} : {len(data)} octets -> {sys.argv[2]}")
            return
        except Exception as e:
            msg = str(e)
            print(f"essai {attempt + 1} échoué : {msg}", file=sys.stderr)
            print(f"::warning::TTS essai {attempt + 1} : {msg[:300]}")
            if "RESOURCE_EXHAUSTED" in msg and "PerDay" in msg.replace(" ", "") or "quota" in msg.lower() and "day" in msg.lower():
                print("::error::Quota quotidien Gemini TTS atteint (remise à zéro à 9h00, heure de Paris).")
                sys.exit(2)
            # surcharge temporaire (503) ou limite par minute (429) : on patiente puis on réessaie
            time.sleep(25 * (attempt + 1))
    print("::error::échec de la génération de la voix (voir avertissements TTS)")
    sys.exit(1)


if __name__ == "__main__":
    main()
