// utils/resourceDetector.js
// Detect teacher resource references in student messages and fetch them

const TeacherResource = require('../models/teacherResource');
const { extractTextFromPDF } = require('./pdfOcr');
const { performOCR } = require('./ocr');
const { generateEmbedding } = require('./openaiClient'); // DIRECTIVE 3
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
        // Teacher resource naming convention: "Module 8 Test PRACTICE (A)", "Unit 3 Quiz (B)", etc.
        /(?:module|unit|chapter|lesson)\s+\d+\s+(?:test|quiz|practice|exam|homework)\s+(?:practice\s+)?(?:\([A-Za-z]\))?/gi,
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
 * DIRECTIVE 3: Uses vector similarity search for semantic matching
 * @param {string} teacherId - The teacher's ID
 * @param {string} message - The student's message
 * @param {Array} classIds - The classes the ASKING student belongs to. Every
 *   lookup below is scoped by it, because a match here puts the resource's
 *   extracted text straight into the tutor's prompt — an unscoped lookup would
 *   read Class A's test aloud to Class B on request. Pass the student's real
 *   class list; omitting it disables class scoping entirely.
 * @returns {Promise<Object|null>} - The resource object or null
 */
async function findResourceInMessage(teacherId, message, classIds) {
    if (!teacherId) return null;

    // HIGHEST CONFIDENCE: Check for explicitly quoted resource names first
    // Handles: "Module 8 Test PRACTICE (A)", 'Module 8 Test PRACTICE (A)', curly quotes
    const quotedMatch = message.match(/[\u201c\u201d""]([^\u201c\u201d""]+)[\u201c\u201d""]/) ||
                        message.match(/"([^"]+)"/) ||
                        message.match(/\u2018([^\u2018\u2019]+)\u2019/) ||
                        message.match(/'([^']+)'/);
    if (quotedMatch) {
        const quotedName = quotedMatch[1].trim();
        console.log(`🔍 [Quoted Name] Trying exact match for: "${quotedName}"`);
        const resource = await TeacherResource.findByName(teacherId, quotedName, classIds);
        if (resource) {
            console.log(`✅ [Quoted Name] Found resource: ${resource.displayName}`);
            return resource;
        }
        console.log(`ℹ️ [Quoted Name] No match found for quoted name, continuing to vector search`);
    }

    // DIRECTIVE 3: Try vector similarity search (semantic search)
    try {
        console.log(`🔍 [Vector Search] Searching for resources matching: "${message.substring(0, 100)}..."`);

        // Generate embedding for the student's question
        const queryEmbedding = await generateEmbedding(message);

        // Find top matches using cosine similarity
        const vectorResults = await TeacherResource.vectorSearch(teacherId, queryEmbedding, 3, classIds);

        if (vectorResults && vectorResults.length > 0) {
            // Check if top match has good similarity (> 0.7)
            const topMatch = vectorResults[0];
            if (topMatch._similarityScore > 0.7) {
                console.log(`✅ [Vector Search] Found high-confidence match: ${topMatch.displayName} (similarity: ${topMatch._similarityScore.toFixed(3)})`);
                return topMatch;
            } else if (topMatch._similarityScore > 0.5) {
                console.log(`⚠️ [Vector Search] Found moderate match: ${topMatch.displayName} (similarity: ${topMatch._similarityScore.toFixed(3)})`);
                // Continue to fallback for validation
            } else {
                console.log(`ℹ️ [Vector Search] No strong matches found (best similarity: ${topMatch._similarityScore.toFixed(3)})`);
            }
        }
    } catch (vectorError) {
        console.warn(`⚠️ [Vector Search] Failed:`, vectorError.message);
        // Fall through to regex/keyword search
    }

    // FALLBACK: Use original regex + keyword matching
    const mentions = detectResourceMention(message);
    if (mentions.length === 0) {
        console.log(`[ResourceDetector] No resource mentions detected by regex in message: "${message?.substring(0, 80)}"`);
    }
    if (mentions.length > 0) {
        console.log(`🔍 [Keyword Fallback] Detected resource mentions: ${mentions.join(', ')}`);

        // Try to find a matching resource by name
        for (const mention of mentions) {
            const resource = await TeacherResource.findByName(teacherId, mention, classIds);
            if (resource) {
                console.log(`✅ [Keyword Fallback] Found resource: ${resource.displayName}`);
                return resource;
            }
        }
    }

    // Final fallback: keyword search
    const keywords = message.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const commonWords = ['the', 'and', 'for', 'from', 'with', 'this', 'that', 'have', 'been', 'what'];
    const meaningfulKeywords = keywords.filter(k => !commonWords.includes(k)).slice(0, 5);

    if (meaningfulKeywords.length > 0) {
        const searchQuery = meaningfulKeywords.join(' ');
        const results = await TeacherResource.search(teacherId, searchQuery, classIds);
        if (results && results.length > 0) {
            console.log(`✅ [Keyword Fallback] Found resource via search: ${results[0].displayName}`);
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
        let extractedText = resource.extractedText || '';

        if (fs.existsSync(filePath)) {
            // File is on disk — extract text if not already cached
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
        } else if (extractedText) {
            // File not on disk but we have cached text from upload time (e.g. cloud storage)
            console.log(`📖 [Resource] "${resource.displayName}" serving from cached extracted text`);
        } else if (resource.publicUrl) {
            // File not on disk, no cached text, but a cloud URL exists — serve metadata only
            console.warn(`⚠️ [Resource] "${resource.displayName}" not on disk and no cached text; returning metadata only`);
        } else {
            // Truly missing — no local file, no cached text, no cloud URL
            console.error(`❌ Resource file not found and no fallback available: ${filePath}`);
            return {
                success: false,
                error: 'File not found'
            };
        }

        // Record access
        await resource.recordAccess();

        const finalContent = extractedText.slice(0, 3000);
        if (!finalContent) {
            console.warn(`[ResourceDetector] ⚠️ No text content available for "${resource.displayName}" — AI will not have resource content`);
        }

        return {
            success: true,
            resource: {
                displayName: resource.displayName,
                description: resource.description,
                fileType: resource.fileType,
                content: finalContent, // Limit to 3000 chars for AI context
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
async function detectAndFetchResource(teacherId, message, classIds) {
    try {
        console.log(`[ResourceDetector] Entry — teacherId=${teacherId}, messageLen=${message?.length}`);

        const resource = await findResourceInMessage(teacherId, message, classIds);
        if (!resource) {
            console.log(`[ResourceDetector] No matching resource found for message: "${message?.substring(0, 80)}..."`);
            return null;
        }

        console.log(`[ResourceDetector] Match found: "${resource.displayName}" (id=${resource._id}), fetching content...`);
        const processedResource = await fetchAndProcessResource(resource);
        if (!processedResource.success) {
            console.warn(`[ResourceDetector] fetchAndProcessResource failed: ${processedResource.error}`);
            return null;
        }

        const contentLen = processedResource.resource?.content?.length || 0;
        console.log(`[ResourceDetector] ✅ Resource ready — "${resource.displayName}", content=${contentLen} chars`);
        return processedResource.resource;

    } catch (error) {
        console.error('[ResourceDetector] Unexpected error:', error.message, error.stack?.split('\n')[1]);
        return null;
    }
}

module.exports = {
    detectResourceMention,
    findResourceInMessage,
    fetchAndProcessResource,
    detectAndFetchResource
};
