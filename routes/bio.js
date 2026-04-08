// routes/bio.js
// Public (no-auth) endpoints for the Bio Tutor pages.
// Chapters: upload, status, get, delete
// Chat: streaming bio chat

const express = require('express');
const router = express.Router();
const multer = require('multer');
const ChapterContent = require('../models/chapterContent');
const { callLLMStream, callLLM } = require('../utils/openaiClient');
const { generateBioSystemPrompt } = require('../utils/bioPromptCompact');

// Multer config for chapter PDFs (memory storage, 50MB limit)
const chapterUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'), false);
  }
});

const BIO_CHAT_MODEL = 'gpt-4o-mini';

// ─── Helper: get all bio chapters (no teacherId scoping) ───
async function getAllBioChapters() {
  return ChapterContent.find({ subject: 'biology' })
    .select('chapterNumber chapterTitle processingStatus processingError processingCompletedAt totalConceptCards totalChunks')
    .sort({ chapterNumber: 1 })
    .lean();
}

// ─── Helper: get the latest ready chapter for RAG ───
async function getLatestReadyChapter() {
  return ChapterContent.findOne({ subject: 'biology', processingStatus: 'ready' })
    .sort({ chapterNumber: -1 })
    .lean();
}

// ============================================================================
// CHAPTER ROUTES (public, no auth)
// ============================================================================

/**
 * POST /api/bio/chapters/upload
 */
router.post('/chapters/upload', chapterUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No PDF file uploaded' });
    }

    const { chapterNumber, chapterTitle, subject } = req.body;

    if (!chapterNumber || !chapterTitle) {
      return res.status(400).json({ message: 'chapterNumber and chapterTitle are required' });
    }

    const chapterContent = new ChapterContent({
      teacherId: null,
      chapterNumber: parseInt(chapterNumber),
      chapterTitle: chapterTitle.trim(),
      subject: (subject || 'biology').toLowerCase().trim(),
      sourceFile: {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        uploadedAt: new Date()
      },
      processingStatus: 'pending'
    });

    await chapterContent.save();

    // Kick off processing pipeline in background
    const { processChapter } = require('../utils/chapterProcessor');
    processChapter(chapterContent._id, req.file.buffer).catch(err => {
      console.error(`[Bio] Background processing failed for chapter ${chapterContent._id}: ${err.message}`);
    });

    res.status(201).json({
      success: true,
      message: `Chapter ${chapterNumber} uploaded and processing started`,
      chapterContentId: chapterContent._id,
      processingStatus: 'pending'
    });

  } catch (error) {
    console.error('[Bio] Error uploading chapter:', error);
    res.status(500).json({ message: 'Failed to upload chapter: ' + error.message });
  }
});

/**
 * GET /api/bio/chapters/status
 */
router.get('/chapters/status', async (req, res) => {
  try {
    const chapters = await getAllBioChapters();
    res.json({ success: true, chapters });
  } catch (error) {
    console.error('[Bio] Error fetching chapter status:', error);
    res.status(500).json({ message: 'Failed to fetch chapter status' });
  }
});

/**
 * GET /api/bio/chapters/:id
 */
router.get('/chapters/:id', async (req, res) => {
  try {
    const chapter = await ChapterContent.findOne({
      _id: req.params.id,
      subject: 'biology'
    }).select('-chunks.embedding -rawText').lean();

    if (!chapter) {
      return res.status(404).json({ message: 'Chapter not found' });
    }

    res.json({ success: true, chapter });
  } catch (error) {
    console.error('[Bio] Error fetching chapter:', error);
    res.status(500).json({ message: 'Failed to fetch chapter' });
  }
});

/**
 * DELETE /api/bio/chapters/:id
 */
router.delete('/chapters/:id', async (req, res) => {
  try {
    const result = await ChapterContent.findOneAndDelete({
      _id: req.params.id,
      subject: 'biology'
    });

    if (!result) {
      return res.status(404).json({ message: 'Chapter not found' });
    }

    res.json({
      success: true,
      message: `Chapter ${result.chapterNumber}: "${result.chapterTitle}" deleted`
    });
  } catch (error) {
    console.error('[Bio] Error deleting chapter:', error);
    res.status(500).json({ message: 'Failed to delete chapter' });
  }
});

// ============================================================================
// CHAT ROUTE (public, no auth, streaming, with RAG)
// ============================================================================

/**
 * POST /api/bio/chat
 * Body: { message, history?, chapterId? }
 * Query: ?stream=true for SSE streaming
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, history = [], chapterId } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ message: 'Message is required' });
    }

    if (message.length > 4000) {
      return res.status(400).json({ message: 'Message too long (max 4000 chars)' });
    }

    const systemPrompt = generateBioSystemPrompt({
      user: { firstName: 'Student', gradeLevel: 'High School' },
      tutorName: 'Alex',
    });

    // Build messages array
    const sanitizedHistory = Array.isArray(history)
      ? history.slice(-20).map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: String(m.content || '').slice(0, 4000)
        }))
      : [];

    const messagesForLLM = [
      { role: 'system', content: systemPrompt },
      ...sanitizedHistory,
      { role: 'user', content: message.trim() }
    ];

    const useStreaming = req.query.stream === 'true';

    if (useStreaming) {
      // SSE streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      let clientDisconnected = false;
      req.on('close', () => { clientDisconnected = true; });

      try {
        const stream = await callLLMStream(BIO_CHAT_MODEL, messagesForLLM, {
          temperature: 0.7,
          max_tokens: 1200
        });

        let fullText = '';
        for await (const chunk of stream) {
          if (clientDisconnected) break;
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            res.write(`data: ${JSON.stringify({ chunk: content })}\n\n`);
          }
        }

        // Send completion event
        if (!clientDisconnected) {
          res.write(`data: ${JSON.stringify({ type: 'complete', text: fullText })}\n\n`);
          res.write('data: [DONE]\n\n');
        }
        res.end();
      } catch (streamError) {
        console.error('[Bio Chat] Stream error:', streamError.message);
        if (!clientDisconnected) {
          res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream failed' })}\n\n`);
          res.end();
        }
      }
    } else {
      // Non-streaming response
      const completion = await callLLM(BIO_CHAT_MODEL, messagesForLLM, {
        temperature: 0.7,
        max_tokens: 1200
      });

      const text = completion.choices?.[0]?.message?.content?.trim()
        || "I had trouble thinking. Could you try again?";

      res.json({ success: true, text });
    }

  } catch (error) {
    console.error('[Bio Chat] Error:', error);
    res.status(500).json({ message: 'Chat failed: ' + error.message });
  }
});

module.exports = router;
