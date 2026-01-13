#!/usr/bin/env python3
"""
Detect actual avatar content boundaries in the grid
"""

from PIL import Image
import numpy as np

# Load the image
img = Image.open('public/images/avatars/avitar-grid.png')
img_array = np.array(img)
width, height = img.size

print(f"Image size: {width}x{height}\n")

# Background color is approximately [254, 254, 254] (nearly white)
# Let's check one cell to find where actual content starts

# Check first cell (top-left, should be lion)
cell_width = width // 4
cell_height = height // 5

print("Analyzing first cell (lion)...")
first_cell = img_array[0:cell_height, 0:cell_width]

# Find the first non-white row (from top)
background_threshold = 250  # Pixels brighter than this are likely background
for y in range(cell_height):
    row = first_cell[y, :, :3]  # RGB only
    if np.any(row < background_threshold):
        print(f"First content row at y={y}")
        break

# Find the last non-white row (from bottom)
for y in range(cell_height - 1, -1, -1):
    row = first_cell[y, :, :3]
    if np.any(row < background_threshold):
        print(f"Last content row at y={y}")
        print(f"Content height: {y - 0 + 1} pixels")
        break

# Find the first non-white column (from left)
for x in range(cell_width):
    col = first_cell[:, x, :3]
    if np.any(col < background_threshold):
        print(f"First content column at x={x}")
        break

# Find the last non-white column (from right)
for x in range(cell_width - 1, -1, -1):
    col = first_cell[:, x, :3]
    if np.any(col < background_threshold):
        print(f"Last content column at x={x}")
        print(f"Content width: {x - 0 + 1} pixels")
        break

print("\n" + "="*50)
print("Checking a middle row cell (row 3, should be students)...")
row_start = round(2 * height / 5)
row_end = round(3 * height / 5)
col_start = 0
col_end = cell_width

middle_cell = img_array[row_start:row_end, col_start:col_end]
cell_h = row_end - row_start

# Find vertical content bounds
first_content_y = None
last_content_y = None

for y in range(cell_h):
    row = middle_cell[y, :, :3]
    if np.any(row < background_threshold):
        if first_content_y is None:
            first_content_y = y
        last_content_y = y

print(f"First content row at y={first_content_y} (offset from row start)")
print(f"Last content row at y={last_content_y} (offset from row start)")
print(f"Content takes up {last_content_y - first_content_y + 1}/{cell_h} pixels")
print(f"Top margin: {first_content_y}px")
print(f"Bottom margin: {cell_h - last_content_y - 1}px")
