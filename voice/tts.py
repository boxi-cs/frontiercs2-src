"""Synthesize one voiceover clip per line with ElevenLabs, in the maintainer's cloned voice.

Usage: python3 -I voice/tts.py <lines.json> <lang> <out_dir>

Copied from FrontierCS-2/video/src/tts.py (the launch video). Voice-over is made by the
maintainer only. Local settings live in voice/.env (not in git), one KEY=value per line:

    ELEVENLABS_VOICE_ID=<the cloned voice's id>
    FCS2_ENV_FILE=<a file that holds ELEVENLABS_API_KEY=...>

Environment variables of the same names win. The key is never printed. Clips are cached by a
hash of (voice, model, settings, lang, text), so editing one line only re-synthesizes that line.
"""

import hashlib
import json
import os
import re
import sys
import urllib.request
import wave
from pathlib import Path

LOCAL = Path(__file__).with_name(".env")
if LOCAL.exists():
    for line in LOCAL.read_text().splitlines():
        name, sep, value = line.strip().partition("=")
        if sep and not name.startswith("#"):
            os.environ.setdefault(name.strip(), value.strip())

VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "")
MODEL_ID = os.environ.get("ELEVENLABS_MODEL_ID", "eleven_v4")
SETTINGS = {"stability": 0.5, "similarity_boost": 0.75}
RATE = 24000
ENV_FILE = Path(os.environ.get("FCS2_ENV_FILE", str(LOCAL)))


def api_key() -> str:
    key = os.environ.get("ELEVENLABS_API_KEY")
    if key:
        return key
    if not VOICE_ID or not ENV_FILE.exists():
        sys.exit("voice/.env is missing (voice-over is made by the maintainer only)")
    for line in ENV_FILE.read_text().splitlines():
        m = re.match(r"\s*(?:export\s+)?ELEVENLABS_API_KEY\s*=\s*[\"']?([^\"'\s]+)", line)
        if m:
            return m.group(1)
    sys.exit("ELEVENLABS_API_KEY not found")


def synth(text: str, lang: str, key: str) -> bytes:
    body = json.dumps({
        "text": text,
        "model_id": MODEL_ID,
        "language_code": lang,
        "voice_settings": SETTINGS,
    }).encode()
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}?output_format=pcm_{RATE}",
        data=body,
        headers={"xi-api-key": key, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        audio = r.read()
    if not audio:
        raise RuntimeError("ElevenLabs returned no audio")
    return audio


def main() -> None:
    lines_path, lang, out_dir = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
    out_dir.mkdir(parents=True, exist_ok=True)
    cache = out_dir / ".cache"
    cache.mkdir(exist_ok=True)
    lines = json.loads(lines_path.read_text())[lang]
    key = None
    timing = []
    for item in lines:
        say = item.get("say", item["text"])
        h = hashlib.sha256(json.dumps([VOICE_ID, MODEL_ID, SETTINGS, lang, say]).encode()).hexdigest()[:16]
        pcm_path = cache / f"{h}.pcm"
        if pcm_path.exists():
            status = "cached"
        else:
            key = key or api_key()
            pcm_path.write_bytes(synth(say, lang, key))
            status = "synthesized"
        pcm = pcm_path.read_bytes()
        wav_path = out_dir / f"{item['shot']}.wav"
        with wave.open(str(wav_path), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(pcm)
        seconds = len(pcm) / 2 / RATE
        timing.append({"shot": item["shot"], "text": item["text"], "seconds": round(seconds, 3)})
        print(f"{item['shot']:4} {seconds:5.2f}s  {status}")
    (out_dir / "timing.json").write_text(json.dumps(timing, ensure_ascii=False, indent=2))
    print(f"total speech {sum(t['seconds'] for t in timing):.1f}s")


if __name__ == "__main__":
    main()
