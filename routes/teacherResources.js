// routes/teacherResources.js
// Routes for teacher file uploads and resource management

const express = require('express');
const router = express.Router();
const TeacherResource = require('../models/teacherResource');
const User = require('../models/user');
const { isAuthenticated, isTeacher } = require('../middleware/auth');
const { validateObjectId } = require('../middleware/validateObjectId');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { extractTextFromPDF } = require('../utils/pdfOcr');
const { performOCR } = require('../utils/ocr');
const { generateEmbedding } = require('../utils/llmGateway'); // DIRECTIVE 3 + CTO REVIEW FIX

// Ensure upload directory exists
const uploadDir = 'uploads/teacher-resources';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const teacherId = req.user._id;
        const teacherDir = path.join(uploadDir, teacherId.toString());

        // Create teacher-specific directory if it doesn't exist
        if (!fs.existsSync(teacherDir)) {
            fs.mkdirSync(teacherDir, { recursive: true });
        }

        cb(null, teacherDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        // Allowed file types
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/webp',
            'image/heic'
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Allowed: PDF, Word, PowerPoint, Images'));
        }
    }
});

// Upload a new resource
router.post('/upload', isAuthenticated, isTeacher, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const { displayName, description, keywords, category } = req.body;

        if (!displayName) {
            // Clean up uploaded file
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ message: 'Display name is required' });
        }

        const fileExt = path.extname(req.file.originalname).toLowerCase().replace('.', '');
        const relativePath = path.relative(uploadDir, req.file.path);

        // Extract text content for searchability
        let extractedText = '';
        try {
            if (req.file.mimetype === 'application/pdf') {
                extractedText = await extractTextFromPDF(req.file.path);
            } else if (req.file.mimetype.startsWith('image/')) {
                const ocrResult = await performOCR(req.file.path);
                extractedText = ocrResult.text || '';
            }
        } catch (error) {
            console.warn('Text extraction failed:', error.message);
            // Continue even if extraction fails
        }

        // Parse keywords
        const keywordArray = keywords
            ? keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k)
            : [];

        // Auto-generate keywords from display name
        const autoKeywords = displayName.toLowerCase().split(/\s+/).filter(k => k.length > 2);
        const allKeywords = [...new Set([...keywordArray, ...autoKeywords])];

        // DIRECTIVE 3: Generate vector embedding for semantic search
        let embedding = null;
        try {
            // Create a combined text for embedding (displayName + description + extracted text)
            const textForEmbedding = [
                displayName,
                description || '',
                extractedText.slice(0, 3000) // First 3000 chars of content
            ].filter(Boolean).join('\n\n');

            if (textForEmbedding.trim().length > 0) {
                console.log(`📊 [Embedding] Generating embedding for "${displayName}"`);
                embedding = await generateEmbedding(textForEmbedding);
            }
        } catch (embeddingError) {
            console.warn(`⚠️ [Embedding] Failed to generate embedding for "${displayName}":`, embeddingError.message);
            // Continue without embedding - can be regenerated later
        }

        // Create resource record
        const resource = new TeacherResource({
            teacherId: req.user._id,
            displayName: displayName.trim(),
            originalFilename: req.file.originalname,
            storedFilename: relativePath,
            fileType: fileExt,
            mimeType: req.file.mimetype,
            fileSize: req.file.size,
            description: description || '',
            keywords: allKeywords,
            category: category || 'other',
            extractedText: extractedText.slice(0, 5000), // Store first 5000 chars
            embedding: embedding, // DIRECTIVE 3: Store embedding vector
            publicUrl: `/uploads/teacher-resources/${relativePath}`
        });

        await resource.save();

        res.json({
            success: true,
            message: 'Resource uploaded successfully',
            resource: {
                id: resource._id,
                displayName: resource.displayName,
                fileType: resource.fileType,
                fileSize: resource.fileSize,
                uploadedAt: resource.uploadedAt
            }
        });

    } catch (error) {
        console.error('Error uploading resource:', error);
        // Clean up file if it exists
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ message: 'Failed to upload resource: ' + error.message });
    }
});

// Get all resources for a teacher
router.get('/list', isAuthenticated, isTeacher, async (req, res) => {
    try {
        const resources = await TeacherResource.find({ teacherId: req.user._id })
            .sort({ uploadedAt: -1 })
            .select('-extractedText'); // Don't send full extracted text

        res.json({
            success: true,
            resources: resources.map(r => ({
                id: r._id,
                displayName: r.displayName,
                originalFilename: r.originalFilename,
                fileType: r.fileType,
                fileSize: r.fileSize,
                category: r.category,
                description: r.description,
                keywords: r.keywords,
                uploadedAt: r.uploadedAt,
                accessCount: r.accessCount,
                publicUrl: r.publicUrl
            }))
        });

    } catch (error) {
        console.error('Error fetching resources:', error);
        res.status(500).json({ message: 'Failed to fetch resources' });
    }
});

// STUDENT ACCESS: Get resources from student's connected teacher
router.get('/my-teacher-resources', isAuthenticated, async (req, res) => {
    try {
        // Check if user is a student and has a connected teacher
        if (req.user.role !== 'student') {
            return res.status(403).json({ message: 'This endpoint is for students only' });
        }

        if (!req.user.teacherId) {
            return res.status(404).json({
                message: 'You are not connected to a teacher yet',
                resources: []
            });
        }

        // Fetch resources from the student's teacher
        const resources = await TeacherResource.find({ teacherId: req.user.teacherId })
            .sort({ uploadedAt: -1 })
            .select('-extractedText'); // Don't send full extracted text

        res.json({
            success: true,
            teacherId: req.user.teacherId,
            resources: resources.map(r => ({
                id: r._id,
                displayName: r.displayName,
                originalFilename: r.originalFilename,
                fileType: r.fileType,
                fileSize: r.fileSize,
                category: r.category,
                description: r.description,
                keywords: r.keywords,
                uploadedAt: r.uploadedAt,
                publicUrl: r.publicUrl
            }))
        });

    } catch (error) {
        console.error('Error fetching teacher resources for student:', error);
        res.status(500).json({ message: 'Failed to fetch teacher resources' });
    }
});

// Search resources
router.get('/search', isAuthenticated, isTeacher, async (req, res) => {
    try {
        const { query } = req.query;

        if (!query || query.trim().length < 2) {
            return res.status(400).json({ message: 'Search query must be at least 2 characters' });
        }

        const resources = await TeacherResource.search(req.user._id, query);

        res.json({
            success: true,
            resources: resources.map(r => ({
                id: r._id,
                displayName: r.displayName,
                fileType: r.fileType,
                category: r.category,
                description: r.description
            }))
        });

    } catch (error) {
        console.error('Error searching resources:', error);
        res.status(500).json({ message: 'Failed to search resources' });
    }
});

// Delete a resource
router.delete('/:id', isAuthenticated, isTeacher, validateObjectId('id'), async (req, res) => {
    try {
        const resource = await TeacherResource.findOne({
            _id: req.params.id,
            teacherId: req.user._id
        });

        if (!resource) {
            return res.status(404).json({ message: 'Resource not found' });
        }

        // Delete the file
        const filePath = path.join(uploadDir, resource.storedFilename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Delete the database record
        await resource.deleteOne();

        res.json({
            success: true,
            message: 'Resource deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting resource:', error);
        res.status(500).json({ message: 'Failed to delete resource' });
    }
});

// Get resource details by ID
router.get('/:id', isAuthenticated, isTeacher, validateObjectId('id'), async (req, res) => {
    try {
        const resource = await TeacherResource.findOne({
            _id: req.params.id,
            teacherId: req.user._id
        });

        if (!resource) {
            return res.status(404).json({ message: 'Resource not found' });
        }

        res.json({
            success: true,
            resource: {
                id: resource._id,
                displayName: resource.displayName,
                originalFilename: resource.originalFilename,
                fileType: resource.fileType,
                mimeType: resource.mimeType,
                fileSize: resource.fileSize,
                category: resource.category,
                description: resource.description,
                keywords: resource.keywords,
                uploadedAt: resource.uploadedAt,
                accessCount: resource.accessCount,
                publicUrl: resource.publicUrl
            }
        });

    } catch (error) {
        console.error('Error fetching resource:', error);
        res.status(500).json({ message: 'Failed to fetch resource' });
    }
});

// STUDENT ACCESS: Download/view a specific resource from their teacher
router.get('/download/:id', isAuthenticated, validateObjectId('id'), async (req, res) => {
    try {
        const resource = await TeacherResource.findById(req.params.id);

        if (!resource) {
            return res.status(404).json({ message: 'Resource not found' });
        }

        // Authorization check: Allow teachers to access their own resources, students to access their teacher's resources
        const isTeacher = req.user.role === 'teacher' && resource.teacherId.toString() === req.user._id.toString();
        const isStudentOfTeacher = req.user.role === 'student' && req.user.teacherId && resource.teacherId.toString() === req.user.teacherId.toString();

        if (!isTeacher && !isStudentOfTeacher) {
            return res.status(403).json({ message: 'You do not have permission to access this resource' });
        }

        // Increment access count
        resource.accessCount = (resource.accessCount || 0) + 1;
        await resource.save();

        // Serve the file
        const filePath = path.join(uploadDir, resource.storedFilename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: 'File not found on server' });
        }

        // Set appropriate headers
        res.setHeader('Content-Disposition', `attachment; filename="${resource.originalFilename}"`);
        res.setHeader('Content-Type', resource.mimeType || 'application/octet-stream');

        // Stream the file
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

    } catch (error) {
        console.error('Error downloading resource:', error);
        res.status(500).json({ message: 'Failed to download resource' });
    }
});

module.exports = router;
