#!/bin/bash

# Get absolute path for samples directory
SAMPLES_DIR="$(cd "$(dirname "$0")" && pwd)/samples"

if [ ! -d "$SAMPLES_DIR" ]; then
    echo "❌ Samples directory not found: $SAMPLES_DIR"
    exit 1
fi

echo "🎬 Starting frame extraction process..."
echo "📂 Processing directory: $SAMPLES_DIR"
echo ""

VIDEO_COUNT=0

# Use -print0 and read -d '' to properly handle paths with spaces/special chars
# Added -nostdin to ffmpeg to prevent it from consuming filenames from stdin
while IFS= read -r -d '' VIDEO_PATH; do
    # Output directory is in the same folder as the video
    VIDEO_DIR=$(dirname "$VIDEO_PATH")
    OUTPUT_DIR="$VIDEO_DIR/frames"
    
    mkdir -p "$OUTPUT_DIR"
    
    echo "⏳ Extracting frames from: $VIDEO_PATH"
    echo "📁 Output directory: $OUTPUT_DIR"
    
    # Extract frames at 30 FPS - Added -nostdin to prevent path corruption
    ffmpeg -nostdin -i "$VIDEO_PATH" -vf "fps=30" "$OUTPUT_DIR/frame-%04d.png" -loglevel error
    
    FRAME_COUNT=$(find "$OUTPUT_DIR" -name "frame-*.png" | wc -l)
    echo "✅ Extracted $FRAME_COUNT frames"
    echo ""
    
    VIDEO_COUNT=$((VIDEO_COUNT + 1))
done < <(find "$SAMPLES_DIR" -type f \( -name "*.mp4" -o -name "*.mov" -o -name "*.avi" -o -name "*.mkv" -o -name "*.webm" \) -print0)

echo "✨ Frame extraction completed!"
echo "📁 All frames are saved in their respective video folders (./frames/ subdirectories)"
