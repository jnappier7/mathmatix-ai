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
        // Orchestrator-era latency split: ack = first acknowledgment audio
        // (templated thinking-ack or fast-path), substantive = first audio
        // of the substantive response. Both measured from STT-final.
        t_stt_final: null,
        t_first_ack_audio: null,
        t_first_substantive_audio: null,
        t_turn_end: null,
        sttSecondsBilled: 0,
        llmInputTokens: 0,
        llmOutputTokens: 0,
        ttsChars: 0,
        abortReason: null,
        spokenChars: 0,
    };
}

// ── Orchestrator counters ────────────────────────────────────────────
// Lightweight counters for non-per-turn metrics. Reset on process restart;
// scraped via /api/voice-tutor/metrics alongside aggregate().

const counters = {
    phase_strip:         { _total: 0 },   // keyed by `${phase}:${from}->${to}`
    classifier_consensus: { unanimous: 0, majority: 0, split: 0 },
    wait_abandon:        { _total: 0 },   // keyed by skillId or 'unknown'
    fast_path_clarification: 0,
};

function recordPhaseStrip(phase, from, to) {
    const k = `${phase || 'unknown'}:${from}->${to}`;
    counters.phase_strip[k] = (counters.phase_strip[k] || 0) + 1;
    counters.phase_strip._total++;
}

function recordClassifierConsensus(consensus) {
    if (!consensus) return;
    if (counters.classifier_consensus[consensus] != null) {
        counters.classifier_consensus[consensus]++;
    }
}

function recordWaitAbandon(skillId) {
    const k = skillId || 'unknown';
    counters.wait_abandon[k] = (counters.wait_abandon[k] || 0) + 1;
    counters.wait_abandon._total++;
}

function recordFastPathClarification() {
    counters.fast_path_clarification++;
}

function getCounters() {
    // Compute consensus rate
    const consTotal = counters.classifier_consensus.unanimous
                    + counters.classifier_consensus.majority
                    + counters.classifier_consensus.split;
    const consensusRate = consTotal > 0
        ? counters.classifier_consensus.unanimous / consTotal
        : null;
    return {
        phase_strip: { ...counters.phase_strip },
        classifier_consensus: { ...counters.classifier_consensus, rate_unanimous: consensusRate },
        wait_abandon: { ...counters.wait_abandon },
        fast_path_clarification: counters.fast_path_clarification,
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
        // Orchestrator-era split — populated by orchestrator turns; null on
        // legacy single-segment turns where the distinction doesn't apply.
        interrupt_ack_ms: turn.t_first_ack_audio && turn.t_stt_final
            ? turn.t_first_ack_audio - turn.t_stt_final
            : null,
        interrupt_substantive_ms: turn.t_first_substantive_audio && turn.t_stt_final
            ? turn.t_first_substantive_audio - turn.t_stt_final
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
        return { count: 0, orchestrator: getCounters() };
    }
    const ttfa = turns.map(t => t.time_to_first_audio_ms).sort((a, b) => a - b);
    const interrupts = turns.map(t => t.interrupt_stop_ms).filter(x => x != null).sort((a, b) => a - b);
    const ack = turns.map(t => t.interrupt_ack_ms).filter(x => x != null).sort((a, b) => a - b);
    const sub = turns.map(t => t.interrupt_substantive_ms).filter(x => x != null).sort((a, b) => a - b);
    const costs = turns.map(t => t.estimated_cost_usd);
    const interrupted = turns.filter(t => t.abortReason === 'user_barge_in').length;
    return {
        count: turns.length,
        ttfa_ms_p50: percentile(ttfa, 0.50),
        ttfa_ms_p95: percentile(ttfa, 0.95),
        interrupt_stop_ms_p50: interrupts.length ? percentile(interrupts, 0.50) : null,
        interrupt_stop_ms_p95: interrupts.length ? percentile(interrupts, 0.95) : null,
        interrupt_ack_ms_p50: ack.length ? percentile(ack, 0.50) : null,
        interrupt_ack_ms_p95: ack.length ? percentile(ack, 0.95) : null,
        interrupt_substantive_ms_p50: sub.length ? percentile(sub, 0.50) : null,
        interrupt_substantive_ms_p95: sub.length ? percentile(sub, 0.95) : null,
        avg_cost_usd: costs.reduce((a, b) => a + b, 0) / costs.length,
        interrupt_rate: interrupted / turns.length,
        total_recorded: total,
        orchestrator: getCounters(),
    };
}

function percentile(sorted, p) {
    if (sorted.length === 0) return null;
    const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
    return sorted[idx];
}

module.exports = {
    newTurn, record, snapshot, aggregate, COST,
    // Orchestrator counters
    recordPhaseStrip,
    recordClassifierConsensus,
    recordWaitAbandon,
    recordFastPathClarification,
    getCounters,
};
