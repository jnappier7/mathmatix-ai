#!/usr/bin/env python3
"""
Diagram Generator for MathMatix AI
Generates accurate, controlled mathematical diagrams using matplotlib
NO freeform drawing - only specific, validated diagram types
"""

import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import numpy as np
import sys
import json
import io
import base64
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Wedge
from matplotlib.path import Path
import math

def generate_parabola(params):
    """
    Generate a parabola diagram
    params: {a, h, k, showVertex, showAxis, xRange, yRange}
    Equation: y = a(x-h)^2 + k
    """
    a = float(params.get('a', 1))
    h = float(params.get('h', 0))
    k = float(params.get('k', 0))
    show_vertex = params.get('showVertex', True)
    show_axis = params.get('showAxis', True)
    x_range = params.get('xRange', 10)
    y_range = params.get('yRange', 10)

    fig, ax = plt.subplots(figsize=(8, 6))

    # Generate x values
    x = np.linspace(h - x_range, h + x_range, 300)
    # Calculate y values: y = a(x-h)^2 + k
    y = a * (x - h)**2 + k

    # Plot parabola
    ax.plot(x, y, 'b-', linewidth=2.5, label=f'y = {a}(x-{h})² + {k}')

    # Show vertex
    if show_vertex:
        ax.plot(h, k, 'ro', markersize=10, label=f'Vertex ({h}, {k})')
        ax.annotate(f'Vertex\n({h}, {k})',
                   xy=(h, k), xytext=(h+1, k+2),
                   fontsize=12, fontweight='bold',
                   bbox=dict(boxstyle='round,pad=0.5', facecolor='yellow', alpha=0.7),
                   arrowprops=dict(arrowstyle='->', lw=2))

    # Show axis of symmetry
    if show_axis:
        ax.axvline(x=h, color='g', linestyle='--', linewidth=2, label=f'Axis: x = {h}')

    # Grid and axes
    ax.axhline(y=0, color='k', linewidth=0.5)
    ax.axvline(x=0, color='k', linewidth=0.5)
    ax.grid(True, alpha=0.3)
    ax.legend(fontsize=11, loc='best')
    ax.set_xlabel('x', fontsize=12, fontweight='bold')
    ax.set_ylabel('y', fontsize=12, fontweight='bold')
    ax.set_title(f'Parabola: y = {a}(x-{h})² + {k}', fontsize=14, fontweight='bold')

    # Set reasonable axis limits
    ax.set_xlim(h - x_range, h + x_range)
    y_min = min(y)
    y_max = max(y)
    y_padding = (y_max - y_min) * 0.1
    ax.set_ylim(y_min - y_padding, y_max + y_padding)

    return fig

def generate_triangle(params):
    """
    Generate a right triangle diagram
    params: {a, b, c, labels, showAngles, type}
    """
    a = float(params.get('a', 3))  # opposite
    b = float(params.get('b', 4))  # adjacent
    c = float(params.get('c', 5))  # hypotenuse
    labels = params.get('labels', {'a': 'a', 'b': 'b', 'c': 'c'})
    show_angles = params.get('showAngles', True)
    triangle_type = params.get('type', 'right')

    fig, ax = plt.subplots(figsize=(8, 6))

    # Right triangle vertices
    vertices = np.array([[0, 0], [b, 0], [0, a]])
    triangle = patches.Polygon(vertices, fill=False, edgecolor='blue', linewidth=3)
    ax.add_patch(triangle)

    # Add right angle marker
    square_size = 0.3
    square = patches.Rectangle((0, 0), square_size, square_size,
                               fill=False, edgecolor='blue', linewidth=2)
    ax.add_patch(square)

    # Label sides
    ax.text(b/2, -0.5, f'{labels.get("b", "b")} = {b}',
           ha='center', fontsize=14, fontweight='bold')
    ax.text(-0.5, a/2, f'{labels.get("a", "a")} = {a}',
           ha='center', fontsize=14, fontweight='bold', rotation=90)
    ax.text(b/2 + 0.3, a/2 + 0.3, f'{labels.get("c", "c")} = {c}',
           ha='center', fontsize=14, fontweight='bold', rotation=-50)

    # Show angles
    if show_angles:
        # Calculate angles
        angle_a = math.degrees(math.atan(a/b))
        angle_b = 90 - angle_a

        ax.text(0.8, 0.3, f'{angle_b:.1f}°', fontsize=12, color='red', fontweight='bold')
        ax.text(b-0.8, 0.3, f'{angle_a:.1f}°', fontsize=12, color='red', fontweight='bold')
        ax.text(0.3, 0.8, '90°', fontsize=12, color='red', fontweight='bold')

    # Set equal aspect and limits
    ax.set_aspect('equal')
    ax.set_xlim(-1, b + 1)
    ax.set_ylim(-1, a + 1)
    ax.axis('off')
    ax.set_title(f'Right Triangle', fontsize=14, fontweight='bold')

    return fig

def generate_number_line(params):
    """
    Generate a number line with support for inequalities
    params: {min, max, points, labels, showNumbers, inequality}
    inequality format: {value, type, inclusive}
    type: 'greater' (>), 'less' (<)
    inclusive: True (>=, <=) or False (>, <)
    """
    min_val = float(params.get('min', -10))
    max_val = float(params.get('max', 10))
    points = params.get('points', [])
    labels = params.get('labels', {})
    show_numbers = params.get('showNumbers', True)
    inequality = params.get('inequality', None)

    fig, ax = plt.subplots(figsize=(12, 2))

    # Draw number line
    ax.plot([min_val, max_val], [0, 0], 'k-', linewidth=3)

    # Add arrows at ends
    ax.annotate('', xy=(max_val, 0), xytext=(max_val-0.5, 0),
               arrowprops=dict(arrowstyle='->', lw=2, color='black'))
    ax.annotate('', xy=(min_val, 0), xytext=(min_val+0.5, 0),
               arrowprops=dict(arrowstyle='->', lw=2, color='black'))

    # Show tick marks for integers
    if show_numbers:
        for i in range(int(min_val), int(max_val) + 1):
            ax.plot([i, i], [-0.1, 0.1], 'k-', linewidth=2)
            ax.text(i, -0.3, str(i), ha='center', fontsize=11, fontweight='bold')

    # Draw inequality shading if specified
    if inequality:
        value = float(inequality.get('value', 0))
        ineq_type = inequality.get('type', 'greater')
        inclusive = inequality.get('inclusive', False)

        # Draw shaded region
        if ineq_type == 'greater':
            # Shade to the right
            ax.axhspan(-0.15, 0.15, xmin=(value - min_val) / (max_val - min_val),
                      xmax=1, alpha=0.3, color='blue')
            # Draw point
            if inclusive:
                ax.plot(value, 0, 'o', color='blue', markersize=14, markerfacecolor='blue')
            else:
                ax.plot(value, 0, 'o', color='blue', markersize=14, markerfacecolor='white',
                       markeredgewidth=3)
        else:  # less
            # Shade to the left
            ax.axhspan(-0.15, 0.15, xmin=0,
                      xmax=(value - min_val) / (max_val - min_val),
                      alpha=0.3, color='blue')
            # Draw point
            if inclusive:
                ax.plot(value, 0, 'o', color='blue', markersize=14, markerfacecolor='blue')
            else:
                ax.plot(value, 0, 'o', color='blue', markersize=14, markerfacecolor='white',
                       markeredgewidth=3)

        # Add inequality label
        symbol = '>=' if (ineq_type == 'greater' and inclusive) else \
                 '>' if ineq_type == 'greater' else \
                 '<=' if inclusive else '<'
        ax.text(value, 0.5, f'x {symbol} {value}', ha='center', fontsize=13,
               fontweight='bold', color='blue',
               bbox=dict(boxstyle='round,pad=0.4', facecolor='lightblue', alpha=0.8))

    # Mark special points
    for point in points:
        x = float(point.get('x', 0))
        color = point.get('color', 'red')
        label = point.get('label', '')

        ax.plot(x, 0, 'o', color=color, markersize=12)
        if label:
            ax.text(x, 0.4, label, ha='center', fontsize=12,
                   fontweight='bold', color=color,
                   bbox=dict(boxstyle='round,pad=0.3', facecolor='yellow', alpha=0.7))

    ax.set_xlim(min_val - 0.5, max_val + 0.5)
    ax.set_ylim(-0.8, 0.8)
    ax.axis('off')

    title = 'Number Line'
    if inequality:
        value = float(inequality.get('value', 0))
        ineq_type = inequality.get('type', 'greater')
        inclusive = inequality.get('inclusive', False)
        symbol = '>=' if (ineq_type == 'greater' and inclusive) else \
                 '>' if ineq_type == 'greater' else \
                 '<=' if inclusive else '<'
        title = f'Number Line: x {symbol} {value}'

    ax.set_title(title, fontsize=14, fontweight='bold', pad=20)

    return fig

def generate_coordinate_plane(params):
    """
    Generate a coordinate plane with optional points, lines, and inequalities
    params: {xRange, yRange, points, lines, grid, inequality}
    inequality format: {slope, yIntercept, type, inclusive}
    type: 'greater' (y > mx + b), 'less' (y < mx + b)
    inclusive: True (>=, <=) or False (>, <)
    """
    x_range = int(params.get('xRange', 10))
    y_range = int(params.get('yRange', 10))
    points = params.get('points', [])
    lines = params.get('lines', [])
    show_grid = params.get('grid', True)
    inequality = params.get('inequality', None)

    fig, ax = plt.subplots(figsize=(8, 8))

    # Draw axes
    ax.axhline(y=0, color='k', linewidth=1.5)
    ax.axvline(x=0, color='k', linewidth=1.5)

    # Grid
    if show_grid:
        ax.grid(True, alpha=0.3)

    # Plot inequality shading if specified
    if inequality:
        m = float(inequality.get('slope', 1))
        b = float(inequality.get('yIntercept', 0))
        ineq_type = inequality.get('type', 'greater')
        inclusive = inequality.get('inclusive', False)

        # Create mesh for shading
        x_vals = np.linspace(-x_range, x_range, 300)
        y_line = m * x_vals + b

        # Shade the appropriate region
        if ineq_type == 'greater':
            ax.fill_between(x_vals, y_line, y_range, alpha=0.3, color='lightblue',
                           label=f'y {"≥" if inclusive else ">"} {m}x + {b}')
        else:  # less
            ax.fill_between(x_vals, y_line, -y_range, alpha=0.3, color='lightblue',
                           label=f'y {"≤" if inclusive else "<"} {m}x + {b}')

        # Draw the boundary line
        line_style = '-' if inclusive else '--'
        ax.plot(x_vals, y_line, line_style, color='blue', linewidth=2.5)

    # Plot lines
    for line in lines:
        if 'slope' in line and 'yIntercept' in line:
            # y = mx + b
            m = float(line['slope'])
            b = float(line['yIntercept'])
            x_vals = np.linspace(-x_range, x_range, 100)
            y_vals = m * x_vals + b
            label = line.get('label', f'y = {m}x + {b}')
            color = line.get('color', 'blue')
            ax.plot(x_vals, y_vals, color=color, linewidth=2.5, label=label)
        elif 'points' in line:
            # Line through two points
            pts = line['points']
            if len(pts) >= 2:
                x1, y1 = pts[0]
                x2, y2 = pts[1]
                color = line.get('color', 'blue')
                ax.plot([x1, x2], [y1, y2], color=color, linewidth=2.5)

    # Plot points
    for point in points:
        x = float(point.get('x', 0))
        y = float(point.get('y', 0))
        label = point.get('label', '')
        color = point.get('color', 'red')

        ax.plot(x, y, 'o', color=color, markersize=10)
        if label:
            ax.annotate(label, xy=(x, y), xytext=(x+0.5, y+0.5),
                       fontsize=12, fontweight='bold',
                       bbox=dict(boxstyle='round,pad=0.3', facecolor='yellow', alpha=0.7))

    ax.set_xlim(-x_range, x_range)
    ax.set_ylim(-y_range, y_range)
    ax.set_xlabel('x', fontsize=12, fontweight='bold')
    ax.set_ylabel('y', fontsize=12, fontweight='bold')

    title = 'Coordinate Plane'
    if inequality:
        m = float(inequality.get('slope', 1))
        b = float(inequality.get('yIntercept', 0))
        ineq_type = inequality.get('type', 'greater')
        inclusive = inequality.get('inclusive', False)
        symbol = '>=' if (ineq_type == 'greater' and inclusive) else \
                 '>' if ineq_type == 'greater' else \
                 '<=' if inclusive else '<'
        title = f'Linear Inequality: y {symbol} {m}x + {b}'

    ax.set_title(title, fontsize=14, fontweight='bold')
    ax.set_aspect('equal')

    if lines or inequality:
        ax.legend(fontsize=10, loc='best')

    return fig

def generate_angle(params):
    """
    Generate an angle diagram
    params: {degrees, label, showMeasure}
    """
    degrees = float(params.get('degrees', 45))
    label = params.get('label', 'θ')
    show_measure = params.get('showMeasure', True)

    fig, ax = plt.subplots(figsize=(6, 6))

    # Draw two rays forming the angle
    ray_length = 4
    # First ray (horizontal)
    ax.plot([0, ray_length], [0, 0], 'b-', linewidth=3)
    # Second ray (at angle)
    rad = math.radians(degrees)
    x_end = ray_length * math.cos(rad)
    y_end = ray_length * math.sin(rad)
    ax.plot([0, x_end], [0, y_end], 'b-', linewidth=3)

    # Draw arc showing angle
    arc = Wedge((0, 0), 1, 0, degrees, facecolor='yellow', alpha=0.3, edgecolor='red', linewidth=2)
    ax.add_patch(arc)

    # Label the angle
    label_rad = math.radians(degrees / 2)
    label_x = 1.5 * math.cos(label_rad)
    label_y = 1.5 * math.sin(label_rad)

    if show_measure:
        ax.text(label_x, label_y, f'{label} = {degrees}°',
               ha='center', fontsize=14, fontweight='bold',
               bbox=dict(boxstyle='round,pad=0.5', facecolor='lightblue', alpha=0.8))
    else:
        ax.text(label_x, label_y, label,
               ha='center', fontsize=14, fontweight='bold')

    ax.set_xlim(-1, ray_length + 1)
    ax.set_ylim(-1, ray_length + 1)
    ax.set_aspect('equal')
    ax.axis('off')
    ax.set_title(f'Angle Diagram', fontsize=14, fontweight='bold')

    return fig

def fig_to_base64_png(fig):
    """Convert matplotlib figure to base64 PNG"""
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=150, bbox_inches='tight', facecolor='white')
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
    plt.close(fig)
    return img_base64

def generate_diagram(diagram_type, params):
    """
    Main function to generate diagrams
    Returns base64-encoded PNG
    """
    try:
        if diagram_type == 'parabola':
            fig = generate_parabola(params)
        elif diagram_type == 'triangle':
            fig = generate_triangle(params)
        elif diagram_type == 'number_line':
            fig = generate_number_line(params)
        elif diagram_type == 'coordinate_plane':
            fig = generate_coordinate_plane(params)
        elif diagram_type == 'angle':
            fig = generate_angle(params)
        else:
            raise ValueError(f"Unknown diagram type: {diagram_type}")

        return fig_to_base64_png(fig)

    except Exception as e:
        print(f"Error generating diagram: {str(e)}", file=sys.stderr)
        raise

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: diagramGenerator.py '<json_input>'", file=sys.stderr)
        sys.exit(1)

    try:
        input_data = json.loads(sys.argv[1])
        diagram_type = input_data.get('type')
        params = input_data.get('params', {})

        base64_image = generate_diagram(diagram_type, params)
        print(base64_image)

    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)
