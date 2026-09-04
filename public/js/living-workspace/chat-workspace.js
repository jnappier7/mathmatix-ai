/* ============================================================
   chat-workspace.js — the Living Workspace, INLINE IN THE CHAT COLUMN.

   Default = OFF: this file loads on chat.html but does NOTHING unless
   the LivingWorkspace flag is dev|beta|live. So the flag-off experience
   (the legacy tabbed board in the right rail) is untouched, and none of
   the ~10 workspace scripts are even fetched.

   WHERE THE WORK LIVES (the 2026-09 move off the right rail):
   The board is no longer a 320px side column. The tutor's work renders
   in the chat column itself, in two places:

     • the WORK DOCK (#cr-work-dock) — the problem in focus, docked
       directly above the composer at full chat width. It grows in place
       as the turn's steps arrive and collapses to nothing when there is
       no work, so it costs zero space when idle.
     • the TRANSCRIPT — when a problem finishes, its card is SEALED into
       the message list as scrollback. The conversation is the archive,
       which is why this mode has no thumbnail rail: looking back at
       earlier work is just scrolling.

   Why: the derivation is a document-style column, and a 320px rail is
   the worst possible width for one (the card's own layout caps at
   620px). Inline it reads at full width, in the same reading order as
   the sentence that describes it, on the surface phones already use.

   When ON (window.MM_FEATURES.livingWorkspace or ?livingWorkspace=dev):
     1. lazily inject the workspace CSS + UMD-lite modules (KaTeX/
        MathLive are already on the chat page — reused, not re-loaded),
     2. mount the derivation view into the work dock,
     3. expose window.LWS_CHAT.applyBoardCommands(cmds): the chat SSE
        handler feeds each turn's board_commands here; the P5 adapter
        turns them into workspace elements that render on the surface.

   Nothing upstream changes: the same guarded board commands, the same
   adapter, the same anti-cheat gauntlet. This is a placement change.
   ============================================================ */
(function () {
  'use strict';

  // ── Lightweight flag read (no dependency on flags.js, which we may not
  //    have loaded yet). Mirrors core/flags.js precedence. ──
  function resolveMode() {
    try {
      var qs = new URLSearchParams(window.location.search || '');
      var q = qs.get('livingWorkspace');
      if (q) return q;
    } catch (_) { /* no URL */ }
    var f = window.MM_FEATURES && window.MM_FEATURES.livingWorkspace;
    return f || 'off';
  }
  var MODE = resolveMode();
  var ON = MODE === 'dev' || MODE === 'beta' || MODE === 'live';

  // Chat context for the student-move loop (P7). Chat refines it via
  // window.LWS_CHAT.setContext({ conversationId, workspaceId }).
  var ctx = { conversationId: null, workspaceId: 'chat' };

  // Public surface is always defined so callers don't need to feature-detect
  // twice; when off, applyBoardCommands is a no-op.
  var api = {
    isOn: function () { return ON; },
    applyBoardCommands: function () {},
    applyVoiceBoard: function () {},
    // Voice caption/spotlight hooks — see derivationView.setSpeaking. No-ops
    // until the view mounts, so the caption layer can call them unguarded.
    setSpeaking: function () {},
    setCaption: function () {},
    setContext: function (c) { if (c && typeof c === 'object') { if (c.conversationId != null) ctx.conversationId = c.conversationId; if (c.workspaceId != null) ctx.workspaceId = c.workspaceId; } },
    // Wipe the board back to its empty state, thumbnail rail included. Called
    // when the server rolls the conversation over after an idle gap — the new
    // session must not open onto the previous one's work.
    reset: function () {},
    // Rebuild the board from a persisted conversation.boardLedger (session
    // switch / page re-mount). No-op when the workspace is off.
    hydrate: function () {},
    // Source Cards (spec §5.1): set the dock from a conversation's messages
    // (history load) or append this turn's uploads (live delta).
    setSourcesFromMessages: function () {},
    addSources: function () {},
    // Source↔problem link (spec §5.4): paint/clear the in-focus problem's
    // "from my worksheet" chip. Fed by the response's boardSource field.
    setProblemSource: function () {},
    // Tutor pointing (spec §8): highlight the board line the tutor named.
    pointAt: function () {},
    // The student keeping a chat message: open the notebook with its composer
    // prefilled. Chat's per-message 📓 chip calls this on click (the same chip
    // dragged onto the pill reaches the panel's own drop handler instead).
    // Returns false when there's no notebook to capture into, so chat can
    // leave the chip out rather than render a dead control.
    captureToNotebook: function () { return false; },
  };
  window.LWS_CHAT = api;
  if (!ON) return;

  // Cache-buster for the lazily-loaded workspace CSS + modules. prod serves
  // public/ with a 7-day cache and no content hashing, so bump this whenever
  // any living-workspace asset changes (and the chat.html <script ?v=> tag to
  // match, so this file itself refreshes). See project_asset_cache_busting.
  var ASSET_V = '?v=20260904a';
  var BASE = '/js/living-workspace/';
  var SCRIPTS = [
    'core/flags.js', 'core/viewport.js', 'core/elementRegistry.js',
    'core/snapshotManager.js', 'core/a11yCommands.js', 'core/ledgerReplay.js',
    'core/sourceList.js', 'dom/sourceDock.js', 'dom/notebookPanel.js', 'dom/modelElement.js',
    'dom/gridRenderer.js', 'dom/overlayManager.js', 'dom/equationElement.js',
    'dom/tileElement.js', 'dom/numberLineElement.js', 'dom/graphElement.js',
    'dom/noteElement.js', 'dom/imageElement.js', 'dom/studentMoveClient.js',
    'dom/interactionController.js', 'dom/shell.js', 'dom/legacyBoardAdapter.js',
    'dom/derivationView.js', 'dom/voiceBoardTranslate.js',
  ];

  // Build brick #1: the chat board renders as a FOCUSED DERIVATION
  // (dom/derivationView.js), not free-floating canvas cards. `dv` is that view.
  var dv = null;
  var dock = null;           // SourceDock — uploads living on the board
  var ready = false;
  var pending = null;        // latest board_commands received before ready
  var pendingLedger;         // ledger passed to hydrate() before ready (undefined = none)
  var pendingSources;        // source list set before ready (undefined = none)
  var turn = 0;

  function injectCss() {
    if (document.querySelector('link[data-lws]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = '/css/living-workspace.css' + ASSET_V; link.dataset.lws = '1';
    document.head.appendChild(link);
  }

  // Sequential loader: each script executes before the next, so UMD-lite
  // deps (viewport before shell, etc.) resolve in order.
  function loadNext(i, done) {
    if (i >= SCRIPTS.length) return done();
    var s = document.createElement('script');
    s.src = BASE + SCRIPTS[i] + ASSET_V;
    s.async = false;
    s.onload = function () { loadNext(i + 1, done); };
    s.onerror = function () { console.error('[LWS_CHAT] failed to load', s.src); };
    document.body.appendChild(s);
  }

  // Where the work docks: a slot inside the chat column, between the message
  // list and the composer (chat.html #cr-work-dock). Falls back to a floating
  // panel when the slot is absent (dev harnesses, other pages) so the
  // integration still works anywhere.
  function buildDock() {
    var slot = document.getElementById('cr-work-dock');
    if (slot) {
      slot.classList.add('is-live');
      // A long derivation can grow to the dock's cap and push the conversation
      // up, so the student needs a way to get the height back without losing
      // the work. CSS hides the whole bar while the dock is empty.
      var bar = document.createElement('div');
      bar.className = 'lws-dock-bar';
      var label = document.createElement('span');
      label.className = 'lws-dock-bar-t';
      label.textContent = 'Our work';
      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'lws-dock-toggle';
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-controls', 'lws-chat-mount');
      function paintToggle(collapsed) {
        toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        toggle.innerHTML = collapsed
          ? '<i class="fas fa-chevron-up" aria-hidden="true"></i><span>Show</span>'
          : '<i class="fas fa-chevron-down" aria-hidden="true"></i><span>Hide</span>';
        toggle.setAttribute('aria-label', collapsed ? 'Show our work' : 'Hide our work');
      }
      paintToggle(false);
      toggle.addEventListener('click', function () {
        paintToggle(slot.classList.toggle('is-collapsed'));
      });
      bar.appendChild(label);
      bar.appendChild(toggle);
      slot.appendChild(bar);

      var mountIn = document.createElement('div');
      mountIn.id = 'lws-chat-mount';
      slot.appendChild(mountIn);
      return mountIn;
    }

    // Fallback: floating dev panel.
    var panel = document.createElement('div');
    panel.id = 'lws-chat-panel';
    panel.setAttribute('aria-label', 'Living Workspace (preview)');
    panel.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:16px',
      'width:min(46vw,640px)', 'max-height:60vh', 'z-index:2200',
      'background:var(--cr-bg-panel,#fff)', 'border:1px solid rgba(15,26,36,0.12)',
      'border-radius:16px', 'box-shadow:0 12px 40px rgba(15,26,36,0.18)',
      'display:flex', 'flex-direction:column', 'overflow:hidden',
    ].join(';');

    var bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid rgba(15,26,36,0.1);font:600 12px/1 Inter,system-ui,sans-serif;color:#5B6876;';
    bar.innerHTML = '<span>🧪 Living Workspace <span style="opacity:.7">(' + MODE + ' preview)</span></span>';
    var close = document.createElement('button');
    close.type = 'button'; close.textContent = '×';
    close.setAttribute('aria-label', 'Hide workspace preview');
    close.style.cssText = 'border:none;background:transparent;font-size:18px;line-height:1;cursor:pointer;color:#5B6876;';
    close.addEventListener('click', function () { panel.style.display = 'none'; });
    bar.appendChild(close);

    var mount = document.createElement('div');
    mount.id = 'lws-chat-mount';
    mount.style.cssText = 'flex:1;min-height:0;position:relative;';

    panel.appendChild(bar);
    panel.appendChild(mount);
    document.body.appendChild(panel);
    return mount;
  }

  // The Source Dock's viewer overlay fills whatever element hosts it, so the
  // dock does NOT live in the work dock (a short strip above the composer):
  // a worksheet page opened in a 200px-tall overlay is unreadable. It hosts in
  // its own full-height layer over the chat panel instead.
  //
  // That layer must carry .lws-root: every --lws-* token (colours, the
  // overlay's opaque background) is defined ON .lws-root, and a widget mounted
  // outside one resolves them to nothing — which shipped once already as a
  // transparent overlay bleeding over the board.
  function buildOverlayHost() {
    var chat = document.getElementById('chat-container');
    if (!chat) return null;
    var host = document.getElementById('lws-chat-overlays');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'lws-chat-overlays';
    host.className = 'lws-root lws-chat-overlays';
    if (getComputedStyle(chat).position === 'static') chat.style.position = 'relative';
    chat.appendChild(host);
    return host;
  }

  // ── Sealing: a finished problem leaves the dock and becomes scrollback ────
  //
  // Live turns seal at the end of the transcript (the conversation is at its
  // newest message, so that is where the work just finished). A hydration
  // replay instead places each card by when it was completed, so reopening a
  // conversation reads in the order it actually happened.
  var sealDeferred = null;    // non-null while a hydrate replay is running

  function transcript() { return document.getElementById('chat-messages-container'); }

  function placeSealed(node, completedAt) {
    var box = transcript();
    if (!box) return;
    var at = completedAt ? Date.parse(completedAt) : NaN;
    if (!isFinite(at)) { box.appendChild(node); return; }
    // Insert after the last message that predates the completion. Messages are
    // stamped with data-ts on history load; a transcript with no stamps (a
    // live session) falls through to the append below.
    var stamped = box.querySelectorAll('[data-ts]');
    var after = null;
    for (var i = 0; i < stamped.length; i++) {
      var ts = Number(stamped[i].getAttribute('data-ts'));
      if (isFinite(ts) && ts <= at) after = stamped[i]; else break;
    }
    if (!after) { box.insertBefore(node, stamped.length ? stamped[0] : null); return; }
    // Two problems finished between the same pair of messages anchor to the
    // same message. Step past cards already sealed there, or the second one
    // would land in front of the first and the replay would read backwards.
    var at2 = after.nextSibling;
    while (at2 && at2.classList && at2.classList.contains('lws-sealed')) at2 = at2.nextSibling;
    box.insertBefore(node, at2);
  }

  function sealToTranscript(entry) {
    if (!dv || !entry) return;
    var node;
    try { node = dv.buildSealedCard(entry); }
    catch (e) { console.error('[LWS_CHAT] seal render failed', e); return; }
    var box = transcript();
    // Was the student at the live edge BEFORE we grow the transcript? A sealed
    // card is tall, so appending one silently pushes the newest message out of
    // view. Only follow if they were already at the bottom — someone scrolled
    // up re-reading an earlier problem must not be yanked back down.
    var atBottom = !!box && (box.scrollHeight - box.scrollTop - box.clientHeight) < 80;
    placeSealed(node, entry.completedAt);
    if (atBottom && box) {
      try { box.scrollTop = box.scrollHeight; } catch (_) { /* not laid out */ }
    }
  }

  // Drop every sealed card from the transcript. Chat clears the message list
  // itself on a session switch, but a rollover keeps the thread and re-seeds
  // it — so the previous session's work must not survive as orphan cards whose
  // renderers resetAll has already disposed.
  function clearSealed() {
    var box = transcript();
    if (!box) return;
    var old = box.querySelectorAll('.lws-sealed');
    for (var i = 0; i < old.length; i++) {
      if (old[i].parentNode) old[i].parentNode.removeChild(old[i]);
    }
  }

  function onSeal(entry) {
    // During hydration the per-problem metadata (assistance level, completedAt)
    // has not been zipped on yet — ledgerMeta runs after the replay. Sealing
    // now would render every card as a bare "Solved" and place it blind, so
    // hold the entries and paint them once the replay is annotated.
    if (sealDeferred) { sealDeferred.push(entry); return; }
    sealToTranscript(entry);
  }

  // Renderers for the inline blocks the derivation embeds. Equation-family
  // lines (pose/resolve/apply/verify/scaffold/example) are typeset directly by
  // the view; only graph / image / geometry need a renderer, and those are the
  // only non-equation element types board_commands ever produce via the P5
  // adapter (tiles / number lines are never emitted by board_commands, so the
  // derivation needs no student-move loop).
  function makeRenderers() {
    var r = {};
    if (window.LWS.GraphElement) {
      r.graph = window.LWS.GraphElement.makeRenderer({ onChange: function () { /* exploration only; no answer injection */ } });
    }
    // Image (P15): real safe-search picture, degrading to a labelled note.
    if (window.LWS.ImageElement) r.image = window.LWS.ImageElement.makeRenderer();
    else if (window.LWS.NoteElement) r.image = window.LWS.NoteElement.makeRenderer();
    // Geometry (P17): titled note card until a real figure renderer lands.
    if (window.LWS.NoteElement) r.geometry = window.LWS.NoteElement.makeRenderer();
    // Interactive concept models (§6.8) — bridges to the page's
    // ConceptModelRenderer engine (JSXGraph/tokens, linked representations).
    // §6.9: settled manipulations become exploration StudentMoves — verified
    // server-side (meaningful vs noise), no tutor turn, no answer path.
    if (window.LWS.ModelElement) {
      r.model = window.LWS.ModelElement.makeRenderer({ onInteraction: sendModelExploration });
    }
    return r;
  }

  // Render one turn's board_commands onto the surface via the P5 adapter.
  // Render one turn's board_commands as derivation items. The P5 adapter maps
  // commands → elements (role-tagged); the derivation view lays them out
  // (problem pinned, steps flowing, graph/image inline). `clear` wipes first.
  function render(cmds) {
    if (!ready || !dv) { pending = cmds; return; }
    var out;
    try { out = window.LWS.adaptBoardCommands(cmds, { idPrefix: 'lgc' + (++turn) }); }
    catch (e) { console.error('[LWS_CHAT] adapt failed', e); return; }
    try { dv.apply(out.elements, out.clear); }
    catch (e) { console.error('[LWS_CHAT] render failed', e); }
  }

  api.applyBoardCommands = function (cmds) {
    if (!Array.isArray(cmds) || cmds.length === 0) return;
    render(cmds);
  };

  // Voice turns speak the legacy board protocol (mathSteps / boardActions).
  // Translate to boardCommands and render, so the derivation view updates live
  // during a voice session instead of freezing after the first (text-posed)
  // problem. No-op if the translator or payload is empty.
  api.applyVoiceBoard = function (payload) {
    if (!window.LWS || typeof window.LWS.voiceToBoardCommands !== 'function') return;
    var cmds;
    try { cmds = window.LWS.voiceToBoardCommands(payload); }
    catch (e) { console.error('[LWS_CHAT] voice translate failed', e); return; }
    if (Array.isArray(cmds) && cmds.length) render(cmds);
  };

  api.setSpeaking = function (on) {
    if (!dv) return;
    try { dv.setSpeaking(on); } catch (_) { /* view torn down */ }
  };

  api.setCaption = function (text) {
    if (!dv) return;
    try { dv.setCaption(text); } catch (_) { /* view torn down */ }
  };

  api.reset = function () {
    pending = null;                 // don't let a queued turn repaint the old session
    pendingLedger = undefined;
    pendingSources = undefined;
    if (dock) { try { dock.clear(); } catch (e) { console.error('[LWS_CHAT] dock clear failed', e); } }
    clearSealed();
    if (!dv) return;
    try { dv.resetAll(); } catch (e) { console.error('[LWS_CHAT] reset failed', e); }
  };

  var sources = [];
  function paintSources() {
    if (!dock) return;
    try { dock.setSources(sources); } catch (e) { console.error('[LWS_CHAT] dock render failed', e); }
  }

  // History load: the full source list derives from messages[].attachments.
  // Replaces whatever the dock held — a switch means a different conversation.
  api.setSourcesFromMessages = function (messages) {
    if (!window.LWS || typeof window.LWS.sourcesFromMessages !== 'function') { pendingSources = messages || []; return; }
    sources = window.LWS.sourcesFromMessages(messages);
    if (!ready) { pendingSources = messages || []; return; }
    paintSources();
  };

  // Live turn: the response's sourceUploads delta appends to the dock.
  api.addSources = function (delta) {
    if (!Array.isArray(delta) || !delta.length) return;
    if (!window.LWS || typeof window.LWS.mergeSources !== 'function' || !ready) return;
    sources = window.LWS.mergeSources(sources, delta);
    paintSources();
  };

  api.setProblemSource = function (ref) {
    if (!ready || !dv) return;
    try { dv.setProblemSource(ref || null); } catch (e) { console.error('[LWS_CHAT] problem source failed', e); }
  };

  api.pointAt = function (ref) {
    if (!ready || !dv) return;
    try { dv.pointAt(ref); } catch (e) { console.error('[LWS_CHAT] pointAt failed', e); }
  };

  // The problem header's chip → reopen the docked source with the problem's
  // region highlighted. Falls back to a bare open when the source has scrolled
  // off the dock (older than the cap) — the ref still names it servably.
  function openLinkedSource(ref) {
    if (!dock || !ref || !ref.uploadId) return;
    var src = null;
    for (var i = 0; i < sources.length; i++) {
      if (sources[i] && sources[i].uploadId === ref.uploadId) { src = sources[i]; break; }
    }
    if (!src) src = { uploadId: ref.uploadId, fileType: 'image', mimeType: null };
    try { dock.openSource(src, 'My worksheet', ref.region || null); }
    catch (e) { console.error('[LWS_CHAT] open linked source failed', e); }
  }

  // A settled concept-model manipulation (§6.9): one exploration StudentMove
  // per changed param. withTutor:false — exploration never runs a tutor turn;
  // the server judges meaningful-vs-noise and records transfer evidence.
  function sendModelExploration(payload) {
    if (!window.LWS || !window.LWS.StudentMoveClient || !payload || !Array.isArray(payload.changes)) return;
    payload.changes.forEach(function (ch) {
      try {
        window.LWS.StudentMoveClient.sendMove({
          conversationId: String(ctx.conversationId || ''),
          workspaceId: String(ctx.workspaceId || 'chat'),
          elementId: payload.elementId || 'model',
          elementType: 'model',
          source: 'gesture',
          mode: 'exploration',
          operation: {
            type: 'set_param',
            parameters: {
              modelName: payload.model, param: ch.param,
              from: ch.from, to: ch.to,
              min: ch.min, max: ch.max,
            },
          },
          previousState: { params: (function () { var o = {}; o[ch.param] = ch.from; return o; })() },
          proposedState: { params: (function () { var o = {}; o[ch.param] = ch.to; return o; })() },
        }, { withTutor: false, fetch: window.csrfFetch || undefined });
      } catch (e) { console.error('[LWS_CHAT] model move send failed', e); }
    });
  }

  // A filled scaffold blank (owner call, 2026-07-28): ONE StudentMove through
  // the tile lane — server-authoritative verdict (deterministic for a single-
  // blank equation) + the tutor's reaction in the same round trip. The board
  // paints the verdict; the reaction lands in chat via appendMessage.
  document.addEventListener('lws:blank-submit', function (e) {
    var d = e && e.detail;
    if (!d || !window.LWS || !window.LWS.StudentMoveClient) return;
    try {
      window.LWS.StudentMoveClient.sendMove({
        conversationId: String(ctx.conversationId || ''),
        workspaceId: String(ctx.workspaceId || 'chat'),
        elementId: (d.row && d.row.getAttribute('data-lws-id')) || 'scaffold',
        elementType: 'equation',
        source: 'keyboard',
        mode: 'attempt',
        gestureType: 'edit',
        operation: {
          type: 'fill_blank',
          parameters: { stepTex: d.stepTex, blankIndex: d.blankIndex, value: d.value },
        },
        previousState: { tex: d.stepTex },
        proposedState: { filled: d.value },
      }, { withTutor: true, fetch: window.csrfFetch || undefined }).then(function (result) {
        var vm = result && result.verifiedMove;
        var box = d.row && d.row.querySelector('.lws-blank-pending');
        if (box) {
          box.classList.remove('lws-blank-pending');
          if (vm && vm.mathematicallyValid === true) box.classList.add('lws-blank-ok');
          else if (vm && vm.mathematicallyValid === false) box.classList.add('lws-blank-bad');
          else box.classList.add('lws-blank-open');   // tutor decides — stay neutral
        }
        var resp = result && result.response;
        var text = resp && (resp.text || resp.message || (resp.response && resp.response.text));
        if (text && typeof window.appendMessage === 'function') {
          window.appendMessage(text, 'ai');
        }
        // Full celebration, same as a typed turn: XP ladder, level-ups, coins,
        // quest events, badges (script.js applyTurnRewards — shared renderer).
        // AFTER appendMessage so the inline XP chip lands on the reaction bubble.
        if (resp && typeof window.mmApplyTurnRewards === 'function') {
          try { window.mmApplyTurnRewards(resp); } catch (err) { console.error('[LWS_CHAT] turn rewards failed', err); }
        }
      }).catch(function (err) { console.error('[LWS_CHAT] blank move failed', err); });
    } catch (err) { console.error('[LWS_CHAT] blank move failed', err); }
  });

  // A confirmed region selection: the crop goes to the tutor as a normal chat
  // photo turn (OCR, diagnose, the works) tagged with the source ref so the
  // posed problem links back to the worksheet (spec §5.3–5.4).
  function askAboutRegion(file, region, src) {
    if (typeof window.mmAskAboutRegion !== 'function') { console.error('[LWS_CHAT] mmAskAboutRegion unavailable'); return; }
    window.mmAskAboutRegion(
      file,
      "Here's a problem from my worksheet — can we work on this one?",
      { uploadId: src.uploadId, region: region }
    );
  }

  // Rebuild the board from a persisted conversation.boardLedger: each finished
  // problem replays and is sealed back into the transcript, the in-progress one
  // lands in the work dock. Replays run through the SAME adapter/render path as
  // live turns, so hydration can't drift from live behavior. hydrate(null) is a
  // plain reset (a conversation with no board history must show no work).
  function doHydrate(ledger) {
    try { dv.resetAll(); } catch (e) { console.error('[LWS_CHAT] hydrate reset failed', e); }
    clearSealed();
    if (!ledger || typeof window.LWS.ledgerToTurns !== 'function') return;
    var turns;
    try { turns = window.LWS.ledgerToTurns(ledger); }
    catch (e) { console.error('[LWS_CHAT] ledger replay failed', e); return; }
    // Hold the seals: the replay archives each finished problem BEFORE
    // ledgerMeta has zipped its assistance level and completedAt on, and both
    // decide how a sealed card reads and where it lands in the transcript.
    sealDeferred = [];
    try {
      turns.forEach(render);
      // Commands can't carry per-problem metadata (assistance level etc.) —
      // zip it onto the archive entries the replay just produced. The deferred
      // seals hold the SAME entry objects, so this annotates them in place.
      if (typeof window.LWS.ledgerMeta === 'function') {
        try { dv.annotateArchive(window.LWS.ledgerMeta(ledger)); }
        catch (e) { console.error('[LWS_CHAT] archive annotate failed', e); }
      }
    } finally {
      var held = sealDeferred;
      sealDeferred = null;              // before painting, so a seal can't re-queue
      held.forEach(sealToTranscript);
    }
    // The in-focus problem's source link survives the reload too.
    if (ledger.current && ledger.current.sourceRef) {
      try { dv.setProblemSource(ledger.current.sourceRef); }
      catch (e) { console.error('[LWS_CHAT] hydrate problem source failed', e); }
    }
  }

  api.hydrate = function (ledger) {
    pending = null;                 // queued live turns belong to the old view
    if (!ready || !dv) { pendingLedger = ledger || null; return; }
    doHydrate(ledger);
  };

  function boot() {
    injectCss();
    loadNext(0, function () {
      if (!window.LWS || !window.LWS.DerivationView) { console.error('[LWS_CHAT] DerivationView not available after load'); return; }
      var mount = buildDock();
      dv = new window.LWS.DerivationView(mount, {
        renderers: makeRenderers(),
        onOpenSource: openLinkedSource,
        onSeal: onSeal,
      });
      // The derivation's A−/A+ text-size control pins itself to its own
      // top-right corner. In a full-height rail that read as board chrome; over
      // a short dock whose card is left-aligned it reads as an orphan floating
      // in the margin. The dock already has a bar for chrome — move it there.
      // Handlers are closures over the buttons, so re-parenting is safe.
      try {
        var bar = document.querySelector('#cr-work-dock .lws-dock-bar');
        var az = dv.el && dv.el.root && dv.el.root.querySelector('.lws-dv-az');
        if (bar && az) bar.insertBefore(az, bar.querySelector('.lws-dock-toggle'));
      } catch (e) { console.error('[LWS_CHAT] text-size relocate failed', e); }

      var widgetHost = buildOverlayHost() || (dv.el && dv.el.root) || mount;
      if (window.LWS.SourceDock) {
        try { dock = new window.LWS.SourceDock(widgetHost, { onAskRegion: askAboutRegion }); } catch (e) { console.error('[LWS_CHAT] dock mount failed', e); }
      }
      if (window.LWS.NotebookPanel) {
        try {
          var notebook = new window.LWS.NotebookPanel(widgetHost);
          api.captureToNotebook = function (text) {
            try { notebook.captureText(text); return true; }
            catch (e) { console.error('[LWS_CHAT] notebook capture failed', e); return false; }
          };
        } catch (e) { console.error('[LWS_CHAT] notebook mount failed', e); }
      }
      ready = true;
      if (pendingSources !== undefined) { var ps = pendingSources; pendingSources = undefined; api.setSourcesFromMessages(ps); }
      // Queued work replays in arrival order: hydrate() clears any turn queued
      // before it, so a `pending` that is still set alongside a pendingLedger
      // arrived AFTER the hydrate and renders on top of the rebuilt board.
      if (pendingLedger !== undefined) { var l = pendingLedger; pendingLedger = undefined; doHydrate(l); }
      if (pending) { var p = pending; pending = null; render(p); }
      console.log('[LWS_CHAT] mounted (inline work dock, mode=' + MODE + ')');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
