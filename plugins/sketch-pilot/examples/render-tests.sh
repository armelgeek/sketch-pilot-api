#!/bin/bash
OUTPUT_DIR="examples/output"
mkdir -p "$OUTPUT_DIR"

for style in colored scaling bounce neon typewriter animated-background; do
  echo "Rendering $style..."
  ffmpeg -y -f lavfi -i color=c=black:s=1080x1920:d=5 -vf "ass=$OUTPUT_DIR/test-captions-${style}.ass" "$OUTPUT_DIR/test-${style}.mp4" -hide_banner -loglevel error
done
echo "Done."
