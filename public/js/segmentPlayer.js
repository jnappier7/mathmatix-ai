// public/js/segmentPlayer.js
// Client-side player for the segment orchestrator. Consumes NDJSON
// frames produced by utils/orchestrator/dispatcher.js and drives
// playback of:
//   - segment audio (HTMLAudioElement or WebAudio queue)
//   - board ops (delegated to window.whiteboard / visualTeachingHandler)
//   - wait state + hint-ladder rungs
//
// Speech-leads-pen: board ops for a segment are scheduled to begin
// SPEECH_LEADS_PEN_MS after audio onset. If audio is no-op'd (whiteboard
// closed or TTS off), board ops fire immediately on segment-start.
//
// On VAD onset (mic energy detected), call .interrupt() — that pauses
// audio, clears draw timers, and notifies the server. The interrupt
// path does NOT wait for the server; client is the source of truth for
// "I started talking just now."

(function () {
  'use strict';

  const SPEECH_LEADS_PEN_MS = 300;

  /**
   * @typedef {Object} SegmentPlayerOpts
   * @property {(frame:Object) => void} sendInterrupt - called with {type, segmentId, atMs, ...}
   * @property {(latex:Array) => void} [renderMathSteps] - legacy mirror callback (voice tutor)
   * @property {Object} [whiteboard] - window.whiteboard equivalent (for board-op execution)
   * @property {(text:string) => void} [onTranscript] - student transcript stream
   * @property {(payload:{turnId,reason}) => void} [onTurnEnd]
   * @property {(payload:{message}) => void} [onError]
   */

  class SegmentPlayer {
    /** @param {SegmentPlayerOpts} opts */
    constructor(opts = {}) {
      this.opts = opts;
      this.activeSegment = null;     // {id, audio, drawTimers:[], spoken, mode, startedAt}
      this.pendingBoardOps = [];     // queued during the leads-pen window
      this.boardOpsByseg = new Map();// segmentId -> [boardOp, ...]
      this.audioByseg = new Map();   // segmentId -> audioUrl (when sent separately)
      this.cumulativeMathSteps = []; // legacy mirror (renderMathSteps consumer)
      this.envelope = null;
      this.mode = 'idle';            // 'idle' | 'playing' | 'waiting' | 'interrupted' | 'ended'
    }

    /**
     * Feed a single NDJSON frame from the server.
     */
    handleFrame(frame) {
      if (!frame || typeof frame !== 'object') return;
      switch (frame.phase) {
        // ── Legacy voice-tutor frames (HTTP /process) ──
        case 'transcription':
          if (this.opts.onTranscript) this.opts.onTranscript(frame.transcription || '');
          break;
        case 'response':
          // Legacy single-segment response — also paints the math board
          // immediately like the existing voice-tutor flow.
          if (Array.isArray(frame.mathSteps) && this.opts.renderMathSteps) {
            this.opts.renderMathSteps(frame.mathSteps);
          }
          break;
        case 'audio':
          this._playAudioUrl(frame.audioUrl, null);
          break;

        // ── Orchestrator frames ──
        case 'envelope':
          this.envelope = frame.envelope;
          // Paint legacy math board IMMEDIATELY using the auto-derived
          // mirror so the student sees the math while audio loads.
          if (Array.isArray(frame.envelope?.mathSteps) && this.opts.renderMathSteps) {
            this.opts.renderMathSteps(frame.envelope.mathSteps);
            this.cumulativeMathSteps = frame.envelope.mathSteps.slice();
          }
          break;
        case 'segment-start':
          this._startSegment(frame);
          break;
        case 'board-op':
          this._enqueueBoardOp(frame.segmentId, frame.op);
          break;
        case 'segment-audio':
          this._playAudioUrl(frame.audioUrl, frame.segmentId);
          break;
        case 'segment-end':
          this._endSegment(frame.segmentId);
          break;
        case 'wait':
          this.mode = 'waiting';
          if (this.opts.onWait) this.opts.onWait(frame);
          break;
        case 'wait-rung':
          if (this.opts.onWaitRung) this.opts.onWaitRung(frame);
          break;
        case 'prefetch-hint':
          // Optional — clients with a TTS warm-pool can use this to start
          // synthesis early. Default no-op.
          if (this.opts.onPrefetchHint) this.opts.onPrefetchHint(frame);
          break;
        case 'interrupt-ack':
          // Server confirmed our interrupt. Already paused locally.
          if (this.opts.onInterruptAck) this.opts.onInterruptAck(frame);
          break;
        case 'flushed':
          if (this.opts.onFlushed) this.opts.onFlushed(frame.segmentIds || []);
          break;
        case 'turn-end':
          this.mode = 'ended';
          if (this.opts.onTurnEnd) this.opts.onTurnEnd({ turnId: frame.turnId, reason: frame.reason });
          break;
        case 'error':
          if (this.opts.onError) this.opts.onError(frame);
          break;
        default:
          // Unknown — ignore but don't fail
          break;
      }
    }

    _startSegment(frame) {
      // Tear down any prior segment cleanly
      if (this.activeSegment) this._teardownActive('superseded');
      const seg = {
        id: frame.segmentId,
        spoken: frame.spoken || '',
        mode: frame.mode || 'teacher',
        leadsPenMs: typeof frame.leadsPenMs === 'number' ? frame.leadsPenMs : SPEECH_LEADS_PEN_MS,
        startedAt: Date.now(),
        audio: null,
        drawTimers: [],
        boardOpsApplied: false,
      };
      this.activeSegment = seg;
      this.boardOpsByseg.set(seg.id, []);
      this.mode = 'playing';
      // Apply any board ops already queued for this segment
      this._maybeApplyBoardOps(seg.id);
    }

    _enqueueBoardOp(segmentId, op) {
      if (!segmentId || !op) return;
      const list = this.boardOpsByseg.get(segmentId) || [];
      list.push(op);
      this.boardOpsByseg.set(segmentId, list);
      this._maybeApplyBoardOps(segmentId);
    }

    _maybeApplyBoardOps(segmentId) {
      const seg = this.activeSegment;
      if (!seg || seg.id !== segmentId) return;
      const ops = this.boardOpsByseg.get(segmentId) || [];
      if (!ops.length) return;
      // Schedule via leads-pen — but if no audio is available for this
      // segment, fire immediately (e.g. whiteboard-closed mode that still
      // gets text). The existence of a queued audio URL is what gates it.
      const delay = seg.audio ? seg.leadsPenMs : 0;
      const timer = setTimeout(() => {
        if (!this.activeSegment || this.activeSegment.id !== segmentId) return;
        this._applyBoardOps(segmentId, ops.slice());
        // Mark as applied so subsequent ops on this segment fire immediately
        this.activeSegment.boardOpsApplied = true;
        // Drain the queue we already snapshotted
        this.boardOpsByseg.set(segmentId, []);
      }, delay);
      seg.drawTimers.push(timer);
    }

    _applyBoardOps(segmentId, ops) {
      if (!this.opts.whiteboard && !this.opts.onBoardOp) return;
      for (const op of ops) {
        try {
          if (this.opts.onBoardOp) {
            this.opts.onBoardOp(segmentId, op);
            continue;
          }
          this._dispatchToWhiteboard(op);
        } catch (e) {
          // Single op failure shouldn't abort the segment
          // eslint-disable-next-line no-console
          console.warn('[SegmentPlayer] boardOp failed', op, e);
        }
      }
    }

    _dispatchToWhiteboard(op) {
      const wb = this.opts.whiteboard;
      if (!wb) return;
      switch (op.op) {
        case 'writeStep':
          // Append to the legacy mirror so the math board updates in step
          // with audio. Only writeStep ops feed renderMathSteps; other op
          // types render directly on the whiteboard canvas.
          if (this.opts.renderMathSteps) {
            this.cumulativeMathSteps.push({
              label: op.label, latex: op.latex, explanation: op.explanation,
            });
            this.opts.renderMathSteps(this.cumulativeMathSteps.slice());
          }
          break;
        case 'writeText':
          if (typeof wb.aiWritePartialStep === 'function') {
            wb.aiWritePartialStep(op.text || '', op.x || 100, op.y || 100, false);
          }
          break;
        case 'highlight':
          if (typeof wb.highlightObject === 'function') {
            wb.highlightObject(op.objectId, op.color || '#fbbf24', op.durationMs || 3000);
          }
          break;
        case 'circleWithQuestion':
          if (typeof wb.aiCircleWithQuestion === 'function') {
            wb.aiCircleWithQuestion(op.objectId, op.message || '');
          }
          break;
        case 'drawArrowToBlank':
          if (typeof wb.aiDrawArrowToBlank === 'function') {
            wb.aiDrawArrowToBlank(op.fromId, op.message || '');
          }
          break;
        case 'moveToRegion':
          if (typeof wb.moveToRegion === 'function') {
            wb.moveToRegion(op.objectId, op.region);
          }
          break;
        case 'clear':
          if (typeof wb.clearBoard === 'function') wb.clearBoard();
          this.cumulativeMathSteps = [];
          if (this.opts.renderMathSteps) this.opts.renderMathSteps([]);
          break;
        case 'inlineTag':
          // Defer to existing visualTeachingHandler if available
          if (window.visualTeachingHandler && typeof window.visualTeachingHandler.handleInlineTag === 'function') {
            window.visualTeachingHandler.handleInlineTag(op.raw);
          }
          break;
        // graph / algebraTiles / unitCircle / etc. — best handled by the
        // existing visualTeachingHandler via inlineTag bridge for now.
        default:
          break;
      }
    }

    _playAudioUrl(url, segmentId) {
      if (!url) return;
      const audio = new Audio(url);
      audio.addEventListener('ended', () => {
        // If this segment had no segment-end frame (legacy /process path),
        // synthesize one so cumulative state advances.
        if (!segmentId) return;
        this._endSegment(segmentId);
      });
      audio.addEventListener('error', () => {
        if (this.opts.onError) this.opts.onError({ message: 'audio playback error' });
      });
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => { /* autoplay blocked; client handles */ });
      }
      if (segmentId && this.activeSegment && this.activeSegment.id === segmentId) {
        this.activeSegment.audio = audio;
      } else if (!segmentId) {
        // Legacy single-segment audio
        this.activeSegment = this.activeSegment || { id: null, spoken: '', drawTimers: [] };
        this.activeSegment.audio = audio;
      }
    }

    _endSegment(segmentId) {
      if (!this.activeSegment || this.activeSegment.id !== segmentId) return;
      this._teardownActive('ended');
    }

    _teardownActive(reason) {
      const seg = this.activeSegment;
      if (!seg) return;
      try { seg.audio?.pause(); } catch (_) {}
      for (const t of seg.drawTimers) {
        try { clearTimeout(t); } catch (_) {}
      }
      this.activeSegment = null;
    }

    /**
     * Student spoke. Stop audio + draw timers immediately, then notify
     * the server. Returns the {segmentId, atMs} pair we sent.
     */
    interrupt() {
      const seg = this.activeSegment;
      const atMs = seg?.audio?.currentTime != null
        ? Math.round(seg.audio.currentTime * 1000)
        : (seg ? Date.now() - seg.startedAt : 0);
      const segmentId = seg?.id || null;
      this._teardownActive('interrupted');
      this.mode = 'interrupted';
      if (typeof this.opts.sendInterrupt === 'function') {
        try {
          this.opts.sendInterrupt({
            type: 'interruptStart',
            segmentId,
            atMs,
            ts: Date.now(),
          });
        } catch (_) { /* swallow */ }
      }
      return { segmentId, atMs };
    }

    /** External shutdown — used on page unload / manual stop. */
    shutdown(reason = 'shutdown') {
      this._teardownActive(reason);
      this.mode = 'ended';
    }
  }

  window.MMXSegmentPlayer = SegmentPlayer;
})();
