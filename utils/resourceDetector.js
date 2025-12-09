// utils/resourceDetector.js
// Detect teacher resource references in student messages and fetch them

const TeacherResource = require('../models/teacherResource');
const { extractTextFromPDF } = require('./pdfOcr');
const { performOCR } = require('./ocr');
const path = require('path');
const fs = require('fs');

/**
 * Detect if a message references a teacher resource
 * Looks for patterns like:
 * - "module 6.2"
 * - "worksheet 3"
 * - "practice sheet"
 * - "homework 5"
 */
function detectResourceMention(message) {
    const normalized = message.toLowerCase();

    // Common patterns for resource mentions
    const patterns = [
        /(?:module|unit|lesson|chapter)\s+[\d.]+/gi,
        /(?:worksheet|practice|homework|assignment|quiz|test)\s+[\d]+/gi,
        /(?:page|problem|question)\s+[\d]+/gi,
        /([\w\s]{3,30})\s+(?:practice|worksheet|assignment|homework)/gi
    ];

    const mentions = [];
    patterns.forEach(pattern => {
        const matches = message.match(pattern);
        if (matches) {
            mentions.push(...matches);
        }
    });

    return mentions;
}

/**
 * Find a teacher resource by searching for mentions in the message
 * @param {string} teacherId - The teacher's ID
 * @param {string} message - The student's message
 * @returns {Promise<Object|null>} - The resource object or null
 */
async function findResourceInMessage(teacherId, message) {
    if (!teacherId) return null;

    const mentions = detectResourceMention(message);
    if (mentions.length === 0) return null;

    console.log(`🔍 Detected resource mentions: ${mentions.join(', ')}`);

    // Try to find a matching resource
    for (const mention of mentions) {
        const resource = await TeacherResource.findByName(teacherId, mention);
        if (resource) {
            console.log(`✅ Found resource: ${resource.displayName}`);
            return resource;
        }
    }

    // If no exact match, try searching with the full message
    const keywords = message.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const commonWords = ['the', 'and', 'for', 'from', 'with', 'this', 'that', 'have', 'been', 'what'];
    const meaningfulKeywords = keywords.filter(k => !commonWords.includes(k)).slice(0, 5);

    if (meaningfulKeywords.length > 0) {
        const searchQuery = meaningfulKeywords.join(' ');
        const results = await TeacherResource.search(teacherId, searchQuery);
        if (results && results.length > 0) {
            console.log(`✅ Found resource via search: ${results[0].displayName}`);
            return results[0];
        }
    }

    return null;
}

/**
 * Fetch and process a teacher resource file
 * @param {Object} resource - The teacher resource document
 * @returns {Promise<Object>} - Processed resource data
 */
async function fetchAndProcessResource(resource) {
    try {
        const filePath = path.join('uploads/teacher-resources', resource.storedFilename);

        if (!fs.existsSync(filePath)) {
            console.error(`❌ Resource file not found: ${filePath}`);
            return {
                success: false,
                error: 'File not found'
            };
        }

        // Record access
        await resource.recordAccess();

        let extractedText = resource.extractedText || '';

        // If no cached text, extract it now
        if (!extractedText) {
            try {
                if (resource.mimeType === 'application/pdf') {
                    extractedText = await extractTextFromPDF(filePath);
                } else if (resource.mimeType.startsWith('image/')) {
                    const ocrResult = await performOCR(filePath);
                    extractedText = ocrResult.text || '';
                }

                // Cache the extracted text
                if (extractedText) {
                    resource.extractedText = extractedText.slice(0, 5000);
                    await resource.save();
                }
            } catch (error) {
                console.error('Error extracting text:', error);
            }
        }

        return {
            success: true,
            resource: {
                displayName: resource.displayName,
                description: resource.description,
                fileType: resource.fileType,
                content: extractedText.slice(0, 3000), // Limit to 3000 chars for AI context
                publicUrl: resource.publicUrl
            }
        };

    } catch (error) {
        console.error('Error processing resource:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Main function to detect and fetch resource mentioned in a student's message
 * @param {string} teacherId - The teacher's ID
 * @param {string} message - The student's message
 * @returns {Promise<Object|null>} - Resource data or null
 */
async function detectAndFetchResource(teacherId, message) {
    try {
        const resource = await findResourceInMessage(teacherId, message);
        if (!resource) return null;

        const processedResource = await fetchAndProcessResource(resource);
        if (!processedResource.success) return null;

        return processedResource.resource;

    } catch (error) {
        console.error('Error in detectAndFetchResource:', error);
        return null;
    }
}

module.exports = {
    detectResourceMention,
    findResourceInMessage,
    fetchAndProcessResource,
    detectAndFetchResource
};
