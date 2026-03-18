(function () {
  'use strict';

  /* ── Pi Day Countdown Timer ─────────────────────────── */
  (function initCountdown() {
    var banner = document.getElementById('lp-countdown');
    var daysEl = document.getElementById('lp-cd-days');
    var hoursEl = document.getElementById('lp-cd-hours');
    var minsEl = document.getElementById('lp-cd-mins');
    var secsEl = document.getElementById('lp-cd-secs');

    if (!banner || !daysEl || !hoursEl || !minsEl || !secsEl) return;

    // Target: March 14, 2026 at midnight EDT (UTC-4, daylight saving in effect)
    var target = new Date('2026-03-14T04:00:00Z');

    function pad(n) { return n < 10 ? '0' + n : String(n); }

    function updateCountdown() {
      var now = new Date();
      var diff = target - now;

      // If Pi Day has passed, hide the banner and swap demo links to signup
      if (diff <= 0) {
        banner.classList.add('lp-countdown-launched');
        document.querySelectorAll('.lp-pre-launch').forEach(function (el) { el.style.display = 'none'; });
        document.querySelectorAll('.lp-post-launch').forEach(function (el) { el.style.display = ''; });
        return;
      }

      var days  = Math.floor(diff / (1000 * 60 * 60 * 24));
      var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      var mins  = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      var secs  = Math.floor((diff % (1000 * 60)) / 1000);

      daysEl.textContent  = pad(days);
      hoursEl.textContent = pad(hours);
      minsEl.textContent  = pad(mins);
      secsEl.textContent  = pad(secs);
    }

    // Run immediately, then every second
    updateCountdown();
    setInterval(updateCountdown, 1000);
  })();

  /* ── Waitlist Form Handling ────────────────────────── */
  // Track which role tab is active so we can send it with the waitlist signup
  var activeRole = 'parent';
  var roleBtns = document.querySelectorAll('.lp-role-tab');
  roleBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      activeRole = btn.getAttribute('data-role') || 'parent';
    });
  });

  var waitlistForms = document.querySelectorAll('.lp-waitlist-form');
  waitlistForms.forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = form.querySelector('.lp-waitlist-input');
      var btn = form.querySelector('.lp-waitlist-btn');
      var email = input.value.trim();
      if (!email) return;

      // Remove any existing message
      var existingMsg = form.querySelector('.lp-waitlist-msg');
      if (existingMsg) existingMsg.remove();

      btn.disabled = true;
      btn.textContent = 'Sending...';

      csrfFetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, role: activeRole })
      })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var msg = document.createElement('div');
        msg.className = 'lp-waitlist-msg ' + (data.success ? 'success' : 'error');
        msg.textContent = data.message;
        form.appendChild(msg);
        if (data.success) {
          input.value = '';
          btn.textContent = 'Signed Up!';
        } else {
          btn.disabled = false;
          btn.textContent = 'Try Again';
        }
      })
      .catch(function () {
        var msg = document.createElement('div');
        msg.className = 'lp-waitlist-msg error';
        msg.textContent = 'Something went wrong. Please try again.';
        form.appendChild(msg);
        btn.disabled = false;
        btn.textContent = 'Try Again';
      });
    });
  });

  /* ── Scroll Reveal ─────────────────────────────────── */
  var revealEls = document.querySelectorAll('.lp-reveal');
  if ('IntersectionObserver' in window) {
    var revealObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('lp-visible');
          /* Also reveal any stagger grids inside this section */
          var staggers = entry.target.querySelectorAll('.lp-stagger');
          staggers.forEach(function (s) { s.classList.add('lp-visible'); });
          revealObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function (el) { revealObs.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('lp-visible'); });
  }

  /* ── Animated Chat Preview — Cycling Topics ─────────── */
  var chatContainer = document.getElementById('lp-chat');
  var typingEl = document.getElementById('lp-typing');
  var tutorNameEl = document.getElementById('lp-tutor-name');

  if (chatContainer && typingEl) {
    var conversations = [
      {
        tutor: 'Mr. Nappier',
        studentAvatar: '/images/avatars/astronaut.png',
        tutorAvatar: '/images/tutor_avatars/mr-nappier.png',
        messages: [
          { from: 'student', text: 'How do I add \u2153 + \u00BC?' },
          { from: 'tutor', text: 'Great question! Let\u2019s figure it out together. First \u2014 can you think of a number that both 3 and 4 divide into evenly?' },
          { from: 'student', text: '12?' },
          { from: 'tutor', text: 'That\u2019s it! Now we can rewrite both fractions with 12 as the denominator. What would \u2153 become?' }
        ]
      },
      {
        tutor: 'Ms. Maria',
        studentAvatar: '/images/avatars/dragon.png',
        tutorAvatar: '/images/tutor_avatars/ms-maria.png',
        messages: [
          { from: 'student', text: 'I don\u2019t get how to solve 3x + 7 = 22' },
          { from: 'tutor', text: 'No worries! Our goal is to get x all by itself. What do you think we should do to both sides first?' },
          { from: 'student', text: 'Subtract 7?' },
          { from: 'tutor', text: 'Exactly! 22 \u2013 7 = 15, so now we have 3x = 15. What\u2019s the last step?' }
        ]
      },
      {
        tutor: 'Maya',
        studentAvatar: '/images/avatars/alien.png',
        tutorAvatar: '/images/tutor_avatars/maya.png',
        messages: [
          { from: 'student', text: 'Can you check my homework? I got 0.5 \u00D7 0.3 = 1.5' },
          { from: 'tutor', text: 'Hmm, let\u2019s look at that together! When you multiply decimals, how many total decimal places should the answer have?' },
          { from: 'student', text: 'Oh wait\u2026 two places? So it\u2019s 0.15?' },
          { from: 'tutor', text: 'There you go! 0.5 has one decimal place, 0.3 has one, so the answer needs two. Nice catch!' }
        ]
      },
      {
        tutor: 'Bob',
        studentAvatar: '/images/avatars/dragon.png',
        tutorAvatar: '/images/tutor_avatars/bob.png',
        messages: [
          { from: 'student', text: 'What\u2019s the answer to number 5? It\u2019s 4x \u2013 10 = 14' },
          { from: 'tutor', text: 'I can\u2019t just give you the answer \u2014 but I can help you figure it out! What\u2019s the first step to isolate the x term?' },
          { from: 'student', text: 'Ugh fine\u2026 add 10 to both sides?' },
          { from: 'tutor', text: 'See, you DO know this! Now you\u2019ve got 4x = 24. One more step and you\u2019ve got it.' }
        ]
      }
    ];

    var convoIndex = 0;

    function playConversation() {
      var convo = conversations[convoIndex % conversations.length];
      convoIndex++;

      // Update tutor name
      if (tutorNameEl) tutorNameEl.textContent = convo.tutor;

      // Clear previous messages
      chatContainer.innerHTML = '';
      typingEl.style.display = 'none';

      var msgIdx = 0;

      function showNextMessage() {
        if (msgIdx >= convo.messages.length) {
          // Pause on completed conversation, then start next
          setTimeout(function () {
            // Fade out current messages
            var allRows = chatContainer.querySelectorAll('.lp-chat-row');
            allRows.forEach(function (r) { r.style.opacity = '0'; r.style.transform = 'translateY(-8px)'; });
            setTimeout(playConversation, 400);
          }, 3000);
          return;
        }

        var msg = convo.messages[msgIdx];
        var isStudent = msg.from === 'student';

        if (!isStudent) {
          // Show typing indicator before tutor message
          typingEl.style.display = 'flex';
          setTimeout(function () {
            typingEl.style.display = 'none';
            appendMessage(msg, isStudent, convo);
            msgIdx++;
            setTimeout(showNextMessage, 900);
          }, 1100);
        } else {
          appendMessage(msg, isStudent, convo);
          msgIdx++;
          setTimeout(showNextMessage, 800);
        }
      }

      function appendMessage(msg, isStudent, c) {
        var row = document.createElement('div');
        row.className = 'lp-chat-row' + (isStudent ? ' lp-chat-row--student' : '');

        var avatar = document.createElement('div');
        avatar.className = 'lp-chat-avatar';
        var avatarImg = document.createElement('img');
        avatarImg.src = isStudent ? c.studentAvatar : c.tutorAvatar;
        avatarImg.alt = isStudent ? 'Student' : c.tutor;
        avatarImg.loading = 'lazy';
        avatar.appendChild(avatarImg);

        var bubble = document.createElement('div');
        bubble.className = 'lp-chat-bubble ' + (isStudent ? 'lp-chat-student' : 'lp-chat-tutor');
        bubble.textContent = msg.text;

        row.appendChild(avatar);
        row.appendChild(bubble);
        chatContainer.appendChild(row);

        // Trigger animation and scroll to bottom
        requestAnimationFrame(function () {
          row.classList.add('lp-chat-visible');
          chatContainer.scrollTop = chatContainer.scrollHeight;
        });
      }

      setTimeout(showNextMessage, 600);
    }

    setTimeout(playConversation, 700);
  }

  /* ── Role Selector Tabs ────────────────────────────── */
  var roleTabs = document.querySelectorAll('.lp-role-tab');
  var rolePanels = document.querySelectorAll('.lp-role-panel');

  roleTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var role = tab.getAttribute('data-role');

      /* Update tabs */
      roleTabs.forEach(function (t) { t.classList.remove('lp-role-tab--active'); });
      tab.classList.add('lp-role-tab--active');

      /* Update panels */
      rolePanels.forEach(function (p) { p.classList.remove('lp-role-panel--active'); });
      var targetPanel = document.querySelector('[data-panel="' + role + '"]');
      if (targetPanel) targetPanel.classList.add('lp-role-panel--active');
    });
  });

  /* ── Sticky CTA Bar ────────────────────────────────── */
  var stickyBar = document.getElementById('lp-sticky-cta');
  var hero = document.querySelector('.lp-hero');
  var finalCta = document.querySelector('.lp-final-cta');

  if (stickyBar && hero) {
    var stickyObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.target === hero) {
          if (!entry.isIntersecting) {
            stickyBar.classList.add('lp-sticky-visible');
          } else {
            stickyBar.classList.remove('lp-sticky-visible');
          }
        }
      });
    }, { threshold: 0 });
    stickyObs.observe(hero);

    if (finalCta) {
      var finalObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            stickyBar.classList.remove('lp-sticky-visible');
          } else if (hero.getBoundingClientRect().bottom < 0) {
            stickyBar.classList.add('lp-sticky-visible');
          }
        });
      }, { threshold: 0.3 });
      finalObs.observe(finalCta);
    }
  }

  /* ── Pi Day Launch Auto-Switch ─────────────────────── */
  // Post-launch: hide countdown banner, show Pi Day promo if still in window
  (function piDayLaunchSwitch() {
    var launchDate = new Date('2026-03-14T04:00:00Z'); // midnight EDT = UTC-4
    var promoEnd   = new Date('2026-03-16T03:59:59Z'); // end of March 15 EDT
    if (new Date() < launchDate) return;

    // Hide countdown banner
    var countdown = document.getElementById('lp-countdown');
    if (countdown) countdown.style.display = 'none';

    // Show Pi Day promo banner (only during the promo window)
    if (new Date() <= promoEnd) {
      var promoBanner = document.createElement('div');
      promoBanner.className = 'lp-piday-promo';
      promoBanner.innerHTML = '<div class="lp-piday-inner">' +
        '<div class="lp-piday-icon">\u03C0</div>' +
        '<div class="lp-piday-text">' +
          '<div class="lp-piday-headline">Happy Pi Day! <span class="lp-piday-pink">$3.14 off</span> Mathmatix+</div>' +
          '<div class="lp-piday-sub">Celebrate 3.14 with us \u2014 limited-time launch pricing through March 15</div>' +
        '</div>' +
        '<div class="lp-piday-prices">' +
          '<div class="lp-piday-price-chip">' +
            '<div class="lp-piday-plan-name">Mathmatix+</div>' +
            '<div class="lp-piday-original">$9.95/mo</div>' +
            '<div class="lp-piday-deal">$6.81/mo</div>' +
          '</div>' +
        '</div>' +
        '<a href="/signup.html" class="lp-piday-cta">Sign Up &amp; Save</a>' +
      '</div>';
      var main = document.getElementById('lp-main');
      if (main) main.insertBefore(promoBanner, main.firstChild);
    }
  })();

  /* ── FAQ Accordion ─────────────────────────────────── */
  var faqItems = document.querySelectorAll('.lp-faq-item');
  faqItems.forEach(function (item) {
    var btn = item.querySelector('.lp-faq-question');
    if (btn) {
      btn.addEventListener('click', function () {
        var isOpen = item.classList.contains('lp-faq-open');
        faqItems.forEach(function (other) {
          other.classList.remove('lp-faq-open');
          var otherBtn = other.querySelector('.lp-faq-question');
          if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
        });
        if (!isOpen) {
          item.classList.add('lp-faq-open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    }
  });

})();
