#!/usr/bin/env python3
"""Turn a clean voice recording into a field-radio transmission.

Usage:
  python3 tools/radioize.py in.wav --out-dir public/assets/audio/voice --name radio-orders

The chain is the one a 1940s AM field set imposes on a voice: a ~300-3000 Hz
channel, heavy AGC, a little saturation, constant carrier hiss plus random
crackle, and 8-bit-ish grit. Loudness lands on -16 LUFS like the other voice
assets, and the result is written as wav / ogg / mp3 / m4a next to the input
name so src/core/Audio.js can load the ogg.

Filtering and loudness are ffmpeg's job (its biquads and loudnorm are better
than hand-rolled ones); the noise bed, crackle, saturation and quantisation are
numpy, because they are per-sample random.
"""

import argparse
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np

SR = 48000
# Twice through each 2-pole stage: 4th order is what keeps a battlefield
# rumble out of a link that only ever carried 300-3000 Hz.
BAND = ("highpass=f=320:poles=2,highpass=f=320:poles=2,"
        "lowpass=f=3000:poles=2,lowpass=f=3000:poles=2")


def run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def decode(path, out):
    run(["ffmpeg", "-y", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "wav", str(out)])
    with wave.open(str(out)) as w:
        data = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float64) / 32768.0
    return data


def encode_ogg(src, out):
    """Vorbis at q4, like the rest of the voice set.

    The Homebrew ffmpeg here is built without libvorbis and its own vorbis
    encoder refuses 48 kHz mono, so the encoder comes from vorbis-tools.
    """
    try:
        run(["oggenc", "-Q", "-q", "4", "-o", out, str(src)])
    except (FileNotFoundError, subprocess.CalledProcessError):
        run(["ffmpeg", "-y", "-i", str(src), "-c:a", "libvorbis", "-q:a", "4", out])


def write_wav(samples, out):
    pcm = np.clip(samples * 32767.0, -32768, 32767).astype("<i2").tobytes()
    with wave.open(str(out), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm)


def radio_bed(n, rng):
    """Carrier hiss plus the crackle of a bad valve set."""
    # Pink-ish hiss: integrate white noise, then take the difference back out —
    # a cheap 1/f tilt without carrying a filter around.
    white = rng.standard_normal(n)
    brown = np.cumsum(white)
    brown -= np.linspace(brown[0], brown[-1], n)
    hiss = 0.55 * white + 0.45 * (brown / (np.max(np.abs(brown)) + 1e-12))
    hiss *= rng.uniform(0.8, 1.0)

    # Crackle: sparse impulses with a short exponential tail, louder ones rarer.
    crackle = np.zeros(n)
    count = int(n / SR * rng.uniform(2.5, 5.0))
    for _ in range(count):
        at = rng.integers(0, n - int(0.02 * SR))
        width = int(rng.uniform(0.0015, 0.006) * SR)
        tail = np.exp(-np.linspace(0, 6, width))
        amp = rng.uniform(0.05, 1.0) * rng.choice([0.25, 0.5, 1.0], p=[0.6, 0.3, 0.1])
        crackle[at:at + width] += rng.standard_normal(width) * tail * amp
    return hiss, crackle


def speech_bounds(x):
    """Where the transmission starts and ends: frames clearly above the floor.

    A radio recording has no silence to trim against, so the cut points come
    from the 300-3000 Hz envelope: the noise floor is its 10th percentile and
    anything 8 dB above that is the operator speaking.
    """
    frame = int(0.02 * SR)
    n = len(x) // frame
    rms = np.sqrt(np.mean(x[: n * frame].reshape(n, frame) ** 2, axis=1) + 1e-12)
    db = 20 * np.log10(rms + 1e-9)
    idx = np.where(db > np.percentile(db, 10) + 8)[0]
    if not len(idx):
        return 0, len(x)
    a = max(0, int(idx[0] * frame - 0.3 * SR))
    b = min(len(x), int((idx[-1] + 1) * frame + 0.35 * SR))
    return a, b



def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input", type=Path)
    ap.add_argument("--out-dir", type=Path, default=Path("."))
    ap.add_argument("--name", required=True)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--start", type=float, default=None,
                    help="seconds into the input to begin the transmission (default: auto)")
    ap.add_argument("--length", type=float, default=None,
                    help="seconds to keep (default: auto)")
    args = ap.parse_args()

    rng = np.random.default_rng(args.seed)
    args.out_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        raw = tmp / "in.wav"
        voice = decode(args.input, raw)
        band = tmp / "band.wav"
        run(["ffmpeg", "-y", "-i", str(raw), "-af", BAND, str(band)])
        v = decode(band, tmp / "band2.wav")

        # Keep only the keyed-up stretch, with the carrier already running
        # before the first syllable and still hissing after the last.
        if args.start is None and args.length is None:
            a, b = speech_bounds(v)
        else:
            a = int((args.start or 0.0) * SR)
            b = int(a + args.length * SR) if args.length else len(v)
            b = min(b, len(v))
        v = v[a:b]
        n = len(v)

        # One static gain, set from the loud end of the speech rather than its
        # peak: a per-frame AGC would ride up the noise between words and flatten
        # the delivery into a constant-level drone.
        v *= 0.9 / (np.percentile(np.abs(v), 99.5) + 1e-9)

        hiss, crackle = radio_bed(n, rng)
        hiss = hiss / (np.max(np.abs(hiss)) + 1e-9) * 0.02
        crackle = crackle / (np.max(np.abs(crackle)) + 1e-9) * 0.16
        mix = 0.95 * v + hiss + crackle * 0.55

        # Valve-set saturation: soft, symmetric, and only on the loud peaks.
        mix = np.tanh(mix * 2.2) / np.tanh(2.2)

        # Quantise to ~10 bits; enough grit to read as a link, not enough to
        # chew the consonants.
        steps = 2 ** 10
        mix = np.round(mix * steps) / steps

        dry = tmp / "mix.wav"
        write_wav(mix, dry)

        # One more band limit trims the harmonics the saturation just made, and
        # loudnorm puts the file at the same -16 LUFS as the other voice assets.
        shaped = tmp / "shaped.wav"
        run([
            "ffmpeg", "-y", "-i", str(dry),
            "-af", "highpass=f=320:poles=2,lowpass=f=3200:poles=2,"
                   "loudnorm=I=-16:TP=-1.5:LRA=11",
            "-ar", str(SR), "-ac", "1", str(shaped),
        ])

        base = args.out_dir / args.name
        run(["ffmpeg", "-y", "-i", str(shaped), f"{base}.wav"])
        encode_ogg(shaped, f"{base}.ogg")
        run(["ffmpeg", "-y", "-i", str(shaped), "-c:a", "libmp3lame", "-b:a", "128k", f"{base}.mp3"])
        run(["ffmpeg", "-y", "-i", str(shaped), "-c:a", "aac", "-b:a", "128k", f"{base}.m4a"])

    print(f"wrote {base}.wav/.ogg/.mp3/.m4a")


if __name__ == "__main__":
    main()
