#!/usr/bin/env python3
"""
Analyze the avatar grid to find correct split boundaries
"""

from PIL import Image
import numpy as np

# Load the image
img = Image.open('public/images/avatars/avitar-grid.png')
img_array = np.array(img)

width, height = img.size
print(f"Image size: {width}x{height}")
print(f"Simple division: {width//4}x{height//5} per avatar")
print()

# Check if there's consistent spacing by looking at row/column dividers
# Look for vertical lines of consistent color (whitespace between columns)
# Look for horizontal lines of consistent color (whitespace between rows)

# Sample some rows to find potential column boundaries
print("Analyzing potential column boundaries...")
mid_height = height // 2
row_pixels = img_array[mid_height, :, :]

# Check for repeating patterns or gaps
col_width_estimate = width // 4
for i in range(5):
    x = i * col_width_estimate
    if x < width:
        print(f"Column {i}: pixel at x={x}, RGB={row_pixels[x][:3]}")

print("\nAnalyzing potential row boundaries...")
mid_width = width // 2
col_pixels = img_array[:, mid_width, :]

row_height_estimate = height // 5
for i in range(6):
    y = i * row_height_estimate
    if y < height:
        print(f"Row {i}: pixel at y={y}, RGB={col_pixels[y][:3]}")

# Check the actual height more carefully
print(f"\nExact row height: {height / 5}")
print(f"Using integer division loses: {height % 5} pixels")

# Let's try to detect where avatars actually are by looking at non-white pixels
# Check if there's a white background
print("\nChecking for white/light background...")
# Sample corner pixel
corner_color = img_array[0, 0, :]
print(f"Top-left corner color: {corner_color[:3]}")

# Better approach: use the exact pixel heights with rounding
print("\n=== RECOMMENDED SPLIT ===")
print("Try using exact float division and round positions:")
for row in range(5):
    y_start = round(row * height / 5)
    y_end = round((row + 1) * height / 5)
    print(f"Row {row}: y={y_start} to y={y_end} (height={y_end - y_start})")

print()
for col in range(4):
    x_start = round(col * width / 4)
    x_end = round((col + 1) * width / 4)
    print(f"Col {col}: x={x_start} to x={x_end} (width={x_end - x_start})")
