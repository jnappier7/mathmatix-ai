#!/bin/bash
# Avatar Image Splitter (ImageMagick version)
# Usage: ./split-avatars.sh avatar-grid.png

INPUT_IMAGE="$1"
OUTPUT_DIR="public/images/avatars"
COLS=4
ROWS=5

# Avatar names (from avatar-config-data.js)
AVATAR_NAMES=(
  # Row 1
  "lion" "default" "eagle" "fox"
  # Row 2
  "dragon" "alien" "phoenix" "octopus"
  # Row 3
  "tiger" "panda" "owl" "unicorn"
  # Row 4
  "penguin" "wolf" "shark" "raccoon"
  # Row 5
  "robot" "ninja" "wizard" "dinosaur"
)

# Check if ImageMagick is installed
if ! command -v convert &> /dev/null; then
    echo "❌ Error: ImageMagick not found"
    echo "Install it with: sudo apt-get install imagemagick"
    exit 1
fi

# Check if input file provided
if [ -z "$INPUT_IMAGE" ]; then
    echo "Usage: $0 <input-image.png>"
    echo "Example: $0 avatar-grid.png"
    exit 1
fi

# Check if input file exists
if [ ! -f "$INPUT_IMAGE" ]; then
    echo "❌ Error: File not found: $INPUT_IMAGE"
    exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo "Splitting $INPUT_IMAGE into ${COLS}x${ROWS} grid..."
echo "Output directory: $OUTPUT_DIR"
echo ""

# Calculate tile size
IMAGE_WIDTH=$(identify -format "%w" "$INPUT_IMAGE")
IMAGE_HEIGHT=$(identify -format "%h" "$INPUT_IMAGE")
TILE_WIDTH=$((IMAGE_WIDTH / COLS))
TILE_HEIGHT=$((IMAGE_HEIGHT / ROWS))

echo "Image size: ${IMAGE_WIDTH}x${IMAGE_HEIGHT}"
echo "Each tile: ${TILE_WIDTH}x${TILE_HEIGHT}"
echo ""

# Split using ImageMagick
convert "$INPUT_IMAGE" -crop "${COLS}x${ROWS}@" +repage +adjoin "${OUTPUT_DIR}/temp_%02d.png"

# Rename files to avatar names
INDEX=0
for NAME in "${AVATAR_NAMES[@]}"; do
    TEMP_FILE=$(printf "${OUTPUT_DIR}/temp_%02d.png" $INDEX)
    if [ -f "$TEMP_FILE" ]; then
        mv "$TEMP_FILE" "${OUTPUT_DIR}/${NAME}.png"
        echo "✅ Saved: ${NAME}.png"
        ((INDEX++))
    fi
done

echo ""
echo "🎉 Successfully split $INDEX avatars!"
