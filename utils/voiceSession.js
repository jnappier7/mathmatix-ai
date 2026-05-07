// utils/voiceSession.js
// Per-WebSocket orchestrator for the streaming voice tutor.
// Owns one Deepgram session, one Cartesia synthesizer per turn,
// one AbortController per turn. Coordinates STT → LLM → TTS with
// interrupt handling and per-turn metrics.

const User = require('../models/user');
const Conversation = require('../models/conversation');
const TUTOR_CONFIG = require('./tutorConfig');
const { generateSystemPrompt } = require('./prompt');
const { callLLMStream } = require('./llmGateway');
const { verify: pipelineVerify } = require('./pipeline');
const { checkReadingLevel } = require('./readability');
const sttStream = require('./sttStream');
const ttsStream = require('./ttsStream');
const ttsProvider = require('./ttsProvider');
const metrics = require('./voiceMetrics');
const logger = require('./logger').child({ module: 'voiceSession' });

const VOICE_MODEL = process.env.VOICE_LLM_MODEL || 'gpt-4o-mini';
const HISTORY_DEPTH = 12;

// Streaming voice prompt — natural English first, then tagged math at the
// end. The orchestrator forwards everything before <math> to TTS in real
// time, then parses the JSON inside the tag for the board.
const STREAMING_VOICE_INSTRUCTIONS = `

**STREAMING VOICE MODE — ACTIVE**

You are in a real-time spoken math tutoring session. Format your reply
in TWO parts, in this exact order:

PART 1 — SPOKEN (always present):
- 1-2 sentences of natural English. No LaTeX delimiters. No markdown.
- Say "x squared plus 3x" not "$x^2 + 3x$". Numbers: "two thirds" not "2/3".
- Warm and conversational, like a tutor sitting next to the student.
- Ask ONE follow-up question per turn.

PART 2 — MATH STATE (always present, even on small talk):
After the spoken text, append a single line:
<math>[{"label":"...","latex":"...","explanation":"..."}, ...]</math>

PEDAGOGY (CRITICAL):
- The math array is the cumulative board — only steps the student has
  derived or confirmed. Never include the next step the student hasn't
  worked through yet.
- Wrong answer: do NOT add the wrong step. Repeat the prior steps unchanged.
- Pure small talk: include the most recent prior board state (or [] if
  no math has happened yet this session).

EXAMPLES:

User: "solve 2x minus 4 equals 0"
Sure, let's work through it together! What's the first step to isolate x? <math>[{"label":"Given","latex":"2x - 4 = 0"}]</math>

User: "add 4 to both sides"
Exactly right! Now we have 2x equals 4. What's next? <math>[{"label":"Given","latex":"2x - 4 = 0"},{"label":"Add 4","latex":"2x = 4"}]</math>

User: "multiply by 2" (WRONG)
Hmm, not quite. We have 2 times x. What's the opposite of multiplying by 2? <math>[{"label":"Given","latex":"2x - 4 = 0"},{"label":"Add 4","latex":"2x = 4"}]</math>

REMEMBER: never speak math notation. The LaTeX goes in the math tag only.
Never put system tags or JSON inside the spoken portion.
`;

class VoiceSession {
    constructor({ ws, user, sessionId }) {
        this.ws = ws;
        this.user = user;                       // populated user doc (lean)
        this.userId = String(user._id);
        this.sessionId = sessionId || `${this.userId}-${Date.now()}`;
        this.tutorProfile = TUTOR_CONFIG[user.selectedTutorId || 'default'] || TUTOR_CONFIG['default'];
        this.voiceId = ttsProvider.getVoiceId(this.tutorProfile);
        this.langCode = ({
            English: 'en', Spanish: 'es', Russian: 'ru', Chinese: 'zh',
            Vietnamese: 'vi', Arabic: 'ar', Somali: 'so', French: 'fr', German: 'de',
        })[user.preferredLanguage] || 'en';

        this.history = [];        // {role, content} from Mongo + this session
        this.lastBoardSteps = []; // most recent <math> array, used as fallback
        this.systemPrompt = '';

        this.stt = null;
        this.currentTurn = null;
        this.closed = false;

        this._lastPartialAt = 0;
        this._pendingTurnDebounce = null;

        this._bindClient();
    }

    async init() {
        this.systemPrompt = await generateSystemPrompt(this.user, this.tutorProfile);

        // Load recent conversation for context
        const conv = await Conversation.findOne({ userId: this.user._id })
            .sort({ updatedAt: -1 })
            .select({ messages: { $slice: -HISTORY_DEPTH } })
            .lean();
        this.history = (conv?.messages || [])
            .filter(m => m.content && m.content.trim().length > 0)
            .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

        this._send({ type: 'session_ready', sampleRate: 22050, voiceId: this.voiceId });
        this._openStt();
    }

    // ─── WebSocket binding ───────────────────────────────────────────────

    _bindClient() {
        this.ws.on('message', (raw, isBinary) => {
            if (this.closed) return;
            if (isBinary) {
                // Binary frames are PCM s16 16kHz mono mic audio
                if (this.stt) this.stt.sendFrame(raw);
                return;
            }
            let msg;
            try { msg = JSON.parse(raw.toString('utf8')); } catch (_) { return; }
            this._handleClientMessage(msg).catch(err => {
                logger.error('client message handler', { error: err.message });
            });
        });
        this.ws.on('close', () => this.shutdown('client_close'));
        this.ws.on('error', (err) => {
            logger.warn('client ws error', { userId: this.userId, error: err.message });
        });
    }

    async _handleClientMessage(msg) {
        switch (msg.type) {
            case 'barge_in':
                this._abortCurrentTurn('user_barge_in');
                break;
            case 'text_input':
                if (typeof msg.text === 'string' && msg.text.trim()) {
                    this._startTurn(msg.text.trim(), { source: 'text' });
                }
                break;
            case 'ping':
                this._send({ type: 'pong', t: Date.now() });
                break;
            case 'reset_listening':
                // Client tells us "stop accumulating, drop pending utterance"
                this._cancelPendingDebounce();
                break;
            default:
                // ignore unknown
        }
    }

    // ─── STT lifecycle ───────────────────────────────────────────────────

    _openStt() {
        if (!sttStream.isConfigured()) {
            this._send({ type: 'fatal', message: 'Speech recognition not configured' });
            return;
        }
        this.stt = sttStream.createSession({
            language: this.langCode,
            sampleRate: 16000,
            endpointing: 300,
            utteranceEndMs: 800,
            onPartial: (text) => this._onPartial(text),
            onFinal: (text) => this._onFinal(text),
            onUtteranceEnd: () => this._onUtteranceEnd(),
            onError: (err) => {
                const detail = err?.message || err?.reason || String(err);
                logger.warn('stt error → telling client to fall back', { userId: this.userId, error: detail });
                // Surface as fatal so the client switches off the streaming
                // pipeline and re-enables the legacy MediaRecorder path.
                this._send({ type: 'fatal', message: `Streaming STT unavailable: ${detail}` });
                this.shutdown('stt_error');
            },
            onClose: () => {
                logger.debug('stt closed', { userId: this.userId });
            },
        });
    }

    _onPartial(text) {
        this._lastPartialAt = Date.now();
        // If AI is currently speaking, partial transcripts on student channel
        // are how the server confirms a barge-in even if the client missed it.
        // Client also sends explicit 'barge_in' on local VAD; this is belt+suspenders.
        if (this.currentTurn && this.currentTurn.status === 'speaking' && text.length > 2) {
            this._abortCurrentTurn('user_barge_in_server_detected');
        }
        this._send({ type: 'transcript_partial', text });
    }

    _accumulatedFinal = '';
    _onFinal(text) {
        // Concatenate "is_final" segments — Deepgram emits multiple finals
        // per utterance (one per phrase). We commit on UtteranceEnd.
        this._accumulatedFinal = this._accumulatedFinal
            ? `${this._accumulatedFinal} ${text}`
            : text;
        this._send({ type: 'transcript_final_segment', text });
    }

    _onUtteranceEnd() {
        const utterance = this._accumulatedFinal.trim();
        this._accumulatedFinal = '';
        if (!utterance) return;
        // If a turn is already in flight (LLM/TTS), a new user utterance
        // is itself a barge-in.
        if (this.currentTurn) {
            this._abortCurrentTurn('user_barge_in');
        }
        this._send({ type: 'transcript_final', text: utterance });
        this._startTurn(utterance, { source: 'voice' });
    }

    _cancelPendingDebounce() {
        if (this._pendingTurnDebounce) {
            clearTimeout(this._pendingTurnDebounce);
            this._pendingTurnDebounce = null;
        }
        this._accumulatedFinal = '';
    }

    // ─── Turn lifecycle ──────────────────────────────────────────────────

    async _startTurn(userMessage, { source }) {
        if (this.closed) return;
        const ac = new AbortController();
        const turn = {
            ac,
            userMessage,
            source,
            startedAt: Date.now(),
            status: 'thinking',
            spokenAcc: '',           // accumulating spoken portion forwarded to TTS
            mathBuffer: '',          // buffered <math>...</math> contents
            inMathTag: false,
            tagBuffer: '',           // straddle buffer for tag boundaries
            tts: null,
            spokenSent: '',          // already-sent-to-TTS spoken text
            tokensEmitted: 0,
            metric: metrics.newTurn(this.sessionId, this.userId, this.tutorProfile.id || 'default'),
        };
        turn.metric.t_user_speech_end = Date.now();
        this.currentTurn = turn;

        this._send({ type: 'turn_start', turnId: turn.metric.turnId, transcript: userMessage });
        this._setStatus('thinking');

        try {
            await this._driveTurn(turn);
        } catch (err) {
            if (turn.ac.signal.aborted) {
                // already handled by abortCurrentTurn
                return;
            }
            logger.error('turn error', { userId: this.userId, error: err.message, stack: err.stack });
            this._send({ type: 'turn_error', message: 'Something went wrong on this turn.' });
            turn.metric.abortReason = 'error';
        } finally {
            if (this.currentTurn === turn) {
                turn.metric.t_turn_end = Date.now();
                metrics.record(turn.metric);
                this.currentTurn = null;
                this._setStatus('idle');
                this._send({ type: 'turn_end', turnId: turn.metric.turnId, abortReason: turn.metric.abortReason });
            }
        }
    }

    async _driveTurn(turn) {
        // ── Build messages for LLM ──
        const messages = [
            { role: 'system', content: this.systemPrompt + STREAMING_VOICE_INSTRUCTIONS },
            ...this.history,
            { role: 'user', content: turn.userMessage },
        ];

        // ── Open Cartesia synthesizer ──
        if (this.voiceId && ttsStream.isConfigured()) {
            turn.tts = ttsStream.createSynthesizer({
                voiceId: this.voiceId,
                language: this.langCode,
                signal: turn.ac.signal,
                onChunk: (i16, sampleRate) => {
                    if (!turn.metric.t_first_audio_chunk) {
                        turn.metric.t_first_audio_chunk = Date.now();
                        if (turn.status === 'thinking') {
                            turn.status = 'speaking';
                            this._setStatus('speaking');
                        }
                    }
                    this._sendAudioChunk(i16, sampleRate, turn.metric.turnId);
                },
                onError: (err) => {
                    logger.warn('tts error', { userId: this.userId, error: err.message });
                },
            });
        }

        // ── Stream LLM ──
        let stream;
        try {
            stream = await callLLMStream(VOICE_MODEL, messages, {
                temperature: 0.45,
                max_tokens: 600,
                signal: turn.ac.signal,
            });
        } catch (err) {
            if (turn.ac.signal.aborted) return;
            throw err;
        }

        for await (const chunk of stream) {
            if (turn.ac.signal.aborted) return;
            const delta = chunk?.choices?.[0]?.delta?.content || '';
            if (!delta) continue;
            if (!turn.metric.t_first_llm_token) {
                turn.metric.t_first_llm_token = Date.now();
            }
            turn.tokensEmitted++;
            this._processToken(turn, delta);
        }

        // ── Finalize: flush remaining spoken (might be a partial-but-not-tag) ──
        if (!turn.inMathTag && turn.tagBuffer) {
            // tagBuffer holds chars that didn't form a tag opener — speak them
            this._forwardSpoken(turn, turn.tagBuffer);
            turn.tagBuffer = '';
        }
        if (turn.tts) turn.tts.finalize();

        // ── Pipeline verify on assembled spoken text in parallel with TTS draining ──
        let verifiedText = turn.spokenAcc;
        let mathStepsForBoard = this._parseMathBuffer(turn.mathBuffer);

        try {
            const verified = await pipelineVerify(turn.spokenAcc, {
                userId: this.userId,
                userMessage: turn.userMessage,
                iepReadingLevel: this.user.iepPlan?.readingLevel || null,
                firstName: this.user.firstName,
                isStreaming: false,
            });
            const flagged = (verified.flags || []).some(f =>
                f.startsWith('answer_giveaway') || f.startsWith('answer_key') || f.startsWith('upload_')
            );
            if (flagged && verified.text && verified.text !== turn.spokenAcc) {
                logger.warn('voice turn redirected by verify', {
                    userId: this.userId, flags: verified.flags
                });
                // Audio already streamed — abort current TTS, re-synthesize redirected text.
                if (turn.tts) turn.tts.abort();
                this._send({ type: 'tts_flush', turnId: turn.metric.turnId });
                verifiedText = verified.text;
                mathStepsForBoard = []; // drop board content alongside redirect
                await this._synthesizeOneShot(turn, verifiedText);
                turn.metric.abortReason = 'verify_redirect';
            } else if (verified.text) {
                verifiedText = verified.text;
            }
        } catch (err) {
            logger.warn('verify failed (using unverified)', { error: err.message });
        }

        // ── IEP reading-level enforcement (only if turn wasn't already redirected) ──
        if (this.user.iepPlan?.readingLevel && turn.metric.abortReason !== 'verify_redirect') {
            try {
                const check = checkReadingLevel(verifiedText, this.user.iepPlan.readingLevel);
                if (!check.passes) {
                    // Don't block streaming — flag for next turn's prompt to keep simpler.
                    logger.info('reading level flag', {
                        userId: this.userId,
                        responseGrade: check.responseGrade,
                        targetGrade: check.targetGrade,
                    });
                }
            } catch (_) { /* non-fatal */ }
        }

        // ── Send final response + math ──
        this._send({
            type: 'response_final',
            turnId: turn.metric.turnId,
            text: verifiedText,
            mathSteps: mathStepsForBoard,
        });

        // Update local state for next turn's pedagogy
        if (mathStepsForBoard.length > 0) this.lastBoardSteps = mathStepsForBoard;

        // ── Persist to history (do not block turn_end) ──
        const assistantContent = verifiedText
            + (mathStepsForBoard.length ? ` <math>${JSON.stringify(mathStepsForBoard)}</math>` : '');
        this.history.push({ role: 'user', content: turn.userMessage });
        this.history.push({ role: 'assistant', content: assistantContent });
        if (this.history.length > HISTORY_DEPTH * 2) {
            this.history = this.history.slice(-HISTORY_DEPTH * 2);
        }
        this._persistTurn(turn.userMessage, assistantContent).catch(err => {
            logger.warn('persist failed', { error: err.message });
        });

        // Metrics accounting
        turn.metric.spokenChars = verifiedText.length;
        turn.metric.ttsChars = turn.tts ? turn.tts.charsSent() : 0;
        turn.metric.sttSecondsBilled = this.stt ? this.stt.billedSeconds : 0;
        turn.metric.llmOutputTokens = turn.tokensEmitted;
    }

    /**
     * Token processor — splits incoming text on the <math>...</math> boundary.
     * Spoken portion streams to TTS; math portion buffers for the board.
     */
    _processToken(turn, delta) {
        // Walk char-by-char through delta and route into spoken or math buckets.
        // We use a small straddle buffer so a tag opener split across deltas
        // ("<ma" + "th>") doesn't get mistakenly spoken.
        let working = turn.tagBuffer + delta;
        turn.tagBuffer = '';

        while (working.length > 0) {
            if (turn.inMathTag) {
                const closeIdx = working.indexOf('</math>');
                if (closeIdx === -1) {
                    turn.mathBuffer += working;
                    return;
                }
                turn.mathBuffer += working.slice(0, closeIdx);
                working = working.slice(closeIdx + '</math>'.length);
                turn.inMathTag = false;
                // Emit math snapshot now (live board update)
                const steps = this._parseMathBuffer(turn.mathBuffer);
                if (steps.length) {
                    this._send({
                        type: 'math_steps_partial',
                        turnId: turn.metric.turnId,
                        mathSteps: steps,
                    });
                }
            } else {
                const openIdx = working.indexOf('<math>');
                if (openIdx === -1) {
                    // Tail might contain a partial '<math' — defer up to 6 chars.
                    const tail = working.slice(-6);
                    if (tail.includes('<') && '<math>'.startsWith(tail.slice(tail.indexOf('<')))) {
                        const safe = working.slice(0, working.length - (tail.length - tail.indexOf('<')));
                        const defer = working.slice(safe.length);
                        if (safe) this._forwardSpoken(turn, safe);
                        turn.tagBuffer = defer;
                        return;
                    }
                    this._forwardSpoken(turn, working);
                    return;
                }
                const safe = working.slice(0, openIdx);
                if (safe) this._forwardSpoken(turn, safe);
                working = working.slice(openIdx + '<math>'.length);
                turn.inMathTag = true;
            }
        }
    }

    _forwardSpoken(turn, text) {
        if (!text) return;
        turn.spokenAcc += text;
        // Emit a streamed-text event so client transcript renders incrementally
        this._send({
            type: 'response_delta',
            turnId: turn.metric.turnId,
            text,
        });
        // Push to TTS
        if (turn.tts) turn.tts.appendText(text);
    }

    _parseMathBuffer(buf) {
        if (!buf) return this.lastBoardSteps;
        const trimmed = buf.trim();
        if (!trimmed) return this.lastBoardSteps;
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                return parsed.filter(s => s && s.latex);
            }
        } catch (_) {
            // Try common LLM JSON quirks
            try {
                const fixed = trimmed.replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"');
                const parsed = JSON.parse(fixed);
                if (Array.isArray(parsed)) return parsed.filter(s => s && s.latex);
            } catch (_) {
                logger.warn('math buffer parse failed', { snippet: trimmed.slice(0, 80) });
            }
        }
        return this.lastBoardSteps;
    }

    /**
     * One-shot synthesis of a verified text (used after a verify-redirect).
     * Opens a fresh Cartesia context and finalizes immediately.
     */
    async _synthesizeOneShot(turn, text) {
        if (!this.voiceId || !ttsStream.isConfigured() || !text) return;
        return new Promise((resolve) => {
            const ts = ttsStream.createSynthesizer({
                voiceId: this.voiceId,
                language: this.langCode,
                signal: turn.ac.signal,
                onChunk: (i16, sampleRate) => {
                    this._sendAudioChunk(i16, sampleRate, turn.metric.turnId);
                },
                onDone: () => resolve(),
                onError: () => resolve(),
            });
            ts.appendText(text);
            ts.finalize();
        });
    }

    /**
     * Cancel current turn — fires LLM abort, closes Cartesia, preserves
     * spokenSoFar in history so the next turn isn't a restart.
     */
    _abortCurrentTurn(reason) {
        const turn = this.currentTurn;
        if (!turn) return;
        try { turn.ac.abort(reason); } catch (_) { /* node version variance */ }
        try { turn.tts?.abort(); } catch (_) { /* swallow */ }

        const spokenSoFar = turn.spokenAcc;
        if (spokenSoFar) {
            // Persist as an interrupted assistant turn — next prompt sees it
            this.history.push({ role: 'user', content: turn.userMessage });
            this.history.push({
                role: 'assistant',
                content: `${spokenSoFar} [INTERRUPTED]`,
            });
            this._persistTurn(turn.userMessage, `${spokenSoFar} [INTERRUPTED]`).catch(() => {});
        }

        turn.metric.abortReason = reason;
        turn.metric.t_interrupt_requested = Date.now();
        turn.metric.t_audio_silenced = Date.now();
        turn.metric.t_turn_end = Date.now();
        metrics.record(turn.metric);

        this._send({
            type: 'interrupted',
            turnId: turn.metric.turnId,
            reason,
            spokenSoFar,
        });

        this.currentTurn = null;
        this._setStatus('listening');
    }

    // ─── Outbound helpers ────────────────────────────────────────────────

    _setStatus(status) {
        this._send({ type: 'status', status });
    }

    _send(obj) {
        if (this.ws.readyState !== 1) return; // OPEN
        try { this.ws.send(JSON.stringify(obj)); } catch (_) { /* socket dead */ }
    }

    _sendAudioChunk(i16, sampleRate, turnId) {
        if (this.ws.readyState !== 1) return;
        // Frame protocol: [1 byte type=0x01][8 bytes turnId hash][2 bytes sr][N bytes pcm s16]
        // Simpler: send a small JSON header followed by binary frame is
        // multiple round-trips. Use a tagged binary buffer instead.
        const turnTag = Buffer.alloc(4);
        turnTag.writeUInt32BE(hash32(turnId), 0);
        const srBuf = Buffer.alloc(2);
        srBuf.writeUInt16BE(sampleRate, 0);
        const audioBuf = Buffer.from(i16.buffer, i16.byteOffset, i16.byteLength);
        const out = Buffer.concat([Buffer.from([0x01]), turnTag, srBuf, audioBuf]);
        try { this.ws.send(out, { binary: true }); } catch (_) { /* swallow */ }
    }

    async _persistTurn(userMessage, aiContent) {
        const messagesToPush = [];
        if (userMessage) messagesToPush.push({ role: 'user', content: userMessage.trim(), timestamp: new Date() });
        if (aiContent) messagesToPush.push({ role: 'assistant', content: aiContent.trim(), timestamp: new Date() });
        if (!messagesToPush.length) return;
        await Conversation.findOneAndUpdate(
            { userId: this.user._id },
            { $push: { messages: { $each: messagesToPush } }, $set: { updatedAt: new Date() } },
            { upsert: true }
        );
    }

    shutdown(reason = 'shutdown') {
        if (this.closed) return;
        this.closed = true;
        if (this.currentTurn) this._abortCurrentTurn(reason);
        try { this.stt?.close(); } catch (_) {}
        try { this.ws.close(1000, reason); } catch (_) {}
    }
}

function hash32(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (h * 31 + str.charCodeAt(i)) >>> 0;
    }
    return h;
}

/**
 * Factory used by the upgrade handler. Returns a session that's already
 * begun loading user/history. Caller binds ws lifecycle.
 */
async function createVoiceSession({ ws, user, sessionId }) {
    const session = new VoiceSession({ ws, user, sessionId });
    await session.init();
    return session;
}

module.exports = { createVoiceSession, VoiceSession };
