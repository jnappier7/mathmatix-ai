const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const CharacterRig = require('../models/characterRig');
const riggingProcessor = require('../utils/characterRiggingProcessor');
const archiver = require('archiver');

// Configure multer for file uploads
const upload = multer({
    storage: multer.diskStorage({
        destination: '/tmp',
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, 'character-' + uniqueSuffix + path.extname(file.originalname));
        }
    }),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB max
    },
    fileFilter: (req, file, cb) => {
        // Accept only PNG images
        if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg') {
            cb(null, true);
        } else {
            cb(new Error('Only PNG and JPEG images are allowed'));
        }
    }
});

/**
 * POST /api/character-rigging/upload
 * Upload a character image to start a rigging session
 */
router.post('/upload', upload.single('character'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        // Read the uploaded file
        const imageBuffer = await fs.readFile(req.file.path);

        // Load image to get dimensions
        const image = await riggingProcessor.loadImageFromBuffer(imageBuffer);

        // Create a new character rig session
        const characterRig = new CharacterRig({
            userId: req.user._id,
            characterName: req.body.characterName || 'Untitled Character',
            originalImagePath: req.file.path,
            imageBuffer: imageBuffer,
            imageWidth: image.width,
            imageHeight: image.height,
            status: 'uploaded'
        });

        await characterRig.save();

        // Clean up temp file (but keep it referenced in DB)
        // await fs.unlink(req.file.path);

        res.json({
            success: true,
            sessionId: characterRig.sessionId,
            characterName: characterRig.characterName,
            imageWidth: image.width,
            imageHeight: image.height,
            message: 'Character image uploaded successfully'
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            error: 'Failed to upload character image',
            details: error.message
        });
    }
});

/**
 * GET /api/character-rigging/session/:sessionId
 * Get rigging session details
 */
router.get('/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const rig = await CharacterRig.findOne({
            sessionId,
            userId: req.user._id
        }).select('-imageBuffer -segmentedParts.imageData');

        if (!rig) {
            return res.status(404).json({ error: 'Rigging session not found' });
        }

        res.json({
            success: true,
            session: rig
        });

    } catch (error) {
        console.error('Session fetch error:', error);
        res.status(500).json({
            error: 'Failed to fetch rigging session',
            details: error.message
        });
    }
});

/**
 * GET /api/character-rigging/image/:sessionId
 * Get the original character image
 */
router.get('/image/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const rig = await CharacterRig.findOne({
            sessionId,
            userId: req.user._id
        }).select('imageBuffer');

        if (!rig || !rig.imageBuffer) {
            return res.status(404).json({ error: 'Image not found' });
        }

        res.set('Content-Type', 'image/png');
        res.send(rig.imageBuffer);

    } catch (error) {
        console.error('Image fetch error:', error);
        res.status(500).json({
            error: 'Failed to fetch image',
            details: error.message
        });
    }
});

/**
 * POST /api/character-rigging/save-rig
 * Save rigging points and bone connections
 */
router.post('/save-rig', async (req, res) => {
    try {
        const { sessionId, rigPoints, boneConnections } = req.body;

        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!sessionId || !rigPoints) {
            return res.status(400).json({ error: 'Session ID and rig points are required' });
        }

        const rig = await CharacterRig.findOne({
            sessionId,
            userId: req.user._id
        });

        if (!rig) {
            return res.status(404).json({ error: 'Rigging session not found' });
        }

        // Update rig data
        rig.rigPoints = rigPoints;
        rig.boneConnections = boneConnections || [];
        rig.status = 'rigging';
        await rig.save();

        res.json({
            success: true,
            message: 'Rig saved successfully'
        });

    } catch (error) {
        console.error('Save rig error:', error);
        res.status(500).json({
            error: 'Failed to save rig',
            details: error.message
        });
    }
});

/**
 * POST /api/character-rigging/segment
 * Segment the character based on rigging points
 */
router.post('/segment', async (req, res) => {
    try {
        const { sessionId } = req.body;

        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const rig = await CharacterRig.findOne({
            sessionId,
            userId: req.user._id
        });

        if (!rig) {
            return res.status(404).json({ error: 'Rigging session not found' });
        }

        if (!rig.rigPoints || rig.rigPoints.length === 0) {
            return res.status(400).json({ error: 'No rigging points defined. Please add rigging points first.' });
        }

        // Segment the character
        const segments = await riggingProcessor.segmentCharacter(
            rig.imageBuffer,
            rig.rigPoints,
            rig.boneConnections
        );

        // Save segmented parts
        rig.segmentedParts = segments;
        rig.status = 'segmented';
        await rig.save();

        res.json({
            success: true,
            message: 'Character segmented successfully',
            segmentCount: segments.length,
            segments: segments.map(s => ({
                name: s.name,
                bounds: s.bounds,
                pointCount: s.points.length
            }))
        });

    } catch (error) {
        console.error('Segmentation error:', error);
        res.status(500).json({
            error: 'Failed to segment character',
            details: error.message
        });
    }
});

/**
 * GET /api/character-rigging/preview/:sessionId
 * Get a preview image showing rigging points and bones
 */
router.get('/preview/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const rig = await CharacterRig.findOne({
            sessionId,
            userId: req.user._id
        });

        if (!rig) {
            return res.status(404).json({ error: 'Rigging session not found' });
        }

        const previewBuffer = await riggingProcessor.createRigPreview(
            rig.imageBuffer,
            rig.rigPoints || [],
            rig.boneConnections || []
        );

        res.set('Content-Type', 'image/png');
        res.send(previewBuffer);

    } catch (error) {
        console.error('Preview generation error:', error);
        res.status(500).json({
            error: 'Failed to generate preview',
            details: error.message
        });
    }
});

/**
 * GET /api/character-rigging/download/:sessionId
 * Download segmented parts as a ZIP file
 */
router.get('/download/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const rig = await CharacterRig.findOne({
            sessionId,
            userId: req.user._id
        });

        if (!rig) {
            return res.status(404).json({ error: 'Rigging session not found' });
        }

        if (!rig.segmentedParts || rig.segmentedParts.length === 0) {
            return res.status(400).json({ error: 'No segmented parts available. Please segment the character first.' });
        }

        // Create ZIP archive
        const archive = archiver('zip', {
            zlib: { level: 9 } // Maximum compression
        });

        // Set response headers
        res.attachment(`${rig.characterName}-rigged-parts.zip`);
        res.set('Content-Type', 'application/zip');

        // Pipe archive to response
        archive.pipe(res);

        // Add each segment as a file
        rig.segmentedParts.forEach(segment => {
            archive.append(segment.imageData, {
                name: `${segment.name}.png`
            });
        });

        // Add metadata file
        const metadata = {
            characterName: rig.characterName,
            createdAt: rig.createdAt,
            imageWidth: rig.imageWidth,
            imageHeight: rig.imageHeight,
            rigPoints: rig.rigPoints,
            boneConnections: rig.boneConnections,
            segments: rig.segmentedParts.map(s => ({
                name: s.name,
                bounds: s.bounds,
                points: s.points
            }))
        };

        archive.append(JSON.stringify(metadata, null, 2), {
            name: 'rigging-data.json'
        });

        // Finalize the archive
        await archive.finalize();

        // Update status
        rig.status = 'exported';
        await rig.save();

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({
            error: 'Failed to download segmented parts',
            details: error.message
        });
    }
});

/**
 * GET /api/character-rigging/my-sessions
 * Get all rigging sessions for the current user
 */
router.get('/my-sessions', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const sessions = await CharacterRig.find({
            userId: req.user._id
        })
        .select('-imageBuffer -segmentedParts.imageData')
        .sort({ createdAt: -1 })
        .limit(50);

        res.json({
            success: true,
            sessions
        });

    } catch (error) {
        console.error('Sessions fetch error:', error);
        res.status(500).json({
            error: 'Failed to fetch sessions',
            details: error.message
        });
    }
});

/**
 * DELETE /api/character-rigging/session/:sessionId
 * Delete a rigging session
 */
router.delete('/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const rig = await CharacterRig.findOneAndDelete({
            sessionId,
            userId: req.user._id
        });

        if (!rig) {
            return res.status(404).json({ error: 'Rigging session not found' });
        }

        // Clean up temp file if it exists
        if (rig.originalImagePath) {
            try {
                await fs.unlink(rig.originalImagePath);
            } catch (err) {
                // File might already be deleted, ignore error
            }
        }

        res.json({
            success: true,
            message: 'Rigging session deleted successfully'
        });

    } catch (error) {
        console.error('Delete session error:', error);
        res.status(500).json({
            error: 'Failed to delete session',
            details: error.message
        });
    }
});

module.exports = router;
