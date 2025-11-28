// routes/curriculum.js
// Curriculum schedule management for teachers

const express = require('express');
const router = express.Router();
const Curriculum = require('../models/curriculum');
const { isAuthenticated, isTeacher } = require('../middleware/auth');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

// Configure multer for file uploads
const upload = multer({
    dest: 'uploads/curriculum/',
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/pdf'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only CSV, Excel, and PDF files are allowed.'));
        }
    }
});

// Get active curriculum for teacher
router.get('/teacher/curriculum', isAuthenticated, isTeacher, async (req, res) => {
    try {
        const curriculum = await Curriculum.getActiveCurriculum(req.user._id);

        if (!curriculum) {
            return res.json({ hasCurriculum: false });
        }

        res.json({
            hasCurriculum: true,
            curriculum: {
                _id: curriculum._id,
                name: curriculum.name,
                courseLevel: curriculum.courseLevel,
                gradeLevel: curriculum.gradeLevel,
                schoolYear: curriculum.schoolYear,
                lessonsCount: curriculum.lessons.length,
                currentLesson: curriculum.getCurrentLesson(),
                lessons: curriculum.lessons.sort((a, b) => a.weekNumber - b.weekNumber),
                autoSyncWithAI: curriculum.autoSyncWithAI
            }
        });
    } catch (error) {
        console.error('Error fetching curriculum:', error);
        res.status(500).json({ message: 'Failed to fetch curriculum' });
    }
});

// Create curriculum manually
router.post('/teacher/curriculum', isAuthenticated, isTeacher, async (req, res) => {
    try {
        const { name, courseLevel, gradeLevel, schoolYear, lessons } = req.body;

        // Deactivate existing curricula
        await Curriculum.deactivateAll(req.user._id);

        const curriculum = new Curriculum({
            teacherId: req.user._id,
            name,
            courseLevel,
            gradeLevel,
            schoolYear,
            lessons: lessons || [],
            importSource: 'manual'
        });

        await curriculum.save();

        res.status(201).json({
            success: true,
            message: 'Curriculum created successfully',
            curriculumId: curriculum._id
        });
    } catch (error) {
        console.error('Error creating curriculum:', error);
        res.status(500).json({ message: 'Failed to create curriculum' });
    }
});

// Update curriculum
router.put('/teacher/curriculum/:id', isAuthenticated, isTeacher, async (req, res) => {
    try {
        const curriculum = await Curriculum.findOne({
            _id: req.params.id,
            teacherId: req.user._id
        });

        if (!curriculum) {
            return res.status(404).json({ message: 'Curriculum not found' });
        }

        const { name, courseLevel, gradeLevel, schoolYear, lessons, autoSyncWithAI } = req.body;

        if (name) curriculum.name = name;
        if (courseLevel) curriculum.courseLevel = courseLevel;
        if (gradeLevel) curriculum.gradeLevel = gradeLevel;
        if (schoolYear) curriculum.schoolYear = schoolYear;
        if (lessons) curriculum.lessons = lessons;
        if (autoSyncWithAI !== undefined) curriculum.autoSyncWithAI = autoSyncWithAI;

        await curriculum.save();

        res.json({
            success: true,
            message: 'Curriculum updated successfully'
        });
    } catch (error) {
        console.error('Error updating curriculum:', error);
        res.status(500).json({ message: 'Failed to update curriculum' });
    }
});

// Delete curriculum
router.delete('/teacher/curriculum/:id', isAuthenticated, isTeacher, async (req, res) => {
    try {
        const result = await Curriculum.findOneAndDelete({
            _id: req.params.id,
            teacherId: req.user._id
        });

        if (!result) {
            return res.status(404).json({ message: 'Curriculum not found' });
        }

        res.json({
            success: true,
            message: 'Curriculum deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting curriculum:', error);
        res.status(500).json({ message: 'Failed to delete curriculum' });
    }
});

// Parse and import curriculum from file
router.post('/teacher/curriculum/parse', isAuthenticated, isTeacher, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const { name, courseLevel, gradeLevel, schoolYear } = req.body;
        const filePath = req.file.path;
        const fileExt = path.extname(req.file.originalname).toLowerCase();

        let lessons = [];

        // Parse CSV file
        if (fileExt === '.csv' || req.file.mimetype === 'text/csv') {
            lessons = await parseCSV(filePath);
        } else {
            // For now, only CSV is supported. PDF/Excel would need additional libraries
            fs.unlinkSync(filePath); // Clean up uploaded file
            return res.status(400).json({
                message: 'Currently only CSV files are supported. Export your schedule as CSV and try again.'
            });
        }

        // Clean up uploaded file
        fs.unlinkSync(filePath);

        if (lessons.length === 0) {
            return res.status(400).json({ message: 'No lessons found in file. Check the format and try again.' });
        }

        // Deactivate existing curricula
        await Curriculum.deactivateAll(req.user._id);

        // Create new curriculum
        const curriculum = new Curriculum({
            teacherId: req.user._id,
            name: name || 'Imported Schedule',
            courseLevel,
            gradeLevel,
            schoolYear,
            lessons,
            importSource: 'csv',
            importedAt: new Date()
        });

        await curriculum.save();

        res.json({
            success: true,
            message: `Successfully imported ${lessons.length} lessons`,
            curriculumId: curriculum._id,
            lessonsCount: lessons.length
        });

    } catch (error) {
        console.error('Error parsing curriculum file:', error);
        // Clean up file if it exists
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ message: 'Failed to parse curriculum file: ' + error.message });
    }
});

// Helper function to parse CSV
function parseCSV(filePath) {
    return new Promise((resolve, reject) => {
        const lessons = [];
        let rowNum = 0;

        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                rowNum++;

                // Expected CSV columns: Week, Start Date, End Date, Topic, Standards, Objectives
                // Can be flexible with column names (case-insensitive)
                const week = row.Week || row.week || row['Week #'] || row['Week Number'] || rowNum;
                const topic = row.Topic || row.topic || row.Unit || row.unit || row.Lesson || row.lesson;

                if (!topic) return; // Skip rows without a topic

                const lesson = {
                    weekNumber: parseInt(week) || rowNum,
                    topic: topic.trim(),
                    startDate: parseDate(row['Start Date'] || row.start || row['Start']),
                    endDate: parseDate(row['End Date'] || row.end || row['End']),
                    standards: parseList(row.Standards || row.standards || row.Standard),
                    objectives: parseList(row.Objectives || row.objectives || row.Objective),
                    keywords: parseList(row.Keywords || row.keywords || row.Tags),
                    notes: row.Notes || row.notes || ''
                };

                lessons.push(lesson);
            })
            .on('end', () => {
                resolve(lessons);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
}

// Helper to parse date strings
function parseDate(dateStr) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
}

// Helper to parse comma-separated lists
function parseList(str) {
    if (!str) return [];
    return str.split(',').map(s => s.trim()).filter(s => s);
}

module.exports = router;
