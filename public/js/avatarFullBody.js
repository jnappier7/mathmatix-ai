// public/js/avatarFullBody.js
// Shared FULL-BODY student avatar renderer — global (window.AvatarFullBody) so it
// works on ES-module pages (chat) and classic inline-script pages (progress,
// parent dashboard) alike.
//
// Full-body art lives at /images/students/<color>.png and is selected via
// user.selectedAvatarId === 'student.<color>' (the 8 preset characters). DiceBear
// is retired: only these presets have a full body, so a student without one is
// prompted to choose a character.
//
// Portrait resolution (small circular avatars) still lives in
// modules/avatarResolver.js; this module is only for the big full-body render.
(function (global) {
  'use strict';

  var PREFIX = 'student.';

  function esc(s) {
    var el = document.createElement('span');
    el.textContent = s == null ? '' : String(s);
    return el.innerHTML;
  }

  function isFullBodyId(id) {
    return typeof id === 'string' && id.indexOf(PREFIX) === 0;
  }

  // The full-body PNG url for a user/child object, or null if they haven't
  // chosen a full-body character. Prefers the catalog image path when the
  // catalog is loaded (chat/picker pages); otherwise derives it from the id so
  // it still works on pages that don't ship AVATAR_CONFIG (progress/parent).
  function resolveUrl(user) {
    if (!user) return null;
    var id = user.selectedAvatarId;
    if (!isFullBodyId(id)) return null;
    var cfg = (global.AVATAR_CONFIG || {})[id];
    if (cfg && cfg.image) return cfg.image;
    return '/images/students/' + id.slice(PREFIX.length) + '.png';
  }

  function hasFullBody(user) {
    return !!resolveUrl(user);
  }

  // Markup for a full-body avatar "stage". Options:
  //   size:    'sm' | 'md' | 'lg'      (default 'md')
  //   pickHref: where the choose-CTA links (default '/pick-avatar.html')
  //   readOnly: true → no CTA when empty (e.g. a parent viewing their child);
  //             shows a neutral placeholder + optional emptyLabel instead.
  //   emptyLabel: text under the empty placeholder (default varies by mode)
  function html(user, opts) {
    opts = opts || {};
    var size = opts.size || 'md';
    var url = resolveUrl(user);
    var name = (user && user.firstName) || '';

    if (url) {
      return '' +
        '<div class="fba fba-' + esc(size) + '">' +
          '<div class="fba-stage">' +
            '<img class="fba-img" src="' + esc(url) + '" alt="' + esc(name) + (name ? "'s" : '') + ' character" loading="lazy" />' +
            '<div class="fba-shadow" aria-hidden="true"></div>' +
          '</div>' +
        '</div>';
    }

    if (opts.readOnly) {
      var roLabel = opts.emptyLabel || 'No character chosen yet';
      return '' +
        '<div class="fba fba-' + esc(size) + ' fba-empty">' +
          '<div class="fba-stage">' +
            '<span class="fba-empty-icon" aria-hidden="true">🧍</span>' +
            '<div class="fba-shadow" aria-hidden="true"></div>' +
          '</div>' +
          '<div class="fba-empty-label">' + esc(roLabel) + '</div>' +
        '</div>';
    }

    var label = opts.emptyLabel || 'Choose your character';
    var href = opts.pickHref || '/pick-avatar.html';
    return '' +
      '<a class="fba fba-' + esc(size) + ' fba-choose" href="' + esc(href) + '">' +
        '<div class="fba-stage">' +
          '<span class="fba-empty-icon" aria-hidden="true">🧍</span>' +
          '<div class="fba-shadow" aria-hidden="true"></div>' +
        '</div>' +
        '<div class="fba-choose-label">' + esc(label) + '</div>' +
      '</a>';
  }

  global.AvatarFullBody = {
    isFullBodyId: isFullBodyId,
    resolveUrl: resolveUrl,
    hasFullBody: hasFullBody,
    html: html,
  };
})(window);
