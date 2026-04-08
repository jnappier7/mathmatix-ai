/**
 * DEPRECATED: File uploads are now handled by /api/chat (routes/chat.js).
 *
 * This file forwards requests to the main chat route for backwards
 * compatibility. All file processing, pipeline execution, and anti-cheat
 * guards are consolidated in chat.js.
 */
const express = require('express');
const router = express.Router();
const chatRouter = require('./chat');

// Forward all requests to the main chat router
router.use('/', chatRouter);

module.exports = router;
