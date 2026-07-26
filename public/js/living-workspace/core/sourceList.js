/* ============================================================
   sourceList.js — derive the board's Source Cards from conversation data.

   Spec §5.1: uploaded materials must appear on the workspace board, not
   vanish into an attachment tray. The server already persists every upload
   as a servable reference on its message ({uploadId, fileType, mimeType},
   bytes at /api/student/uploads/:id/file), so the source list is DERIVED:

     • on history load, from messages[].attachments (user messages only —
       the student's uploads are the sources; tutor-side images are not),
     • on a live turn, from the response's `sourceUploads` delta.

   Dedupes by uploadId, keeps arrival order (oldest first, so the newest
   source lands nearest the student), caps the dock at MAX_SOURCES — the
   board shows a session's working set, the transcript remains the archive.

   Pure; UMD-lite like the rest of core/. The DOM lives in dom/sourceDock.js.
   ============================================================ */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (root) {
    (root.LWS = root.LWS || {}).sourcesFromMessages = mod.sourcesFromMessages;
    root.LWS.mergeSources = mod.mergeSources;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_SOURCES = 6;

  function normalize(att) {
    if (!att || att.uploadId == null) return null;
    return {
      uploadId: String(att.uploadId),
      fileType: att.fileType === 'pdf' ? 'pdf' : 'image',
      mimeType: att.mimeType || null,
    };
  }

  // Append `incoming` to `existing`, dropping uploadIds already present and
  // trimming from the FRONT (oldest) past the cap. Both inputs untouched.
  function mergeSources(existing, incoming) {
    var out = (Array.isArray(existing) ? existing : []).slice();
    var seen = {};
    out.forEach(function (s) { if (s && s.uploadId != null) seen[String(s.uploadId)] = true; });
    (Array.isArray(incoming) ? incoming : []).forEach(function (att) {
      var s = normalize(att);
      if (!s || seen[s.uploadId]) return;
      seen[s.uploadId] = true;
      out.push(s);
    });
    while (out.length > MAX_SOURCES) out.shift();
    return out;
  }

  function sourcesFromMessages(messages) {
    var atts = [];
    (Array.isArray(messages) ? messages : []).forEach(function (m) {
      if (!m || m.role !== 'user' || !Array.isArray(m.attachments)) return;
      atts = atts.concat(m.attachments);
    });
    return mergeSources([], atts);
  }

  return { sourcesFromMessages: sourcesFromMessages, mergeSources: mergeSources, MAX_SOURCES: MAX_SOURCES };
});
