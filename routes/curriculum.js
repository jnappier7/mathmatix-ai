// routes/curriculum.js
// Curriculum schedule management for teachers

const express = require('express');
const router = express.Router();
const Curriculum = require('../models/curriculum');
const User = require('../models/user');
const { isAuthenticated, isTeacher } = require('../middleware/auth');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const https = require('https');
const http = require('http');

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
                autoSyncWithAI: curriculum.autoSyncWithAI,
                teacherPreferences: curriculum.teacherPreferences || {}
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

        const { name, courseLevel, gradeLevel, schoolYear, lessons, autoSyncWithAI, teacherPreferences } = req.body;

        if (name) curriculum.name = name;
        if (courseLevel) curriculum.courseLevel = courseLevel;
        if (gradeLevel) curriculum.gradeLevel = gradeLevel;
        if (schoolYear) curriculum.schoolYear = schoolYear;
        if (lessons) curriculum.lessons = lessons;
        if (autoSyncWithAI !== undefined) curriculum.autoSyncWithAI = autoSyncWithAI;
        if (teacherPreferences) {
            curriculum.teacherPreferences = {
                ...curriculum.teacherPreferences,
                ...teacherPreferences
            };
        }

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

// Get current curriculum resources for students
router.get('/student/resources', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user || !user.teacherId) {
            return res.json({ hasResources: false });
        }

        const curriculum = await Curriculum.getActiveCurriculum(user.teacherId);

        if (!curriculum) {
            return res.json({ hasResources: false });
        }

        const currentLesson = curriculum.getCurrentLesson();

        if (!currentLesson || !currentLesson.resources || currentLesson.resources.length === 0) {
            return res.json({
                hasResources: false,
                currentTopic: currentLesson ? currentLesson.topic : null
            });
        }

        res.json({
            hasResources: true,
            currentLesson: {
                topic: currentLesson.topic,
                weekNumber: currentLesson.weekNumber,
                standards: currentLesson.standards,
                objectives: currentLesson.objectives,
                resources: currentLesson.resources,
                startDate: currentLesson.startDate,
                endDate: currentLesson.endDate
            }
        });

    } catch (error) {
        console.error('Error fetching student resources:', error);
        res.status(500).json({ message: 'Failed to fetch resources' });
    }
});

// Scrape Common Curriculum schedule
router.post('/teacher/curriculum/sync-common', isAuthenticated, isTeacher, async (req, res) => {
    try {
        const { url, name, courseLevel, gradeLevel, schoolYear } = req.body;

        if (!url) {
            return res.status(400).json({ message: 'URL is required' });
        }

        // Fetch HTML from Common Curriculum
        const html = await fetchHTML(url);

        // Parse lessons and resources
        const lessons = parseCommonCurriculumHTML(html);

        if (lessons.length === 0) {
            return res.status(400).json({ message: 'No lessons found in the schedule' });
        }

        // Deactivate existing curricula
        await Curriculum.deactivateAll(req.user._id);

        // Create new curriculum
        const curriculum = new Curriculum({
            teacherId: req.user._id,
            name: name || 'Common Curriculum Import',
            courseLevel,
            gradeLevel,
            schoolYear,
            lessons,
            importSource: 'common-curriculum',
            importedAt: new Date()
        });

        await curriculum.save();

        res.json({
            success: true,
            message: `Successfully imported ${lessons.length} lessons from Common Curriculum`,
            curriculumId: curriculum._id,
            lessonsCount: lessons.length,
            resourcesCount: lessons.reduce((sum, l) => sum + (l.resources?.length || 0), 0)
        });

    } catch (error) {
        console.error('Error syncing Common Curriculum:', error);
        res.status(500).json({
            message: 'Failed to sync Common Curriculum: ' + error.message
        });
    }
});

// Helper to fetch HTML from URL
function fetchHTML(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;

        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        };

        client.get(url, options, (response) => {
            let data = '';

            // Handle redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
                return fetchHTML(response.headers.location).then(resolve).catch(reject);
            }

            if (response.statusCode !== 200) {
                return reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
            }

            response.on('data', chunk => data += chunk);
            response.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

// Parse Common Curriculum HTML and extract lessons with resources
function parseCommonCurriculumHTML(html) {
    const $ = cheerio.load(html);
    const lessons = [];
    let weekNumber = 0;

    // Common Curriculum structure: Look for week containers, daily schedules, etc.
    // The structure may vary, so we'll look for common patterns

    // Strategy 1: Look for week/unit containers
    $('.week, .unit, [class*="week"], [class*="unit"]').each(function() {
        weekNumber++;
        const weekEl = $(this);

        // Extract week info
        const weekText = weekEl.find('.week-title, .unit-title, h2, h3').first().text().trim();

        // Look for date ranges
        const dateText = weekEl.find('.date, .dates, [class*="date"]').text().trim();
        const dates = extractDates(dateText);

        // Look for daily lessons within this week
        weekEl.find('.day, .lesson, [class*="day"], [class*="lesson"]').each(function() {
            const lessonEl = $(this);

            // Extract topic
            const topic = lessonEl.find('.topic, .title, h4, h5').first().text().trim() || weekText;

            if (!topic) return;

            // Extract all resource links
            const resources = [];
            lessonEl.find('a[href]').each(function() {
                const href = $(this).attr('href');
                const text = $(this).text().trim();

                // Filter for actual resource links (PDFs, videos, etc.)
                if (href && (
                    href.includes('.pdf') ||
                    href.includes('.mp4') ||
                    href.includes('.docx') ||
                    href.includes('.pptx') ||
                    href.includes('youtube.com') ||
                    href.includes('vimeo.com') ||
                    href.includes('drive.google.com')
                )) {
                    // Make absolute URL if needed
                    const absoluteUrl = href.startsWith('http') ? href :
                                      href.startsWith('/') ? `https://www.commoncurriculum.com${href}` :
                                      `https://www.commoncurriculum.com/${href}`;
                    resources.push(absoluteUrl);
                }
            });

            // Extract standards, objectives, keywords from text
            const fullText = lessonEl.text();
            const standards = extractStandards(fullText);
            const objectives = extractObjectives(fullText);

            lessons.push({
                weekNumber,
                topic,
                startDate: dates.start,
                endDate: dates.end,
                standards,
                objectives,
                keywords: [],
                resources,
                notes: weekText !== topic ? weekText : ''
            });
        });
    });

    // Strategy 2: If no structured weeks found, look for all links with resources
    if (lessons.length === 0) {
        const allLinks = [];
        $('a[href]').each(function() {
            const href = $(this).attr('href');
            const text = $(this).text().trim();

            if (href && (
                href.includes('.pdf') ||
                href.includes('.mp4') ||
                href.includes('.docx') ||
                href.includes('youtube.com') ||
                href.includes('drive.google.com')
            )) {
                const absoluteUrl = href.startsWith('http') ? href :
                                  href.startsWith('/') ? `https://www.commoncurriculum.com${href}` :
                                  `https://www.commoncurriculum.com/${href}`;

                allLinks.push({
                    url: absoluteUrl,
                    text: text || 'Resource',
                    context: $(this).parent().text().slice(0, 100)
                });
            }
        });

        // Group by context/topic
        if (allLinks.length > 0) {
            const topicMap = new Map();

            allLinks.forEach(link => {
                const topic = link.context || 'General Resources';
                if (!topicMap.has(topic)) {
                    topicMap.set(topic, []);
                }
                topicMap.get(topic).push(link.url);
            });

            let week = 0;
            topicMap.forEach((resources, topic) => {
                week++;
                lessons.push({
                    weekNumber: week,
                    topic: topic.slice(0, 100),
                    startDate: null,
                    endDate: null,
                    standards: [],
                    objectives: [],
                    keywords: [],
                    resources,
                    notes: 'Imported from Common Curriculum'
                });
            });
        }
    }

    return lessons;
}

// Extract date ranges from text
function extractDates(text) {
    // Look for patterns like "Nov 11 - Dec 12" or "11/11 - 12/12"
    const dateRegex = /(\w{3}\s+\d{1,2}|\d{1,2}\/\d{1,2})\s*-\s*(\w{3}\s+\d{1,2}|\d{1,2}\/\d{1,2})/;
    const match = text.match(dateRegex);

    if (match) {
        return {
            start: parseDate(match[1]),
            end: parseDate(match[2])
        };
    }

    return { start: null, end: null };
}

// Extract standards from text (e.g., "8.EE.1", "CCSS.Math.8.EE.1")
function extractStandards(text) {
    const standards = [];
    const standardRegex = /\b(?:CCSS\.)?(?:Math\.)?(\d{1,2}\.\w+\.\d+)\b/g;
    let match;

    while ((match = standardRegex.exec(text)) !== null) {
        standards.push(match[1]);
    }

    return standards;
}

// Extract objectives from text
function extractObjectives(text) {
    const objectives = [];

    // Look for bullet points or numbered lists
    const lines = text.split('\n');
    lines.forEach(line => {
        if (line.match(/^[\•\-\*]\s*(.+)/) || line.match(/^\d+\.\s*(.+)/)) {
            const objective = line.replace(/^[\•\-\*\d\.]\s*/, '').trim();
            if (objective.length > 10 && objective.length < 200) {
                objectives.push(objective);
            }
        }
    });

    return objectives;
}

module.exports = router;
