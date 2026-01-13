#!/usr/bin/env python3
"""
Avatar Image Splitter
Splits the composite avatar image into individual files
"""

from PIL import Image
import os

# Configuration
INPUT_IMAGE = 'avatar-grid.png'  # Place your composite image here
OUTPUT_DIR = 'public/images/avatars'
GRID_COLS = 4
GRID_ROWS = 5

# Avatar names mapping (from avatar-config-data.js)
# Row 1-2: Use the creature images
# Row 3-5: These appear to be student characters - you may want different creature images
AVATAR_NAMES = [
    # Row 1: Animals with glasses (matches config creatures)
    'lion', 'default', 'eagle', 'fox',  # default can be the cat

    # Row 2: Fantasy creatures (matches config creatures)
    'dragon', 'alien', 'phoenix', 'octopus',  # octopus is purple alien

    # Row 3: These are students - need creature images instead
    # Keeping for now but you'll want to replace with: tiger, panda, owl, unicorn
    'tiger', 'panda', 'owl', 'unicorn',

    # Row 4: More students - need creature images
    # Replace with: penguin, wolf, shark, raccoon
    'penguin', 'wolf', 'shark', 'raccoon',

    # Row 5: More students - need creature images
    # Replace with: robot, ninja, wizard, dinosaur
    'robot', 'ninja', 'wizard', 'dinosaur'
]

def split_avatars(input_path, output_dir):
    """Split composite image into individual avatar files"""

    # Load image
    print(f"Loading image: {input_path}")
    img = Image.open(input_path)
    width, height = img.size

    # Calculate individual avatar dimensions
    avatar_width = width // GRID_COLS
    avatar_height = height // GRID_ROWS

    print(f"Image size: {width}x{height}")
    print(f"Grid: {GRID_COLS} cols x {GRID_ROWS} rows")
    print(f"Each avatar: {avatar_width}x{avatar_height}")
    print()

    # Create output directory
    os.makedirs(output_dir, exist_ok=True)

    # Split and save each avatar
    count = 0
    for row in range(GRID_ROWS):
        for col in range(GRID_COLS):
            # Calculate crop coordinates
            left = col * avatar_width
            top = row * avatar_height
            right = left + avatar_width
            bottom = top + avatar_height

            # Crop avatar
            avatar = img.crop((left, top, right, bottom))

            # Save with name
            if count < len(AVATAR_NAMES):
                filename = f"{AVATAR_NAMES[count]}.png"
                filepath = os.path.join(output_dir, filename)
                avatar.save(filepath, 'PNG', optimize=True)
                print(f"✅ Saved: {filename}")
                count += 1

    print(f"\n🎉 Successfully split {count} avatars into {output_dir}/")

if __name__ == '__main__':
    # Check if input file exists
    if not os.path.exists(INPUT_IMAGE):
        print(f"❌ Error: {INPUT_IMAGE} not found!")
        print(f"Please save your composite avatar image as '{INPUT_IMAGE}' in this directory.")
        exit(1)

    try:
        split_avatars(INPUT_IMAGE, OUTPUT_DIR)
    except Exception as e:
        print(f"❌ Error: {e}")
        print("\nMake sure you have Pillow installed:")
        print("  pip install Pillow")
        exit(1)
