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
     * Extract a segment from the original image based on bounding box
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
     */
    async segmentCharacter(imageBuffer, rigPoints, boneConnections) {
        const image = await this.loadImageFromBuffer(imageBuffer);
        const segments = [];

        // Group points by body parts based on bone connections
        const bodyParts = this.groupPointsByBodyPart(rigPoints, boneConnections);

        for (const [partName, points] of Object.entries(bodyParts)) {
            if (points.length === 0) continue;

            // Create convex hull for better segmentation
            const hull = points.length > 2 ? this.createConvexHull(points) : points;

            // Calculate bounding box
            const bounds = this.calculateBoundingBox(hull, 30);

            if (!bounds) continue;

            try {
                // Extract the segment
                const segmentBuffer = await this.extractSegment(image, bounds, hull);

                segments.push({
                    name: partName,
                    imageData: segmentBuffer,
                    bounds: bounds,
                    points: points.map(p => ({ x: p.x, y: p.y, label: p.label }))
                });
            } catch (error) {
                console.error(`Failed to extract segment ${partName}:`, error);
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
            torso: [],
            leftArm: [],
            rightArm: [],
            leftLeg: [],
            rightLeg: []
        };

        rigPoints.forEach(point => {
            const label = point.label.toLowerCase();

            if (label.includes('head') || label.includes('neck')) {
                bodyParts.head.push(point);
            } else if (label.includes('left') && (label.includes('shoulder') || label.includes('elbow') || label.includes('wrist') || label.includes('hand'))) {
                bodyParts.leftArm.push(point);
            } else if (label.includes('right') && (label.includes('shoulder') || label.includes('elbow') || label.includes('wrist') || label.includes('hand'))) {
                bodyParts.rightArm.push(point);
            } else if (label.includes('left') && (label.includes('hip') || label.includes('knee') || label.includes('ankle') || label.includes('foot'))) {
                bodyParts.leftLeg.push(point);
            } else if (label.includes('right') && (label.includes('hip') || label.includes('knee') || label.includes('ankle') || label.includes('foot'))) {
                bodyParts.rightLeg.push(point);
            } else {
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
