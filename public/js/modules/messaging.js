/**
 * Teacher <-> Parent messaging widget.
 *
 * The API (routes/messaging.js) and the Message model have existed for a while
 * with no interface anywhere — this mounts the same widget on both the parent
 * and teacher dashboards so neither monolith grows its own copy.
 *
 * Usage:
 *   MMMessaging.mount(document.getElementById('messaging-root'));
 *
 * Exposes window.MMMessaging.
 */
/* global csrfFetch */
(function () {
  'use strict';

  var API = '/api/messages';
  var POLL_MS = 30000;

  // csrfFetch is defined in /js/csrf.js, which every dashboard already loads.
  function post(url, body) {
    var opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    return (typeof csrfFetch === 'function' ? csrfFetch(url, opts) : fetch(url, opts));
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fullName(u) {
    if (!u) return 'Unknown';
    return esc([u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || 'Unknown');
  }

  function initials(u) {
    if (!u) return '?';
    var a = (u.firstName || u.email || '?')[0] || '?';
    var b = (u.lastName || '')[0] || '';
    return esc((a + b).toUpperCase());
  }

  function timeAgo(iso) {
    var t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    var s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 604800) return Math.floor(s / 86400) + 'd ago';
    return new Date(iso).toLocaleDateString();
  }

  function MessagingWidget(root) {
    this.root = root;
    this.contacts = [];
    this.conversations = [];
    this.activeUserId = null;
    this.activeName = '';
    this.messages = [];
    this.pollTimer = null;
    this.sending = false;
  }

  MessagingWidget.prototype.mount = function () {
    this.root.innerHTML =
      '<div class="mm-msg">' +
        '<aside class="mm-msg-list" aria-label="Conversations">' +
          '<div class="mm-msg-list-head">' +
            '<h3>Messages</h3>' +
            '<button type="button" class="mm-msg-new" title="New message">' +
              '<i class="fas fa-pen-to-square" aria-hidden="true"></i><span class="sr-only">New message</span>' +
            '</button>' +
          '</div>' +
          '<div class="mm-msg-threads" role="list"></div>' +
        '</aside>' +
        '<section class="mm-msg-pane" aria-live="polite">' +
          '<div class="mm-msg-empty">Select a conversation to get started.</div>' +
        '</section>' +
      '</div>';

    this.threadsEl = this.root.querySelector('.mm-msg-threads');
    this.paneEl = this.root.querySelector('.mm-msg-pane');
    this.root.querySelector('.mm-msg-new').addEventListener('click', this.showCompose.bind(this));

    this.refresh();
    this.pollTimer = setInterval(this.refresh.bind(this), POLL_MS);
    return this;
  };

  MessagingWidget.prototype.destroy = function () {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  };

  MessagingWidget.prototype.refresh = function () {
    var self = this;
    return fetch(API + '/conversations', { credentials: 'same-origin' })
      .then(function (r) {
        // 403 means this account holds neither role — hide rather than nag.
        if (r.status === 403) { self.root.style.display = 'none'; return null; }
        return r.ok ? r.json() : null;
      })
      .then(function (d) {
        if (!d || !d.success) return;
        self.conversations = d.conversations || [];
        self.renderThreads();
        if (self.activeUserId) self.loadThread(self.activeUserId, self.activeName, true);
      })
      .catch(function () { /* transient; next poll retries */ });
  };

  MessagingWidget.prototype.renderThreads = function () {
    var self = this;
    if (!this.conversations.length) {
      this.threadsEl.innerHTML =
        '<p class="mm-msg-none">No messages yet.<br><button type="button" class="mm-msg-startlink">Start a conversation</button></p>';
      var link = this.threadsEl.querySelector('.mm-msg-startlink');
      if (link) link.addEventListener('click', this.showCompose.bind(this));
      return;
    }

    this.threadsEl.innerHTML = this.conversations.map(function (c) {
      var p = c.participant || {};
      var active = self.activeUserId === String(p._id) ? ' is-active' : '';
      var unread = c.unreadCount > 0 ? '<span class="mm-msg-badge">' + c.unreadCount + '</span>' : '';
      return '' +
        '<button type="button" class="mm-msg-thread' + active + '" role="listitem" data-uid="' + esc(p._id) + '" data-name="' + fullName(p) + '">' +
          '<span class="mm-msg-avatar" aria-hidden="true">' + initials(p) + '</span>' +
          '<span class="mm-msg-thread-body">' +
            '<span class="mm-msg-thread-top"><strong>' + fullName(p) + '</strong>' + unread + '</span>' +
            '<span class="mm-msg-snippet">' + esc(c.lastMessage ? c.lastMessage.body : '') + '</span>' +
            '<span class="mm-msg-when">' + esc(c.lastMessage ? timeAgo(c.lastMessage.createdAt) : '') + '</span>' +
          '</span>' +
        '</button>';
    }).join('');

    Array.prototype.forEach.call(this.threadsEl.querySelectorAll('.mm-msg-thread'), function (btn) {
      btn.addEventListener('click', function () {
        self.loadThread(btn.dataset.uid, btn.dataset.name);
      });
    });
  };

  MessagingWidget.prototype.loadThread = function (userId, name, quiet) {
    var self = this;
    this.activeUserId = String(userId);
    this.activeName = name || '';
    if (!quiet) this.paneEl.innerHTML = '<div class="mm-msg-empty">Loading…</div>';

    return fetch(API + '/with/' + encodeURIComponent(userId), { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.success) {
          self.paneEl.innerHTML = '<div class="mm-msg-empty">Could not load this conversation.</div>';
          return;
        }
        // /with returns newest-first; render oldest-first like a chat.
        self.messages = (d.messages || []).slice().reverse();
        self.renderThread();
        self.renderThreads();
      })
      .catch(function () {
        self.paneEl.innerHTML = '<div class="mm-msg-empty">Could not load this conversation.</div>';
      });
  };

  MessagingWidget.prototype.renderThread = function () {
    var self = this;
    var bubbles = this.messages.map(function (m) {
      var mine = m.isFromMe ? ' is-mine' : '';
      var subj = m.subject ? '<span class="mm-msg-subject">' + esc(m.subject) + '</span>' : '';
      var about = m.student ? '<span class="mm-msg-about">About ' + fullName(m.student) + '</span>' : '';
      return '<div class="mm-msg-bubble' + mine + '">' + subj + about +
             '<p>' + esc(m.body).replace(/\n/g, '<br>') + '</p>' +
             '<time>' + esc(timeAgo(m.createdAt)) + '</time></div>';
    }).join('') || '<div class="mm-msg-empty">No messages yet — say hello.</div>';

    this.paneEl.innerHTML =
      '<header class="mm-msg-pane-head"><h4>' + esc(this.activeName) + '</h4></header>' +
      '<div class="mm-msg-scroll">' + bubbles + '</div>' +
      '<form class="mm-msg-form">' +
        '<label class="sr-only" for="mm-msg-body">Message</label>' +
        '<textarea id="mm-msg-body" rows="2" placeholder="Write a message…" maxlength="5000" required></textarea>' +
        '<button type="submit" class="mm-msg-send">Send</button>' +
      '</form>';

    var scroll = this.paneEl.querySelector('.mm-msg-scroll');
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
    this.paneEl.querySelector('.mm-msg-form').addEventListener('submit', function (e) {
      e.preventDefault();
      self.send(this.querySelector('textarea'));
    });
  };

  MessagingWidget.prototype.send = function (textarea) {
    var self = this;
    var body = (textarea.value || '').trim();
    if (!body || this.sending) return;

    this.sending = true;
    var btn = this.paneEl.querySelector('.mm-msg-send');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

    post(API + '/send', { recipientId: this.activeUserId, body: body })
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (d) {
        self.sending = false;
        if (btn) { btn.disabled = false; btn.textContent = 'Send'; }
        if (!d || !d.success) {
          window.alert((d && d.message) || 'Message could not be sent.');
          return;
        }
        textarea.value = '';
        return self.loadThread(self.activeUserId, self.activeName, true).then(function () { self.refresh(); });
      })
      .catch(function () {
        self.sending = false;
        if (btn) { btn.disabled = false; btn.textContent = 'Send'; }
        window.alert('Message could not be sent.');
      });
  };

  MessagingWidget.prototype.showCompose = function () {
    var self = this;
    this.paneEl.innerHTML = '<div class="mm-msg-empty">Loading contacts…</div>';

    fetch(API + '/contacts', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        self.contacts = (d && d.contacts) || [];
        if (!self.contacts.length) {
          self.paneEl.innerHTML =
            '<div class="mm-msg-empty">No one to message yet.<br>' +
            '<small>Contacts appear once your account is linked to a teacher or a student.</small></div>';
          return;
        }
        self.paneEl.innerHTML =
          '<header class="mm-msg-pane-head"><h4>New message</h4></header>' +
          '<div class="mm-msg-contacts">' + self.contacts.map(function (c) {
            var kids = (c.children || []).map(function (k) { return fullName(k); }).join(', ');
            return '<button type="button" class="mm-msg-contact" data-uid="' + esc(c._id) + '" data-name="' + fullName(c) + '">' +
              '<span class="mm-msg-avatar" aria-hidden="true">' + initials(c) + '</span>' +
              '<span><strong>' + fullName(c) + '</strong>' +
              (kids ? '<small>' + esc(kids) + '</small>' : '') + '</span></button>';
          }).join('') + '</div>';

        Array.prototype.forEach.call(self.paneEl.querySelectorAll('.mm-msg-contact'), function (btn) {
          btn.addEventListener('click', function () {
            self.loadThread(btn.dataset.uid, btn.dataset.name);
          });
        });
      })
      .catch(function () {
        self.paneEl.innerHTML = '<div class="mm-msg-empty">Could not load contacts.</div>';
      });
  };

  window.MMMessaging = {
    mount: function (root) {
      if (!root) return null;
      return new MessagingWidget(root).mount();
    }
  };
})();
