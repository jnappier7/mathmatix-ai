const { createCanvas, loadImage } = require('canvas');
const fs = require('fs').promises;
const path = require('path');

/**
 * Character Rigging Processor
 * Handles image segmentation and body part extraction for animation rigging
 */

class CharacterRiggingProcessor {
    constructor() {
        this.defaultSegments = {
            head: ['head', 'neck'],
            leftArm: ['left_shoulder', 'left_elbow', 'left_wrist', 'left_hand'],
            rightArm: ['right_shoulder', 'right_elbow', 'right_wrist', 'right_hand'],
            torso: ['neck', 'left_shoulder', 'right_shoulder', 'left_hip', 'right_hip'],
            leftLeg: ['left_hip', 'left_knee', 'left_ankle', 'left_foot'],
            rightLeg: ['right_hip', 'right_knee', 'right_ankle', 'right_foot']
        };
    }

    /**
     * Load image from buffer or file path
     */
    async loadImageFromBuffer(buffer) {
        try {
            return await loadImage(buffer);
        } catch (error) {
            throw new Error(`Failed to load image: ${error.message}`);
        }
    }

    /**
     * Detect if image has a solid background color
     */
    detectSolidBackground(imageData) {
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;

        // Sample pixels from corners and edges
        const samplePoints = [
            [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1], // Corners
            [Math.floor(width / 2), 0], [Math.floor(width / 2), height - 1], // Top/bottom middle
            [0, Math.floor(height / 2)], [width - 1, Math.floor(height / 2)] // Left/right middle
        ];

        const colors = [];
        for (const [x, y] of samplePoints) {
            const idx = (y * width + x) * 4;
            colors.push({
                r: data[idx],
                g: data[idx + 1],
                b: data[idx + 2],
                a: data[idx + 3]
            });
        }

        // Check if all sampled colors are similar
        const firstColor = colors[0];
        const tolerance = 30;

        const isSimilar = colors.every(color => {
            return Math.abs(color.r - firstColor.r) <= tolerance &&
                   Math.abs(color.g - firstColor.g) <= tolerance &&
                   Math.abs(color.b - firstColor.b) <= tolerance &&
                   Math.abs(color.a - firstColor.a) <= tolerance;
        });

        if (isSimilar) {
            return firstColor;
        }

        return null;
    }

    /**
     * Remove solid background from image
     */
    async removeBackground(imageBuffer) {
        const image = await this.loadImageFromBuffer(imageBuffer);
        const canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');

        ctx.drawImage(image, 0, 0);
        const imageData = ctx.getImageData(0, 0, image.width, image.height);

        // Detect background color
        const bgColor = this.detectSolidBackground(imageData);

        if (!bgColor) {
            // No solid background detected, return original
            return {
                buffer: imageBuffer,
                hadBackground: false
            };
        }

        // Remove background by making similar pixels transparent
        const data = imageData.data;
        const tolerance = 40; // Slightly higher tolerance for edge pixels

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            const colorDiff = Math.abs(r - bgColor.r) +
                             Math.abs(g - bgColor.g) +
                             Math.abs(b - bgColor.b);

            if (colorDiff <= tolerance) {
                data[i + 3] = 0; // Make transparent
            }
        }

        ctx.putImageData(imageData, 0, 0);

        return {
            buffer: canvas.toBuffer('image/png'),
            hadBackground: true,
            backgroundColor: bgColor
        };
    }

    /**
     * Calculate bounding box for a set of points with padding
     */
    calculateBoundingBox(points, padding = 20) {
        if (!points || points.length === 0) {
            return null;
        }

        const xs = points.map(p => p.x);
        const ys = points.map(p => p.y);

        return {
            x: Math.max(0, Math.min(...xs) - padding),
            y: Math.max(0, Math.min(...ys) - padding),
            width: Math.max(...xs) - Math.min(...xs) + (padding * 2),
            height: Math.max(...ys) - Math.min(...ys) + (padding * 2)
        };
    }

    /**
     * Flood fill algorithm to find connected region from a start point
     * Now with distance constraints and lower tolerance for precise segmentation
     */
    floodFill(imageData, startX, startY, width, height, visited = new Set(), maxDistance = 200, isHeadSegment = false) {
        const queue = [[Math.floor(startX), Math.floor(startY)]];
        const pixels = [];
        const tolerance = 15; // Much lower color tolerance for precise cuts

        // Get the start pixel color and alpha
        const startIdx = (Math.floor(startY) * width + Math.floor(startX)) * 4;
        const startR = imageData.data[startIdx];
        const startG = imageData.data[startIdx + 1];
        const startB = imageData.data[startIdx + 2];
        const startA = imageData.data[startIdx + 3];

        // If starting on transparent pixel, we need to find opaque pixels nearby
        const checkTransparency = startA < 128;

        const isWithinBounds = (x, y) => x >= 0 && x < width && y >= 0 && y < height;

        // Check if pixel is within max distance from start point
        // For head segments, be more lenient going upward to catch the top of the head
        const isWithinDistance = (x, y) => {
            const dx = x - startX;
            const dy = y - startY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (isHeadSegment && dy < 0) {
                // Going upward from head point - allow 2x distance to catch full head
                return distance <= maxDistance * 2;
            } else if (isHeadSegment && dy > 30) {
                // Going downward from head point - restrict heavily to stop at neck
                return distance <= maxDistance * 0.5;
            }

            return distance <= maxDistance;
        };

        const isSimilarColor = (idx) => {
            const r = imageData.data[idx];
            const g = imageData.data[idx + 1];
            const b = imageData.data[idx + 2];
            const a = imageData.data[idx + 3];

            // If we're looking for transparent areas, check alpha
            if (checkTransparency) {
                return a < 128; // Transparent
            }

            // For opaque pixels, check if alpha is high enough and color is similar
            if (a < 128) return false; // Skip transparent pixels

            const colorDiff = Math.abs(r - startR) + Math.abs(g - startG) + Math.abs(b - startB);
            return colorDiff <= tolerance;
        };

        // Check for strong edges (color discontinuity) that should stop flood fill
        const isStrongEdge = (x, y) => {
            if (!isWithinBounds(x, y)) return true;

            const idx = (y * width + x) * 4;
            const r = imageData.data[idx];
            const g = imageData.data[idx + 1];
            const b = imageData.data[idx + 2];

            // Check neighbors for sharp color changes
            const neighbors = [
                [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]
            ];

            for (const [nx, ny] of neighbors) {
                if (isWithinBounds(nx, ny)) {
                    const nIdx = (ny * width + nx) * 4;
                    const nr = imageData.data[nIdx];
                    const ng = imageData.data[nIdx + 1];
                    const nb = imageData.data[nIdx + 2];

                    const edgeDiff = Math.abs(r - nr) + Math.abs(g - ng) + Math.abs(b - nb);
                    if (edgeDiff > 80) return true; // Strong edge detected
                }
            }
            return false;
        };

        while (queue.length > 0) {
            const [x, y] = queue.shift();
            const key = `${x},${y}`;

            if (visited.has(key) || !isWithinBounds(x, y) || !isWithinDistance(x, y)) continue;
            visited.add(key);

            const idx = (y * width + x) * 4;

            if (!checkTransparency && !isSimilarColor(idx)) continue;
            if (checkTransparency && imageData.data[idx + 3] >= 128) continue;

            // Don't cross strong edges
            if (isStrongEdge(x, y)) continue;

            pixels.push({ x, y });

            // Add neighbors (4-directional)
            queue.push([x + 1, y]);
            queue.push([x - 1, y]);
            queue.push([x, y + 1]);
            queue.push([x, y - 1]);
        }

        return pixels;
    }

    /**
     * Detect overlapping regions between segments
     */
    detectOverlaps(segments) {
        const overlaps = [];

        for (let i = 0; i < segments.length; i++) {
            for (let j = i + 1; j < segments.length; j++) {
                const seg1 = segments[i];
                const seg2 = segments[j];

                // Check if bounding boxes overlap
                const bounds1 = seg1.bounds;
                const bounds2 = seg2.bounds;

                const overlapX = Math.max(0, Math.min(bounds1.x + bounds1.width, bounds2.x + bounds2.width) - Math.max(bounds1.x, bounds2.x));
                const overlapY = Math.max(0, Math.min(bounds1.y + bounds1.height, bounds2.y + bounds2.height) - Math.max(bounds1.y, bounds2.y));

                if (overlapX > 0 && overlapY > 0) {
                    overlaps.push({
                        segment1: seg1.name,
                        segment2: seg2.name,
                        overlapArea: overlapX * overlapY,
                        overlapPercent: (overlapX * overlapY) / Math.min(bounds1.width * bounds1.height, bounds2.width * bounds2.height) * 100
                    });
                }
            }
        }

        return overlaps;
    }

    /**
     * Resolve overlapping segments by assigning pixels to the nearest rigging point
     */
    async resolveOverlaps(image, segments) {
        if (segments.length < 2) return segments;

        // Create a full canvas
        const fullCanvas = createCanvas(image.width, image.height);
        const fullCtx = fullCanvas.getContext('2d');
        fullCtx.drawImage(image, 0, 0);
        const imageData = fullCtx.getImageData(0, 0, image.width, image.height);

        // Build a pixel ownership map based on distance to nearest rigging point
        const pixelOwnership = new Map();

        for (const segment of segments) {
            const segmentPixels = this.getSegmentPixels(segment);

            for (const pixelKey of segmentPixels) {
                const [x, y] = pixelKey.split(',').map(Number);

                // Find distance to nearest rigging point in this segment
                let minDist = Infinity;
                for (const point of segment.points) {
                    const dist = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2));
                    minDist = Math.min(minDist, dist);
                }

                // Check if this pixel is claimed by another segment
                const existing = pixelOwnership.get(pixelKey);
                if (!existing || existing.distance > minDist) {
                    pixelOwnership.set(pixelKey, {
                        segment: segment.name,
                        distance: minDist
                    });
                }
            }
        }

        // Rebuild segments based on pixel ownership
        const resolvedSegments = [];

        for (const segment of segments) {
            const ownedPixels = new Set();

            for (const [pixelKey, ownership] of pixelOwnership.entries()) {
                if (ownership.segment === segment.name) {
                    ownedPixels.add(pixelKey);
                }
            }

            if (ownedPixels.size > 0) {
                const pixelArray = Array.from(ownedPixels).map(key => {
                    const [x, y] = key.split(',').map(Number);
                    return { x, y };
                });

                const xs = pixelArray.map(p => p.x);
                const ys = pixelArray.map(p => p.y);
                const minX = Math.min(...xs);
                const maxX = Math.max(...xs);
                const minY = Math.min(...ys);
                const maxY = Math.max(...ys);

                const width = maxX - minX + 1;
                const height = maxY - minY + 1;

                const outputCanvas = createCanvas(width, height);
                const outputCtx = outputCanvas.getContext('2d');
                const outputImageData = outputCtx.createImageData(width, height);

                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const srcX = x + minX;
                        const srcY = y + minY;
                        const key = `${srcX},${srcY}`;

                        if (ownedPixels.has(key)) {
                            const srcIdx = (srcY * image.width + srcX) * 4;
                            const dstIdx = (y * width + x) * 4;

                            outputImageData.data[dstIdx] = imageData.data[srcIdx];
                            outputImageData.data[dstIdx + 1] = imageData.data[srcIdx + 1];
                            outputImageData.data[dstIdx + 2] = imageData.data[srcIdx + 2];
                            outputImageData.data[dstIdx + 3] = imageData.data[srcIdx + 3];
                        }
                    }
                }

                outputCtx.putImageData(outputImageData, 0, 0);

                resolvedSegments.push({
                    ...segment,
                    imageData: outputCanvas.toBuffer('image/png'),
                    bounds: { x: minX, y: minY, width, height },
                    overlapResolved: true
                });
            }
        }

        return resolvedSegments;
    }

    /**
     * Get pixel coordinates for a segment
     */
    getSegmentPixels(segment) {
        const pixels = new Set();
        const bounds = segment.bounds;

        // This is a simplified version - in practice, we'd decode the imageData
        // For now, assume all pixels in bounds belong to segment
        for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
            for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
                pixels.add(`${x},${y}`);
            }
        }

        return pixels;
    }

    /**
     * Extract connected region around rigging points using flood fill
     */
    async extractSegmentFloodFill(image, rigPoints, segmentName = '') {
        // Create a canvas to analyze the image
        const fullCanvas = createCanvas(image.width, image.height);
        const fullCtx = fullCanvas.getContext('2d');
        fullCtx.drawImage(image, 0, 0);
        const imageData = fullCtx.getImageData(0, 0, image.width, image.height);

        // Determine appropriate max distance based on segment type
        let maxDistance = 150; // Default
        const lowerName = segmentName.toLowerCase();
        const isHeadSegment = lowerName.includes('head');

        if (isHeadSegment) {
            maxDistance = 90; // Medium distance for head, directional logic will handle up/down
        } else if (lowerName.includes('neck')) {
            maxDistance = 60; // Very small for neck
        } else if (lowerName.includes('hand') || lowerName.includes('foot')) {
            maxDistance = 70; // Small for extremities
        } else if (lowerName.includes('arm') || lowerName.includes('leg')) {
            maxDistance = 120; // Medium for limbs
        } else if (lowerName.includes('torso') || lowerName.includes('body')) {
            maxDistance = 180; // Larger for torso
        }

        // Collect all pixels that belong to this segment
        const visited = new Set();
        const allSegmentPixels = new Set();

        // Start flood fill from each rigging point with distance constraint
        for (const point of rigPoints) {
            const pixels = this.floodFill(imageData, point.x, point.y, image.width, image.height, visited, maxDistance, isHeadSegment);
            pixels.forEach(p => allSegmentPixels.add(`${p.x},${p.y}`));
        }

        // If we got very few pixels, the rigging points might be on transparent areas
        // Try expanding outward from the points
        if (allSegmentPixels.size < 100) {
            for (const point of rigPoints) {
                // Sample pixels in a small radius to find opaque pixels
                for (let radius = 5; radius <= 50; radius += 5) {
                    const angles = 8;
                    for (let i = 0; i < angles; i++) {
                        const angle = (i / angles) * Math.PI * 2;
                        const x = Math.floor(point.x + Math.cos(angle) * radius);
                        const y = Math.floor(point.y + Math.sin(angle) * radius);

                        if (x >= 0 && x < image.width && y >= 0 && y < image.height) {
                            const idx = (y * image.width + x) * 4;
                            const alpha = imageData.data[idx + 3];

                            // If we found an opaque pixel, flood fill from there
                            if (alpha >= 128 && !visited.has(`${x},${y}`)) {
                                const pixels = this.floodFill(imageData, x, y, image.width, image.height, visited, maxDistance, isHeadSegment);
                                pixels.forEach(p => allSegmentPixels.add(`${p.x},${p.y}`));

                                if (allSegmentPixels.size > 100) break;
                            }
                        }
                    }
                    if (allSegmentPixels.size > 100) break;
                }
            }
        }

        // Convert set back to array of pixels
        const pixelArray = Array.from(allSegmentPixels).map(key => {
            const [x, y] = key.split(',').map(Number);
            return { x, y };
        });

        if (pixelArray.length === 0) {
            // Fallback to bounding box if flood fill failed
            return null;
        }

        // Calculate tight bounding box
        const xs = pixelArray.map(p => p.x);
        const ys = pixelArray.map(p => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const width = maxX - minX + 1;
        const height = maxY - minY + 1;

        // Create output canvas
        const outputCanvas = createCanvas(width, height);
        const outputCtx = outputCanvas.getContext('2d');

        // Create a mask of which pixels to include
        const mask = new Set(allSegmentPixels);

        // Copy only the pixels in the mask
        const outputImageData = outputCtx.createImageData(width, height);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const srcX = x + minX;
                const srcY = y + minY;
                const key = `${srcX},${srcY}`;

                if (mask.has(key)) {
                    const srcIdx = (srcY * image.width + srcX) * 4;
                    const dstIdx = (y * width + x) * 4;

                    outputImageData.data[dstIdx] = imageData.data[srcIdx];
                    outputImageData.data[dstIdx + 1] = imageData.data[srcIdx + 1];
                    outputImageData.data[dstIdx + 2] = imageData.data[srcIdx + 2];
                    outputImageData.data[dstIdx + 3] = imageData.data[srcIdx + 3];
                }
            }
        }

        outputCtx.putImageData(outputImageData, 0, 0);

        return {
            buffer: outputCanvas.toBuffer('image/png'),
            bounds: { x: minX, y: minY, width, height }
        };
    }

    /**
     * Extract a segment from the original image based on bounding box
     * This is the fallback method if flood fill doesn't work well
     */
    async extractSegment(image, bounds, segmentPoints) {
        const canvas = createCanvas(bounds.width, bounds.height);
        const ctx = canvas.getContext('2d');

        // Enable transparency
        ctx.clearRect(0, 0, bounds.width, bounds.height);

        // Create a clipping path based on the segment points (polygon)
        if (segmentPoints && segmentPoints.length > 2) {
            ctx.save();
            ctx.beginPath();

            // Create polygon from points
            segmentPoints.forEach((point, index) => {
                const x = point.x - bounds.x;
                const y = point.y - bounds.y;
                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            ctx.closePath();
            ctx.clip();
        }

        // Draw the portion of the original image
        ctx.drawImage(
            image,
            bounds.x, bounds.y, bounds.width, bounds.height,
            0, 0, bounds.width, bounds.height
        );

        if (segmentPoints && segmentPoints.length > 2) {
            ctx.restore();
        }

        return canvas.toBuffer('image/png');
    }

    /**
     * Create a polygon hull around points for better segmentation
     */
    createConvexHull(points) {
        if (points.length < 3) return points;

        // Simple convex hull algorithm (Graham scan)
        const sorted = [...points].sort((a, b) => {
            if (a.x === b.x) return a.y - b.y;
            return a.x - b.x;
        });

        const cross = (o, a, b) => {
            return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
        };

        const lower = [];
        for (const point of sorted) {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
                lower.pop();
            }
            lower.push(point);
        }

        const upper = [];
        for (let i = sorted.length - 1; i >= 0; i--) {
            const point = sorted[i];
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
                upper.pop();
            }
            upper.push(point);
        }

        upper.pop();
        lower.pop();
        return lower.concat(upper);
    }

    /**
     * Segment the character image based on rigging points and bone connections
     * Uses intelligent flood-fill for pixel-perfect cuts on transparent backgrounds
     */
    async segmentCharacter(imageBuffer, rigPoints, boneConnections) {
        const image = await this.loadImageFromBuffer(imageBuffer);
        const segments = [];

        // Group points by body parts based on bone connections
        const bodyParts = this.groupPointsByBodyPart(rigPoints, boneConnections);

        for (const [partName, points] of Object.entries(bodyParts)) {
            if (points.length === 0) continue;

            try {
                // Try flood fill segmentation first (best for transparent backgrounds)
                const floodFillResult = await this.extractSegmentFloodFill(image, points, partName);

                if (floodFillResult && floodFillResult.buffer) {
                    // Flood fill succeeded - use pixel-perfect cut
                    segments.push({
                        name: partName,
                        imageData: floodFillResult.buffer,
                        bounds: floodFillResult.bounds,
                        points: points.map(p => ({ x: p.x, y: p.y, label: p.label })),
                        method: 'flood-fill'
                    });
                } else {
                    // Fallback to convex hull method
                    console.log(`Flood fill failed for ${partName}, using convex hull fallback`);

                    const hull = points.length > 2 ? this.createConvexHull(points) : points;
                    const bounds = this.calculateBoundingBox(hull, 30);

                    if (bounds) {
                        const segmentBuffer = await this.extractSegment(image, bounds, hull);

                        segments.push({
                            name: partName,
                            imageData: segmentBuffer,
                            bounds: bounds,
                            points: points.map(p => ({ x: p.x, y: p.y, label: p.label })),
                            method: 'convex-hull'
                        });
                    }
                }
            } catch (error) {
                console.error(`Failed to extract segment ${partName}:`, error);

                // Last resort fallback
                try {
                    const hull = points.length > 2 ? this.createConvexHull(points) : points;
                    const bounds = this.calculateBoundingBox(hull, 30);

                    if (bounds) {
                        const segmentBuffer = await this.extractSegment(image, bounds, hull);

                        segments.push({
                            name: partName,
                            imageData: segmentBuffer,
                            bounds: bounds,
                            points: points.map(p => ({ x: p.x, y: p.y, label: p.label })),
                            method: 'convex-hull-fallback'
                        });
                    }
                } catch (fallbackError) {
                    console.error(`All segmentation methods failed for ${partName}:`, fallbackError);
                }
            }
        }

        return segments;
    }

    /**
     * Group rigging points by body part based on connections
     */
    groupPointsByBodyPart(rigPoints, boneConnections) {
        const bodyParts = {};
        const pointMap = new Map(rigPoints.map(p => [p.id, p]));

        // If no connections provided, use default groupings
        if (!boneConnections || boneConnections.length === 0) {
            return this.groupByDefaultSegments(rigPoints);
        }

        // Build a graph of connections
        const graph = new Map();
        boneConnections.forEach(conn => {
            if (!graph.has(conn.from)) graph.set(conn.from, []);
            if (!graph.has(conn.to)) graph.set(conn.to, []);
            graph.get(conn.from).push({ to: conn.to, segment: conn.segmentName });
            graph.get(conn.to).push({ to: conn.from, segment: conn.segmentName });
        });

        // Group points by segment name
        const visited = new Set();

        boneConnections.forEach(conn => {
            const segmentName = conn.segmentName || 'body';

            if (!bodyParts[segmentName]) {
                bodyParts[segmentName] = [];
            }

            // Add connected points to the segment
            const fromPoint = pointMap.get(conn.from);
            const toPoint = pointMap.get(conn.to);

            if (fromPoint && !visited.has(conn.from)) {
                bodyParts[segmentName].push(fromPoint);
                visited.add(conn.from);
            }

            if (toPoint && !visited.has(conn.to)) {
                bodyParts[segmentName].push(toPoint);
                visited.add(conn.to);
            }
        });

        return bodyParts;
    }

    /**
     * Group points by default body segments if no connections provided
     */
    groupByDefaultSegments(rigPoints) {
        const bodyParts = {
            head: [],
            neck: [],
            torso: [],
            leftArm: [],
            rightArm: [],
            leftLeg: [],
            rightLeg: []
        };

        rigPoints.forEach(point => {
            const label = point.label.toLowerCase();

            if (label.includes('head')) {
                bodyParts.head.push(point);
            } else if (label.includes('neck')) {
                bodyParts.neck.push(point);
            } else if (label.includes('left') && (label.includes('shoulder') || label.includes('elbow') || label.includes('wrist') || label.includes('hand'))) {
                bodyParts.leftArm.push(point);
            } else if (label.includes('right') && (label.includes('shoulder') || label.includes('elbow') || label.includes('wrist') || label.includes('hand'))) {
                bodyParts.rightArm.push(point);
            } else if (label.includes('left') && (label.includes('hip') || label.includes('knee') || label.includes('ankle') || label.includes('foot'))) {
                bodyParts.leftLeg.push(point);
            } else if (label.includes('right') && (label.includes('hip') || label.includes('knee') || label.includes('ankle') || label.includes('foot'))) {
                bodyParts.rightLeg.push(point);
            } else if (label.includes('shoulder') || label.includes('chest') || label.includes('spine') || label.includes('hip')) {
                bodyParts.torso.push(point);
            }
        });

        // Remove empty parts
        return Object.fromEntries(
            Object.entries(bodyParts).filter(([_, points]) => points.length > 0)
        );
    }

    /**
     * Create a preview image showing rigging points and bones
     */
    async createRigPreview(imageBuffer, rigPoints, boneConnections) {
        const image = await this.loadImageFromBuffer(imageBuffer);
        const canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');

        // Draw original image
        ctx.drawImage(image, 0, 0);

        // Draw bone connections
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 3;
        const pointMap = new Map(rigPoints.map(p => [p.id, p]));

        if (boneConnections && boneConnections.length > 0) {
            boneConnections.forEach(conn => {
                const from = pointMap.get(conn.from);
                const to = pointMap.get(conn.to);

                if (from && to) {
                    ctx.beginPath();
                    ctx.moveTo(from.x, from.y);
                    ctx.lineTo(to.x, to.y);
                    ctx.stroke();
                }
            });
        }

        // Draw rigging points
        rigPoints.forEach(point => {
            // Draw point
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.arc(point.x, point.y, 8, 0, 2 * Math.PI);
            ctx.fill();

            // Draw label
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 3;
            ctx.font = 'bold 14px Arial';
            ctx.strokeText(point.label, point.x + 12, point.y + 5);
            ctx.fillText(point.label, point.x + 12, point.y + 5);
        });

        return canvas.toBuffer('image/png');
    }

    /**
     * Export segments as a zip file (requires archiver package)
     */
    async exportSegmentsAsZip(segments, outputPath) {
        // This would require the archiver package
        // For now, we'll just save segments individually
        const dir = path.dirname(outputPath);
        const baseName = path.basename(outputPath, '.zip');

        for (const segment of segments) {
            const filename = path.join(dir, `${baseName}_${segment.name}.png`);
            await fs.writeFile(filename, segment.imageData);
        }

        return true;
    }
}

module.exports = new CharacterRiggingProcessor();
