#!/usr/bin/env python3
"""
Check content boundaries for each row
"""

from PIL import Image
import numpy as np

img = Image.open('public/images/avatars/avitar-grid.png')
img_array = np.array(img)
width, height = img.size

background_threshold = 250
rows = 5

print(f"Image: {width}x{height}\n")

for row_num in range(rows):
    row_start = round(row_num * height / rows)
    row_end = round((row_num + 1) * height / rows)
    cell_height = row_end - row_start

    # Check first column of this row
    cell = img_array[row_start:row_end, 0:width//4]

    # Find vertical content bounds
    first_y = None
    last_y = None

    for y in range(cell_height):
        row_pixels = cell[y, :, :3]
        if np.any(row_pixels < background_threshold):
            if first_y is None:
                first_y = y
            last_y = y

    content_height = last_y - first_y + 1 if first_y is not None else 0
    top_margin = first_y if first_y is not None else 0
    bottom_margin = cell_height - last_y - 1 if last_y is not None else 0

    print(f"Row {row_num}: cell={cell_height}px, content={content_height}px, "
          f"top_margin={top_margin}px, bottom_margin={bottom_margin}px")
