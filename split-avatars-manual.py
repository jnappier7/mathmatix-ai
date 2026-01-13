#!/usr/bin/env python3
"""
Avatar Image Splitter with manual boundary adjustments
Accounts for uneven spacing in the composite image
"""

from PIL import Image
import os

# Configuration
INPUT_IMAGE = 'public/images/avatars/avitar-grid.png'
OUTPUT_DIR = 'public/images/avatars'

# Avatar names (left-to-right, top-to-bottom)
AVATAR_NAMES = [
    'lion', 'default', 'eagle', 'fox',
    'dragon', 'alien', 'phoenix', 'octopus',
    'tiger', 'panda', 'owl', 'unicorn',
    'penguin', 'wolf', 'shark', 'raccoon',
    'robot', 'ninja', 'wizard', 'dinosaur'
]

def split_avatars_manual(input_path, output_dir):
    """Split composite image with manual boundary adjustments"""

    print(f"Loading image: {input_path}")
    img = Image.open(input_path)
    width, height = img.size
    print(f"Image size: {width}x{height}\n")

    # Create output directory
    os.makedirs(output_dir, exist_ok=True)

    # Manual row boundaries based on actual whitespace gaps in composite
    # Detected by finding horizontal background-color dividing lines
    row_boundaries = [
        30,      # Start of row 0 (after 30px top margin)
        240,     # End of row 0 (before 49px gap)
        289,     # Start of row 1 (after gap)
        519,     # End of row 1 (before 28px gap)
        547,     # Start of row 2 (after gap)
        788,     # End of row 2 (before 32px gap)
        820,     # Start of row 3 (after gap)
        1078,    # End of row 3 (before 27px gap)
        1105,    # Start of row 4 (after gap)
        1355     # End of row 4 (before 181px bottom margin)
    ]

    # Column boundaries (evenly spaced)
    col_width = width // 4  # 256px

    count = 0
    for row in range(5):
        y_start = row_boundaries[row * 2]      # Even indices are start positions
        y_end = row_boundaries[row * 2 + 1]    # Odd indices are end positions
        row_height = y_end - y_start

        for col in range(4):
            x_start = col * col_width
            x_end = (col + 1) * col_width

            # Crop avatar
            avatar = img.crop((x_start, y_start, x_end, y_end))

            # Save with name
            if count < len(AVATAR_NAMES):
                filename = f"{AVATAR_NAMES[count]}.png"
                filepath = os.path.join(output_dir, filename)
                avatar.save(filepath, 'PNG', optimize=True)
                print(f"✅ Saved: {filename} ({x_end-x_start}x{row_height}px)")
                count += 1

    print(f"\n🎉 Successfully split {count} avatars into {output_dir}/")

if __name__ == '__main__':
    if not os.path.exists(INPUT_IMAGE):
        print(f"❌ Error: {INPUT_IMAGE} not found!")
        exit(1)

    try:
        split_avatars_manual(INPUT_IMAGE, OUTPUT_DIR)
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
