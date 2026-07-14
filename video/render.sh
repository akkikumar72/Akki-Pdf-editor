#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# video/out is gitignored, so create it before rendering; fail fast with a
# clear message when the required binaries are missing.
[ -x ./node_modules/.bin/remotion ] || { echo "✗ remotion CLI not found — run 'bun install' first" >&2; exit 1; }
command -v ffmpeg >/dev/null 2>&1 || { echo "✗ ffmpeg not found on PATH — install it to produce the final master" >&2; exit 1; }
mkdir -p video/out

./node_modules/.bin/remotion render \
  video/index.ts \
  AkkiShowcase \
  video/out/akki-pdf-showcase-square.mp4 \
  --codec=h264 \
  --crf=18 \
  --pixel-format=yuv420p \
  --public-dir=video/public

ffmpeg -y -loglevel error \
  -i video/out/akki-pdf-showcase-square.mp4 \
  -vf "scale=in_range=full:out_range=tv,format=yuv420p" \
  -c:v libx264 \
  -preset slow \
  -crf 18 \
  -color_range tv \
  -colorspace bt709 \
  -color_primaries bt709 \
  -color_trc bt709 \
  -af "loudnorm=I=-14:TP=-1:LRA=7" \
  -c:a aac \
  -b:a 192k \
  -ar 48000 \
  -movflags +faststart \
  video/out/akki-pdf-showcase-square-final.mp4
