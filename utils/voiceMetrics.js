// utils/voiceMetrics.js
// Per-turn metrics for the streaming voice pipeline.
// In-memory ring buffer — no Mongo, no new infra.

const RING_SIZE = 1000;
const ring = new Array(RING_SIZE);
let cursor = 0;
let total = 0;

const logger = require('./logger').child({ module: 'voiceMetrics' });

// Cost coefficients (USD per minute / per 1K tokens / per char).
// Update if vendor pricing changes — these drive the dashboard, not billing.
const COST = {
    sttPerMinute: 0.0043,           // Deepgram Nova-3 streaming
    llmInputPer1KTokens: 0.00015,   // gpt-4o-mini input
    llmOutputPer1KTokens: 0.0006,   // gpt-4o-mini output
    ttsPerCharacter: 0.000020,      // Cartesia Sonic-2 streaming (~$0.020/min ≈ $0.0000133/char @ 150wpm)
};

function newTurn(sessionId, userId, tutorId) {
    return {
        sessionId,
        userId: String(userId),
        tutorId,
        turnId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        t_started: Date.now(),
        t_user_speech_start: null,
        t_user_speech_end: null,
        t_first_llm_token: null,
        t_first_audio_chunk: null,
        t_audio_play_started: null,
        t_interrupt_requested: null,
        t_audio_silenced: null,
        t_turn_end: null,
        sttSecondsBilled: 0,
        llmInputTokens: 0,
        llmOutputTokens: 0,
        ttsChars: 0,
        abortReason: null,
        spokenChars: 0,
    };
}

function record(turn) {
    if (!turn) return;
    if (!turn.t_turn_end) turn.t_turn_end = Date.now();

    const t = {
        ...turn,
        time_to_first_audio_ms: turn.t_first_audio_chunk && turn.t_user_speech_end
            ? turn.t_first_audio_chunk - turn.t_user_speech_end
            : null,
        time_to_first_token_ms: turn.t_first_llm_token && turn.t_user_speech_end
            ? turn.t_first_llm_token - turn.t_user_speech_end
            : null,
        interrupt_stop_ms: turn.t_audio_silenced && turn.t_interrupt_requested
            ? turn.t_audio_silenced - turn.t_interrupt_requested
            : null,
        turn_duration_ms: turn.t_turn_end - turn.t_started,
        estimated_cost_usd: estimateCost(turn),
    };

    ring[cursor] = t;
    cursor = (cursor + 1) % RING_SIZE;
    total++;

    // Sample 1-of-20 to logs to avoid spam, but log every interrupted turn.
    if (turn.abortReason || total % 20 === 0) {
        logger.info('voice_turn', {
            turnId: t.turnId,
            userId: t.userId,
            ttfa_ms: t.time_to_first_audio_ms,
            interrupt_ms: t.interrupt_stop_ms,
            duration_ms: t.turn_duration_ms,
            cost_cents: Math.round(t.estimated_cost_usd * 10000) / 100,
            abort: t.abortReason,
        });
    }

    return t;
}

function estimateCost(turn) {
    const stt = (turn.sttSecondsBilled / 60) * COST.sttPerMinute;
    const llmIn = (turn.llmInputTokens / 1000) * COST.llmInputPer1KTokens;
    const llmOut = (turn.llmOutputTokens / 1000) * COST.llmOutputPer1KTokens;
    const tts = turn.ttsChars * COST.ttsPerCharacter;
    return stt + llmIn + llmOut + tts;
}

function snapshot(limit = 100) {
    const out = [];
    for (let i = 0; i < Math.min(limit, RING_SIZE); i++) {
        const idx = (cursor - 1 - i + RING_SIZE) % RING_SIZE;
        if (ring[idx]) out.push(ring[idx]);
    }
    return out;
}

function aggregate() {
    const turns = snapshot(RING_SIZE).filter(t => t.time_to_first_audio_ms != null);
    if (turns.length === 0) {
        return { count: 0 };
    }
    const ttfa = turns.map(t => t.time_to_first_audio_ms).sort((a, b) => a - b);
    const interrupts = turns.map(t => t.interrupt_stop_ms).filter(x => x != null).sort((a, b) => a - b);
    const costs = turns.map(t => t.estimated_cost_usd);
    const interrupted = turns.filter(t => t.abortReason === 'user_barge_in').length;
    return {
        count: turns.length,
        ttfa_ms_p50: percentile(ttfa, 0.50),
        ttfa_ms_p95: percentile(ttfa, 0.95),
        interrupt_stop_ms_p50: interrupts.length ? percentile(interrupts, 0.50) : null,
        interrupt_stop_ms_p95: interrupts.length ? percentile(interrupts, 0.95) : null,
        avg_cost_usd: costs.reduce((a, b) => a + b, 0) / costs.length,
        interrupt_rate: interrupted / turns.length,
        total_recorded: total,
    };
}

function percentile(sorted, p) {
    if (sorted.length === 0) return null;
    const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
    return sorted[idx];
}

module.exports = { newTurn, record, snapshot, aggregate, COST };
