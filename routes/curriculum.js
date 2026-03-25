// routes/curriculum.js
// Curriculum schedule management for teachers

const express = require('express');
const router = express.Router();
const Curriculum = require('../models/curriculum');
const User = require('../models/user');
const { isAuthenticated, isTeacher } = require('../middleware/auth');
const { validateObjectId } = require('../middleware/validateObjectId');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const https = require('https');
const http = require('http');

// Configure multer for file uploads (memory storage — no disk writes needed in container)
const upload = multer({
    storage: multer.memoryStorage(),
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
router.put('/teacher/curriculum/:id', isAuthenticated, isTeacher, validateObjectId('id'), async (req, res) => {
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
router.delete('/teacher/curriculum/:id', isAuthenticated, isTeacher, validateObjectId('id'), async (req, res) => {
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

// Add resource to a specific lesson
router.post('/teacher/curriculum/:curriculumId/lesson/:lessonId/resource', isAuthenticated, isTeacher, async (req, res) => {
    try {
        const { curriculumId, lessonId } = req.params;
        const { resourceUrl } = req.body;

        if (!resourceUrl || !resourceUrl.trim()) {
            return res.status(400).json({ message: 'Resource URL is required' });
        }

        const curriculum = await Curriculum.findOne({
            _id: curriculumId,
            teacherId: req.user._id
        });

        if (!curriculum) {
            return res.status(404).json({ message: 'Curriculum not found' });
        }

        const lesson = curriculum.lessons.id(lessonId);
        if (!lesson) {
            return res.status(404).json({ message: 'Lesson not found' });
        }

        // Initialize resources array if it doesn't exist
        if (!lesson.resources) {
            lesson.resources = [];
        }

        // Add resource if it doesn't already exist
        if (!lesson.resources.includes(resourceUrl)) {
            lesson.resources.push(resourceUrl);
            await curriculum.save();

            res.json({
                success: true,
                message: 'Resource added successfully',
                resourcesCount: lesson.resources.length
            });
        } else {
            res.status(400).json({ message: 'Resource already exists for this lesson' });
        }

    } catch (error) {
        console.error('Error adding resource:', error);
        res.status(500).json({ message: 'Failed to add resource' });
    }
});

// Remove resource from a specific lesson
router.delete('/teacher/curriculum/:curriculumId/lesson/:lessonId/resource', isAuthenticated, isTeacher, async (req, res) => {
    try {
        const { curriculumId, lessonId } = req.params;
        const { resourceUrl } = req.body;

        if (!resourceUrl) {
            return res.status(400).json({ message: 'Resource URL is required' });
        }

        const curriculum = await Curriculum.findOne({
            _id: curriculumId,
            teacherId: req.user._id
        });

        if (!curriculum) {
            return res.status(404).json({ message: 'Curriculum not found' });
        }

        const lesson = curriculum.lessons.id(lessonId);
        if (!lesson) {
            return res.status(404).json({ message: 'Lesson not found' });
        }

        if (lesson.resources) {
            lesson.resources = lesson.resources.filter(r => r !== resourceUrl);
            await curriculum.save();

            res.json({
                success: true,
                message: 'Resource removed successfully',
                resourcesCount: lesson.resources.length
            });
        } else {
            res.status(404).json({ message: 'No resources found for this lesson' });
        }

    } catch (error) {
        console.error('Error removing resource:', error);
        res.status(500).json({ message: 'Failed to remove resource' });
    }
});

// Parse and import curriculum from file
router.post('/teacher/curriculum/parse', isAuthenticated, isTeacher, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const { name, courseLevel, gradeLevel, schoolYear } = req.body;
        const fileExt = path.extname(req.file.originalname).toLowerCase();

        let lessons = [];

        // Parse CSV file
        if (fileExt === '.csv' || req.file.mimetype === 'text/csv') {
            lessons = await parseCSV(req.file.buffer);
        } else {
            // For now, only CSV is supported. PDF/Excel would need additional libraries
            return res.status(400).json({
                message: 'Currently only CSV files are supported. Export your schedule as CSV and try again.'
            });
        }

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
        res.status(500).json({ message: 'Failed to parse curriculum file: ' + error.message });
    }
});

// Helper function to parse CSV from a Buffer
function parseCSV(buffer) {
    const { Readable } = require('stream');
    return new Promise((resolve, reject) => {
        const lessons = [];
        let rowNum = 0;

        Readable.from(buffer)
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

    // Clean up the date string
    dateStr = dateStr.trim();

    // Try parsing as-is first
    let date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date;

    // Handle month abbreviation + day (e.g., "Nov 11")
    const monthDayMatch = dateStr.match(/^(\w{3})\s+(\d{1,2})$/);
    if (monthDayMatch) {
        const currentYear = new Date().getFullYear();
        dateStr = `${monthDayMatch[1]} ${monthDayMatch[2]}, ${currentYear}`;
        date = new Date(dateStr);
        if (!isNaN(date.getTime())) return date;
    }

    // Handle MM/DD format (add current year)
    const mmddMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (mmddMatch) {
        const currentYear = new Date().getFullYear();
        dateStr = `${mmddMatch[1]}/${mmddMatch[2]}/${currentYear}`;
        date = new Date(dateStr);
        if (!isNaN(date.getTime())) return date;
    }

    return null;
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
                currentTopic: currentLesson ? currentLesson.topic : null,
                scheduleUrl: curriculum.commonCurriculumUrl || null
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
            },
            scheduleUrl: curriculum.commonCurriculumUrl || null
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
            importedAt: new Date(),
            commonCurriculumUrl: url // Save URL for iframe display
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

    console.log('🔍 Starting Common Curriculum parsing...');
    console.log(`📄 HTML length: ${html.length} characters`);

    // Common Curriculum structure: Look for week containers, daily schedules, etc.
    // The structure may vary, so we'll look for common patterns

    // Strategy 1: Look for week/unit containers with more flexible selectors
    const weekSelectors = $('.week, .unit, [class*="week"], [class*="unit"], [id*="week"], [id*="unit"], tr, .row, [class*="schedule"], [class*="lesson"]');
    console.log(`📋 Found ${weekSelectors.length} potential week/lesson containers`);

    weekSelectors.each(function() {
        const weekEl = $(this);
        const weekText = weekEl.text().trim();

        // Skip empty or very short elements
        if (weekText.length < 10) return;

        // Try to find week number in text
        const weekMatch = weekText.match(/week\s*#?\s*(\d+)/i) || weekText.match(/unit\s*#?\s*(\d+)/i);
        if (weekMatch) {
            weekNumber = parseInt(weekMatch[1]);
        } else {
            weekNumber++;
        }

        // Extract topic - try multiple patterns
        let topic = weekEl.find('.topic, .title, .lesson-title, h2, h3, h4, h5, td:first-child, .name').first().text().trim();

        // If no specific topic found, use the element text (first 100 chars)
        if (!topic || topic.length < 3) {
            topic = weekText.slice(0, 100).replace(/\s+/g, ' ').trim();
        }

        if (!topic || topic.length < 3) return;

        // Look for date ranges with more patterns
        const dateText = weekEl.find('.date, .dates, [class*="date"], td').text().trim();
        const dates = extractDates(dateText || weekText);

        // Extract all resource links
        const resources = [];
        weekEl.find('a[href]').each(function() {
            const href = $(this).attr('href');
            const text = $(this).text().trim();

            // Filter for actual resource links (PDFs, videos, etc.)
            if (href && (
                href.includes('.pdf') ||
                href.includes('.mp4') ||
                href.includes('.docx') ||
                href.includes('.pptx') ||
                href.includes('youtube.com') ||
                href.includes('youtu.be') ||
                href.includes('vimeo.com') ||
                href.includes('drive.google.com') ||
                href.includes('dropbox.com')
            )) {
                // Make absolute URL if needed
                const absoluteUrl = href.startsWith('http') ? href :
                                  href.startsWith('/') ? `https://www.commoncurriculum.com${href}` :
                                  `https://www.commoncurriculum.com/${href}`;
                if (!resources.includes(absoluteUrl)) {
                    resources.push(absoluteUrl);
                }
            }
        });

        // Only add lessons that have meaningful content
        if (topic.length >= 5) {
            // Extract standards, objectives, keywords from text
            const fullText = weekEl.text();
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
                notes: ''
            });
        }
    });

    console.log(`✅ Strategy 1 found ${lessons.length} lessons`);

    // Strategy 2: If no structured weeks found, look for tables
    if (lessons.length === 0) {
        console.log('📊 Trying table parsing strategy...');

        $('table tr').each(function(index) {
            const row = $(this);
            const cells = row.find('td, th');

            if (cells.length < 2) return; // Need at least 2 columns

            const firstCell = cells.eq(0).text().trim();
            const secondCell = cells.eq(1).text().trim();

            // Skip header rows
            if (firstCell.toLowerCase().includes('week') && firstCell.length < 20) return;

            if (firstCell.length > 3 && secondCell.length > 3) {
                const resources = [];
                row.find('a[href]').each(function() {
                    const href = $(this).attr('href');
                    if (href && (
                        href.includes('.pdf') ||
                        href.includes('youtube.com') ||
                        href.includes('drive.google.com')
                    )) {
                        const absoluteUrl = href.startsWith('http') ? href :
                                          href.startsWith('/') ? `https://www.commoncurriculum.com${href}` :
                                          `https://www.commoncurriculum.com/${href}`;
                        resources.push(absoluteUrl);
                    }
                });

                lessons.push({
                    weekNumber: index,
                    topic: firstCell + ' - ' + secondCell,
                    startDate: null,
                    endDate: null,
                    standards: [],
                    objectives: [],
                    keywords: [],
                    resources,
                    notes: 'Imported from table'
                });
            }
        });

        console.log(`✅ Table strategy found ${lessons.length} lessons`);
    }

    // Strategy 3: Fall back to extracting all resource links
    if (lessons.length === 0) {
        console.log('🔗 Falling back to link extraction strategy...');

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

        console.log(`🔗 Found ${allLinks.length} resource links`);

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

    // Deduplicate lessons by topic
    const uniqueLessons = [];
    const seenTopics = new Set();

    lessons.forEach(lesson => {
        if (!seenTopics.has(lesson.topic)) {
            seenTopics.add(lesson.topic);
            uniqueLessons.push(lesson);
        }
    });

    console.log(`✨ Final result: ${uniqueLessons.length} unique lessons`);

    return uniqueLessons;
}

// Extract date ranges from text
function extractDates(text) {
    if (!text) return { start: null, end: null };

    // Try multiple date range patterns
    const patterns = [
        // "Nov 11 - Dec 12" or "Nov. 11 - Dec. 12"
        /(\w{3}\.?\s+\d{1,2})\s*[-–—to]\s*(\w{3}\.?\s+\d{1,2})/i,
        // "11/11 - 12/12" or "11/11/2024 - 12/12/2024"
        /(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*[-–—to]\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i,
        // "2024-11-11 - 2024-12-12" (ISO format)
        /(\d{4}-\d{1,2}-\d{1,2})\s*[-–—to]\s*(\d{4}-\d{1,2}-\d{1,2})/i,
        // "November 11 - December 12"
        /(\w+\s+\d{1,2}(?:,\s*\d{4})?)\s*[-–—to]\s*(\w+\s+\d{1,2}(?:,\s*\d{4})?)/i
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            const startDate = parseDate(match[1]);
            const endDate = parseDate(match[2]);

            if (startDate && endDate) {
                // Handle year rollover (e.g., Dec 2024 - Jan 2025)
                if (endDate < startDate) {
                    endDate.setFullYear(endDate.getFullYear() + 1);
                }

                return { start: startDate, end: endDate };
            }
        }
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

// ============================================================================
// CHAPTER UPLOAD ENDPOINTS (Textbook Mode)
// ============================================================================

const ChapterContent = require('../models/chapterContent');
const { processChapter } = require('../utils/chapterProcessor');

// Configure multer for chapter PDF uploads (larger limit for textbooks)
const chapterUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit for textbook chapters
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed for chapter uploads.'));
        }
    }
});

/**
 * POST /api/teacher/chapters/upload
 * Upload a single chapter PDF for processing
 * Body: chapterNumber, chapterTitle, subject, weekNumber, curriculumId (optional)
 */
router.post('/teacher/chapters/upload', isAuthenticated, isTeacher, chapterUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No PDF file uploaded' });
        }

        const { chapterNumber, chapterTitle, subject, weekNumber, curriculumId } = req.body;

        if (!chapterNumber || !chapterTitle) {
            return res.status(400).json({ message: 'chapterNumber and chapterTitle are required' });
        }

        // Create the chapter content document
        const chapterContent = new ChapterContent({
            teacherId: req.user._id,
            curriculumId: curriculumId || null,
            chapterNumber: parseInt(chapterNumber),
            chapterTitle: chapterTitle.trim(),
            subject: (subject || 'biology').toLowerCase().trim(),
            weekNumber: weekNumber ? parseInt(weekNumber) : null,
            sourceFile: {
                originalName: req.file.originalname,
                mimeType: req.file.mimetype,
                sizeBytes: req.file.size,
                uploadedAt: new Date()
            },
            processingStatus: 'pending'
        });

        await chapterContent.save();

        // Kick off processing pipeline as background job
        processChapter(chapterContent._id, req.file.buffer).catch(err => {
            console.error(`[ChapterUpload] Background processing failed for chapter ${chapterContent._id}: ${err.message}`);
        });

        res.status(201).json({
            success: true,
            message: `Chapter ${chapterNumber} uploaded and processing started`,
            chapterContentId: chapterContent._id,
            processingStatus: 'pending'
        });

    } catch (error) {
        console.error('Error uploading chapter:', error);
        res.status(500).json({ message: 'Failed to upload chapter: ' + error.message });
    }
});

/**
 * POST /api/teacher/chapters/upload-bulk
 * Upload multiple chapter PDFs at once
 */
router.post('/teacher/chapters/upload-bulk', isAuthenticated, isTeacher, chapterUpload.array('files', 20), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No files uploaded' });
        }

        const { subject, curriculumId } = req.body;
        const results = [];

        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            // Derive chapter number from filename or index
            const nameMatch = file.originalname.match(/(?:ch(?:apter)?\.?\s*)?(\d+)/i);
            const chapterNum = nameMatch ? parseInt(nameMatch[1]) : i + 1;
            const chapterTitle = file.originalname.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ').trim();

            const chapterContent = new ChapterContent({
                teacherId: req.user._id,
                curriculumId: curriculumId || null,
                chapterNumber: chapterNum,
                chapterTitle,
                subject: (subject || 'biology').toLowerCase().trim(),
                sourceFile: {
                    originalName: file.originalname,
                    mimeType: file.mimetype,
                    sizeBytes: file.size,
                    uploadedAt: new Date()
                },
                processingStatus: 'pending'
            });

            await chapterContent.save();

            // Kick off processing (staggered to avoid rate limits)
            setTimeout(() => {
                processChapter(chapterContent._id, file.buffer).catch(err => {
                    console.error(`[ChapterUpload] Background processing failed for chapter ${chapterContent._id}: ${err.message}`);
                });
            }, i * 2000); // 2 second stagger between chapters

            results.push({
                chapterContentId: chapterContent._id,
                chapterNumber: chapterNum,
                chapterTitle,
                processingStatus: 'pending'
            });
        }

        res.status(201).json({
            success: true,
            message: `${results.length} chapters uploaded and processing started`,
            chapters: results
        });

    } catch (error) {
        console.error('Error bulk uploading chapters:', error);
        res.status(500).json({ message: 'Failed to upload chapters: ' + error.message });
    }
});

/**
 * GET /api/teacher/chapters/status
 * Get processing status for all chapters uploaded by this teacher
 */
router.get('/teacher/chapters/status', isAuthenticated, isTeacher, async (req, res) => {
    try {
        const chapters = await ChapterContent.getProcessingStatus(req.user._id);

        res.json({
            success: true,
            chapters
        });

    } catch (error) {
        console.error('Error fetching chapter status:', error);
        res.status(500).json({ message: 'Failed to fetch chapter status' });
    }
});

/**
 * GET /api/teacher/chapters/:id
 * Get a specific chapter's details (without embeddings)
 */
router.get('/teacher/chapters/:id', isAuthenticated, isTeacher, async (req, res) => {
    try {
        const chapter = await ChapterContent.findOne({
            _id: req.params.id,
            teacherId: req.user._id
        }).select('-chunks.embedding -rawText').lean();

        if (!chapter) {
            return res.status(404).json({ message: 'Chapter not found' });
        }

        res.json({ success: true, chapter });

    } catch (error) {
        console.error('Error fetching chapter:', error);
        res.status(500).json({ message: 'Failed to fetch chapter' });
    }
});

/**
 * DELETE /api/teacher/chapters/:id
 * Delete a chapter and its processed data
 */
router.delete('/teacher/chapters/:id', isAuthenticated, isTeacher, async (req, res) => {
    try {
        const result = await ChapterContent.findOneAndDelete({
            _id: req.params.id,
            teacherId: req.user._id
        });

        if (!result) {
            return res.status(404).json({ message: 'Chapter not found' });
        }

        res.json({
            success: true,
            message: `Chapter ${result.chapterNumber}: "${result.chapterTitle}" deleted`
        });

    } catch (error) {
        console.error('Error deleting chapter:', error);
        res.status(500).json({ message: 'Failed to delete chapter' });
    }
});

/**
 * GET /api/student/chapters
 * Get available chapters for a student (based on their teacher's uploads)
 */
router.get('/student/chapters', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user || !user.teacherId) {
            return res.json({ hasChapters: false, chapters: [] });
        }

        const chapters = await ChapterContent.find({
            teacherId: user.teacherId,
            processingStatus: 'ready'
        })
            .select('chapterNumber chapterTitle subject weekNumber totalConceptCards totalChunks processingCompletedAt')
            .sort({ chapterNumber: 1 })
            .lean();

        res.json({
            hasChapters: chapters.length > 0,
            chapters
        });

    } catch (error) {
        console.error('Error fetching student chapters:', error);
        res.status(500).json({ message: 'Failed to fetch chapters' });
    }
});

module.exports = router;
