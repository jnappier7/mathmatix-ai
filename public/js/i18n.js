// ============================================
// CLIENT-SIDE I18N ENGINE
// Translates UI elements marked with data-i18n attributes
// based on the user's preferredLanguage setting.
//
// Usage:
//   1. Include i18n-translations.js BEFORE this file.
//   2. Mark elements with data-i18n="key"            → translates textContent
//      or data-i18n-placeholder="key"                → translates placeholder
//      or data-i18n-title="key"                      → translates title attribute
//      or data-i18n-aria="key"                       → translates aria-label
//   3. Call MathmatixI18n.apply() after DOM is ready,
//      or just let the auto-init do it.
// ============================================

window.MathmatixI18n = (function () {
  'use strict';

  // Whose language this page speaks. Parent pages mark <html data-i18n-audience="parent">
  // and follow the parent's own setting (parentLanguage); everything else follows the
  // student's preferredLanguage. They're separate on purpose: a parent who reads
  // Spanish must not switch their child's tutor to Spanish — and on a shared family
  // browser the cached choice of one must not repaint the other's page.
  var AUDIENCE = (document.documentElement.getAttribute('data-i18n-audience') || 'student');
  var STORAGE_KEY = AUDIENCE === 'parent' ? 'mathmatix_ui_lang_parent' : 'mathmatix_ui_lang';
  var SERVER_FIELD = AUDIENCE === 'parent' ? 'parentLanguage' : 'preferredLanguage';
  var currentLang = 'English'; // default

  /** Look up a translation string. Returns English fallback if missing. */
  function t(key) {
    var translations = window.I18N_TRANSLATIONS;
    if (!translations || !translations[key]) return null;
    return translations[key][currentLang] || translations[key].English || null;
  }

  /** Apply translations to all marked elements within a root node. */
  function apply(root) {
    root = root || document;

    // data-i18n → textContent (preserves child icons by targeting first text node)
    var els = root.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) {
      var key = els[i].getAttribute('data-i18n');
      var text = t(key);
      if (!text) continue;

      // If element has child elements (like <i> icons), only replace the text portion
      var hasChildElements = els[i].querySelector('i, img, svg, span.icon');
      if (hasChildElements) {
        // Find the last text node or the span that holds text
        var textSpan = els[i].querySelector('span:not(.icon)');
        if (textSpan) {
          textSpan.textContent = text;
        } else {
          // Replace only text nodes (preserve icon children)
          setTextPreservingChildren(els[i], text);
        }
      } else {
        els[i].textContent = text;
      }
    }

    // data-i18n-placeholder → placeholder attr (or data-placeholder for contenteditable)
    els = root.querySelectorAll('[data-i18n-placeholder]');
    for (i = 0; i < els.length; i++) {
      var pKey = els[i].getAttribute('data-i18n-placeholder');
      var pText = t(pKey);
      if (!pText) continue;
      if (els[i].hasAttribute('data-placeholder')) {
        els[i].setAttribute('data-placeholder', pText);
      } else {
        els[i].setAttribute('placeholder', pText);
      }
    }

    // data-i18n-title → title attribute
    els = root.querySelectorAll('[data-i18n-title]');
    for (i = 0; i < els.length; i++) {
      var tKey = els[i].getAttribute('data-i18n-title');
      var tText = t(tKey);
      if (tText) els[i].setAttribute('title', tText);
    }

    // data-i18n-aria → aria-label attribute
    els = root.querySelectorAll('[data-i18n-aria]');
    for (i = 0; i < els.length; i++) {
      var aKey = els[i].getAttribute('data-i18n-aria');
      var aText = t(aKey);
      if (aText) els[i].setAttribute('aria-label', aText);
    }

    // Update <html lang="..."> for accessibility and SEO
    var langMap = {
      English: 'en', Spanish: 'es', Russian: 'ru', Chinese: 'zh',
      Vietnamese: 'vi', Arabic: 'ar', Somali: 'so', French: 'fr', German: 'de'
    };
    var htmlEl = document.documentElement;
    htmlEl.setAttribute('lang', langMap[currentLang] || 'en');

    // Set text direction for RTL languages
    if (currentLang === 'Arabic') {
      htmlEl.setAttribute('dir', 'rtl');
    } else {
      htmlEl.removeAttribute('dir');
    }
  }

  /**
   * Replace text content of an element while keeping child elements intact.
   * Targets only direct text nodes (the last one, after icons).
   */
  function setTextPreservingChildren(el, newText) {
    var nodes = el.childNodes;
    var replaced = false;

    // Walk backwards to find the last text node with content
    for (var n = nodes.length - 1; n >= 0; n--) {
      if (nodes[n].nodeType === 3 && nodes[n].textContent.trim()) {
        nodes[n].textContent = ' ' + newText;
        replaced = true;
        break;
      }
    }

    // If no existing text node, append one
    if (!replaced) {
      el.appendChild(document.createTextNode(' ' + newText));
    }
  }

  /** Set the active language and re-translate the page. */
  function setLanguage(lang) {
    currentLang = lang || 'English';
    _setItem(STORAGE_KEY, currentLang);
    apply();
  }

  /** Get current active language. */
  function getLanguage() {
    return currentLang;
  }

  // Safe storage helpers that prefer StorageUtils when available
  function _getItem(key) {
    if (window.StorageUtils) return StorageUtils.local.getItem(key);
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function _setItem(key, val) {
    if (window.StorageUtils) { StorageUtils.local.setItem(key, val); return; }
    try { localStorage.setItem(key, val); } catch (e) { /* */ }
  }

  /** Load language from localStorage or from the /user endpoint. */
  function init() {
    // 1. Check localStorage for fast first paint
    var cached = _getItem(STORAGE_KEY);
    if (cached) {
      currentLang = cached;
      apply();
    }

    // 2. Fetch authoritative language from server (updates if different)
    fetch('/user', { credentials: 'include' })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        if (data && data.user && data.user[SERVER_FIELD]) {
          var serverLang = data.user[SERVER_FIELD];
          if (serverLang !== currentLang) {
            currentLang = serverLang;
            _setItem(STORAGE_KEY, currentLang);
            apply();
          }
        }
      })
      .catch(function () {
        // Not logged in or network error — keep cached / English default
      });
  }

  // Auto-initialise once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API
  return {
    t: t,
    apply: apply,
    setLanguage: setLanguage,
    getLanguage: getLanguage,
    audience: AUDIENCE,
    init: init
  };
})();
