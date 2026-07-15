/* ============================================================
   voiceBoardTranslate.js — voice board payload -> LWS boardCommands.

   Voice mode predates the Living Workspace and speaks the legacy board
   protocol: response_final carries `mathSteps` (structured [{latex,text,visual}])
   and `boardActions` ([WRITE:x,y,text] / circle / arrow / clear). The LWS
   derivation view speaks boardCommands (pose/resolve/verify/graph/clear via the
   P5 adapter). Without a bridge, voice turns drive only the (now hidden) legacy
   board and the derivation view freezes after the first (text-posed) problem.

   This translates one voice turn's payload into boardCommands so
   LWS_CHAT.applyVoiceBoard can render it. Fidelity is intentionally
   conservative: structured math steps become derivation lines; annotations
   (circle/arrow/highlight) have no derivation equivalent and are dropped.
   ============================================================ */
(function (root) {
  'use strict';
  var LWS = root.LWS = root.LWS || {};

  function clean(s) { return String(s == null ? '' : s).trim(); }

  // A legacy [WRITE:...] payload is only board-worthy if it's actually math —
  // freeform prose the tutor "writes" is narration, not a derivation line.
  function looksLikeMath(s) {
    if (!s) return false;
    return /=/.test(s)
      || /[a-zA-Z]\s*\^?\s*\d/.test(s)          // x^2, 3x
      || /\d\s*[+\-*/^]\s*\d/.test(s)           // 2 + 3
      || /\\frac|\\sqrt|\\int|\\sum/.test(s);   // latex math
  }

  /**
   * Translate one voice turn's board payload into LWS boardCommands.
   * @param {{mathSteps?: Array, boardActions?: Array}} payload
   * @returns {Array<object>} boardCommands for applyBoardCommands
   */
  function voiceToBoardCommands(payload) {
    payload = payload || {};
    var cmds = [];
    var lastTex = null;
    function pushStep(tex) {
      tex = clean(tex);
      if (!tex || tex === lastTex) return;   // drop empties + consecutive dupes
      cmds.push({ action: 'resolve', tex: tex });
      lastTex = tex;
    }

    // Preferred source: structured math steps (math-steps / orchestrated mode).
    var steps = Array.isArray(payload.mathSteps) ? payload.mathSteps : [];
    if (steps.length) {
      for (var i = 0; i < steps.length; i++) {
        var s = steps[i];
        if (!s) continue;
        if (s.visual && (s.visual.fn || s.visual.query)) {
          if (s.visual.fn) cmds.push({ action: 'graph', fn: s.visual.fn, caption: s.visual.caption });
          else cmds.push({ action: 'image', query: s.visual.query, caption: s.visual.caption });
          lastTex = null;
          continue;
        }
        if (s.latex) pushStep(s.latex);
        // text-only steps are spoken narration, not board content — skip.
      }
      return cmds;
    }

    // Fallback: legacy [WRITE:...] board actions (board-actions mode).
    var actions = Array.isArray(payload.boardActions) ? payload.boardActions : [];
    for (var j = 0; j < actions.length; j++) {
      var a = actions[j];
      if (!a || !a.type) continue;
      if (a.type === 'clear') { cmds.push({ action: 'clear' }); lastTex = null; continue; }
      if (a.type === 'write' && looksLikeMath(a.text)) pushStep(a.text);
      // circle / arrow / highlight: annotations with no derivation equivalent — drop.
    }
    return cmds;
  }

  LWS.voiceToBoardCommands = voiceToBoardCommands;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { voiceToBoardCommands: voiceToBoardCommands };
  }
})(typeof self !== 'undefined' ? self : this);
