/**
 * MATH SHOWDOWN - Frontend Controller
 *
 * Handles all UI logic for the head-to-head challenge system.
 * Communicates with /api/challenges/* endpoints.
 */

// ============================================================================
// STATE
// ============================================================================

const showdown = {
  // Current challenge being played
  challengeId: null,
  currentProblem: null,
  questionStartTime: null,
  selectedMcOption: null,

  // Create flow
  selectedSkillId: null,
  selectedOpponentId: null,
  challengeType: 'class',  // 'class' or 'direct'

  // Timer interval
  timerInterval: null,
  elapsedMs: 0,

  // Cached data
  userId: null
};

// ============================================================================
// DOM REFERENCES
// ============================================================================

const screens = {
  hub:      document.getElementById('hub-screen'),
  create:   document.getElementById('create-screen'),
  play:     document.getElementById('play-screen'),
  waiting:  document.getElementById('waiting-screen'),
  results:  document.getElementById('results-screen')
};

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  // Get current user info
  try {
    const resp = await fetch('/user');
    const data = await resp.json();
    if (data.user) {
      showdown.userId = data.user._id;
    }
  } catch (e) {
    console.error('[Showdown] Failed to get user info:', e);
  }

  // Load hub data
  loadHub();

  // Event listeners
  document.getElementById('create-challenge-btn').addEventListener('click', openCreateScreen);
  document.getElementById('create-back-btn').addEventListener('click', () => switchScreen('hub'));
  document.getElementById('open-challenge-btn').addEventListener('click', () => selectChallengeType('class'));
  document.getElementById('direct-challenge-btn').addEventListener('click', () => selectChallengeType('direct'));
  document.getElementById('send-challenge-btn').addEventListener('click', sendChallenge);
  document.getElementById('confirm-done-btn').addEventListener('click', () => { switchScreen('hub'); loadHub(); });
  document.getElementById('skill-search').addEventListener('input', filterSkills);

  // Play screen
  document.getElementById('play-submit-btn').addEventListener('click', submitPlayAnswer);
  document.getElementById('play-answer').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitPlayAnswer();
  });

  // Waiting / Results
  document.getElementById('waiting-hub-btn').addEventListener('click', () => { switchScreen('hub'); loadHub(); });
  document.getElementById('results-hub-btn').addEventListener('click', () => { switchScreen('hub'); loadHub(); });
  document.getElementById('results-rematch-btn').addEventListener('click', handleRematch);

  // Check if coming back to a challenge from URL hash
  if (window.location.hash) {
    const id = window.location.hash.replace('#', '');
    if (id) {
      startPlayingChallenge(id);
    }
  }
});

// ============================================================================
// SCREEN MANAGEMENT
// ============================================================================

function switchScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  if (screens[name]) {
    screens[name].classList.add('active');
  }
}

// ============================================================================
// HUB - LOAD DATA
// ============================================================================

async function loadHub() {
  switchScreen('hub');

  // Load available & my challenges in parallel
  const [available, my] = await Promise.all([
    fetchJSON('/api/challenges/available'),
    fetchJSON('/api/challenges/my')
  ]);

  // Render available challenges
  const availableList = document.getElementById('available-list');
  if (available?.challenges?.length > 0) {
    availableList.innerHTML = available.challenges.map(c => `
      <div class="challenge-card" data-id="${c._id}">
        <div class="challenge-info">
          <div class="challenge-skill">${esc(c.skillName)}</div>
          <div class="challenge-meta">from ${esc(c.challengerName)} &middot; expires ${timeAgo(c.expiresAt)}</div>
        </div>
        <button class="btn btn-accept btn-small" onclick="acceptChallenge('${c._id}')">
          <i class="fas fa-check"></i> Accept
        </button>
      </div>
    `).join('');
  } else {
    availableList.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i>No open challenges right now</div>`;
  }

  // Render active challenges
  const activeList = document.getElementById('active-list');
  if (my?.active?.length > 0) {
    activeList.innerHTML = my.active.map(c => {
      const myRole = c.challengerId === showdown.userId ? 'challenger' : 'opponent';
      const myAttempt = myRole === 'challenger' ? c.challengerAttempt : c.opponentAttempt;
      const opName = myRole === 'challenger' ? c.opponentName : c.challengerName;
      const status = myAttempt?.status || 'not_started';

      return `
        <div class="challenge-card" onclick="startPlayingChallenge('${c._id}')">
          <div class="challenge-info">
            <div class="challenge-skill">${esc(c.skillName)}</div>
            <div class="challenge-meta">vs ${esc(opName || 'TBD')} &middot; ${status === 'in_progress' ? 'In progress' : 'Ready to play'}</div>
          </div>
          <button class="btn btn-primary btn-small">
            <i class="fas fa-play"></i> ${status === 'in_progress' ? 'Continue' : 'Play'}
          </button>
        </div>
      `;
    }).join('');
    document.getElementById('active-section').classList.remove('hidden');
  } else {
    activeList.innerHTML = `<div class="empty-state"><i class="fas fa-gamepad"></i>No active challenges</div>`;
  }

  // Render sent challenges
  const sentList = document.getElementById('sent-list');
  if (my?.sent?.length > 0) {
    sentList.innerHTML = my.sent.map(c => `
      <div class="challenge-card">
        <div class="challenge-info">
          <div class="challenge-skill">${esc(c.skillName)}</div>
          <div class="challenge-meta">Waiting for opponent &middot; expires ${timeAgo(c.expiresAt)}</div>
        </div>
        <span class="result-badge tie">Pending</span>
      </div>
    `).join('');
    document.getElementById('sent-section').classList.remove('hidden');
  } else {
    sentList.innerHTML = '';
    document.getElementById('sent-section').classList.add('hidden');
  }

  // Render completed
  const completedList = document.getElementById('completed-list');
  if (my?.completed?.length > 0) {
    completedList.innerHTML = my.completed.slice(0, 10).map(c => {
      const isChallenger = c.challengerId === showdown.userId;
      const myScore = isChallenger ? c.challengerAttempt?.score : c.opponentAttempt?.score;
      const theirScore = isChallenger ? c.opponentAttempt?.score : c.challengerAttempt?.score;
      const opName = isChallenger ? c.opponentName : c.challengerName;
      const iWon = c.winnerId === showdown.userId;
      const isTie = c.result === 'tie';
      const resultClass = isTie ? 'tie' : (iWon ? 'win' : 'loss');
      const resultLabel = isTie ? 'Tie' : (iWon ? 'Win' : 'Loss');

      return `
        <div class="challenge-card" onclick="viewResults('${c._id}')">
          <div class="challenge-info">
            <div class="challenge-skill">${esc(c.skillName)}</div>
            <div class="challenge-meta">vs ${esc(opName)} &middot; ${myScore}-${theirScore}</div>
          </div>
          <span class="result-badge ${resultClass}">${resultLabel}</span>
        </div>
      `;
    }).join('');
  } else {
    completedList.innerHTML = `<div class="empty-state"><i class="fas fa-trophy"></i>No completed challenges yet</div>`;
  }
}

// ============================================================================
// CREATE CHALLENGE FLOW
// ============================================================================

async function openCreateScreen() {
  switchScreen('create');
  showdown.selectedSkillId = null;
  showdown.selectedOpponentId = null;
  showdown.challengeType = 'class';

  // Reset steps
  document.getElementById('step-skill').classList.remove('hidden');
  document.getElementById('step-opponent').classList.add('hidden');
  document.getElementById('step-confirm').classList.add('hidden');
  document.getElementById('skill-search').value = '';

  // Load skills
  const data = await fetchJSON('/api/challenges/skills');
  const grid = document.getElementById('skill-grid');

  if (!data?.skills?.length) {
    grid.innerHTML = `<div class="empty-state"><i class="fas fa-book"></i>Practice some skills first to unlock challenges!</div>`;
    return;
  }

  grid.innerHTML = data.skills.map(s => `
    <div class="skill-card" data-skill-id="${esc(s.skillId)}" onclick="selectSkill(this, '${esc(s.skillId)}')">
      <div class="skill-name">${esc(s.displayName)}</div>
      <div class="skill-category">${esc(formatCategory(s.category))}</div>
    </div>
  `).join('');
}

function selectSkill(el, skillId) {
  // Deselect previous
  document.querySelectorAll('.skill-card.selected').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  showdown.selectedSkillId = skillId;

  // Move to step 2
  document.getElementById('step-skill').classList.add('hidden');
  document.getElementById('step-opponent').classList.remove('hidden');
  document.getElementById('send-challenge-btn').disabled = false;
}

function filterSkills() {
  const query = document.getElementById('skill-search').value.toLowerCase();
  document.querySelectorAll('.skill-card').forEach(card => {
    const name = card.querySelector('.skill-name').textContent.toLowerCase();
    const cat = card.querySelector('.skill-category').textContent.toLowerCase();
    card.style.display = (name.includes(query) || cat.includes(query)) ? '' : 'none';
  });
}

function selectChallengeType(type) {
  showdown.challengeType = type;
  showdown.selectedOpponentId = null;

  document.getElementById('open-challenge-btn').classList.toggle('selected', type === 'class');
  document.getElementById('direct-challenge-btn').classList.toggle('selected', type === 'direct');

  const classmateList = document.getElementById('classmate-list');
  if (type === 'direct') {
    classmateList.classList.remove('hidden');
    loadClassmates();
    document.getElementById('send-challenge-btn').disabled = true;
  } else {
    classmateList.classList.add('hidden');
    document.getElementById('send-challenge-btn').disabled = false;
  }
}

async function loadClassmates() {
  const data = await fetchJSON('/api/challenges/classmates');
  const list = document.getElementById('classmate-list');

  if (!data?.classmates?.length) {
    list.innerHTML = `<div class="empty-state">No classmates found</div>`;
    return;
  }

  list.innerHTML = data.classmates.map(c => `
    <div class="classmate-item" data-id="${c._id}" onclick="selectClassmate(this, '${c._id}')">
      <span class="classmate-name">${esc(c.name)}</span>
      <span class="classmate-level">Lvl ${c.level}</span>
    </div>
  `).join('');
}

function selectClassmate(el, id) {
  document.querySelectorAll('.classmate-item.selected').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  showdown.selectedOpponentId = id;
  document.getElementById('send-challenge-btn').disabled = false;
}

async function sendChallenge() {
  const btn = document.getElementById('send-challenge-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

  const body = { skillId: showdown.selectedSkillId };
  if (showdown.challengeType === 'direct' && showdown.selectedOpponentId) {
    body.opponentId = showdown.selectedOpponentId;
  }

  const data = await fetchJSON('/api/challenges/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Challenge';
  btn.disabled = false;

  if (data?.success) {
    document.getElementById('step-opponent').classList.add('hidden');
    document.getElementById('step-confirm').classList.remove('hidden');
    document.getElementById('confirm-message').textContent =
      `Your ${data.challenge.skillName} challenge is waiting for an opponent!`;
  } else {
    alert(data?.error || 'Failed to create challenge');
  }
}

// ============================================================================
// ACCEPT CHALLENGE
// ============================================================================

async function acceptChallenge(id) {
  const data = await fetchJSON(`/api/challenges/${id}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  if (data?.success) {
    startPlayingChallenge(id);
  } else {
    alert(data?.error || 'Failed to accept challenge');
    loadHub();
  }
}

// ============================================================================
// PLAY CHALLENGE
// ============================================================================

async function startPlayingChallenge(id) {
  showdown.challengeId = id;
  showdown.selectedMcOption = null;
  window.location.hash = id;
  switchScreen('play');
  loadNextProblem();
}

async function loadNextProblem() {
  const data = await fetchJSON(`/api/challenges/${showdown.challengeId}/play`);

  if (!data?.success) {
    alert(data?.error || 'Failed to load problem');
    switchScreen('hub');
    return;
  }

  // If already complete, show waiting or results
  if (data.complete) {
    if (data.waiting) {
      showWaitingScreen(data.score, data.totalQuestions || 5);
    } else {
      viewResults(showdown.challengeId);
    }
    return;
  }

  const problem = data.problem;
  showdown.currentProblem = problem;
  showdown.selectedMcOption = null;

  // Update header
  document.getElementById('play-skill-name').textContent = data.skillName || '';
  document.getElementById('play-question-num').textContent = data.questionNumber;
  document.getElementById('play-total').textContent = data.totalQuestions;
  document.getElementById('play-score').textContent = data.score || 0;

  // Update opponent status
  updateOpponentStatus(data.opponentStatus);

  // Render problem
  document.getElementById('play-prompt').innerHTML = renderMath(problem.prompt);
  document.getElementById('feedback-overlay').classList.add('hidden');

  // SVG diagram
  const svgContainer = document.getElementById('play-svg-container');
  if (problem.svg) {
    svgContainer.innerHTML = problem.svg;
    svgContainer.style.display = 'block';
  } else {
    svgContainer.style.display = 'none';
  }

  // Multiple choice vs constructed response
  const mcContainer = document.getElementById('mc-options');
  const answerRow = document.getElementById('answer-row');

  if (problem.answerType === 'multiple-choice' && problem.options?.length) {
    mcContainer.classList.remove('hidden');
    answerRow.classList.add('hidden');
    mcContainer.innerHTML = problem.options.map(opt => `
      <div class="mc-option" data-label="${esc(opt.label)}" onclick="selectMcOption(this, '${esc(opt.label)}')">
        <span class="mc-label">${esc(opt.label)}.</span> ${renderMath(opt.text)}
      </div>
    `).join('');
  } else {
    mcContainer.classList.add('hidden');
    answerRow.classList.remove('hidden');
    const input = document.getElementById('play-answer');
    input.value = '';
    input.focus();
  }

  // Start timer
  startQuestionTimer();
}

function selectMcOption(el, label) {
  document.querySelectorAll('.mc-option.selected').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  showdown.selectedMcOption = label;

  // Auto-submit after brief delay for MC
  setTimeout(() => {
    if (showdown.selectedMcOption === label) {
      submitPlayAnswer();
    }
  }, 400);
}

async function submitPlayAnswer() {
  const isMultipleChoice = showdown.currentProblem?.answerType === 'multiple-choice';
  let answer;

  if (isMultipleChoice) {
    answer = showdown.selectedMcOption;
    if (!answer) return;
  } else {
    answer = document.getElementById('play-answer').value.trim();
    if (!answer) return;
  }

  // Stop timer
  const responseTime = stopQuestionTimer();

  // Disable input
  const submitBtn = document.getElementById('play-submit-btn');
  submitBtn.disabled = true;

  const data = await fetchJSON(`/api/challenges/${showdown.challengeId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer, responseTime })
  });

  submitBtn.disabled = false;

  if (!data?.success) {
    alert(data?.error || 'Failed to submit answer');
    return;
  }

  // Show feedback
  showFeedback(data.correct, data.correctAnswer);

  // Update score
  document.getElementById('play-score').textContent = data.score || 0;

  // Wait, then advance
  setTimeout(() => {
    if (data.complete) {
      window.location.hash = '';
      if (data.results) {
        showResults(data.results);
      } else {
        showWaitingScreen(data.score, data.totalQuestions);
      }
    } else {
      loadNextProblem();
    }
  }, 1200);
}

function showFeedback(correct, correctAnswer) {
  const overlay = document.getElementById('feedback-overlay');
  const content = document.getElementById('feedback-content');

  overlay.classList.remove('hidden');
  content.className = `feedback-content ${correct ? 'feedback-correct' : 'feedback-wrong'}`;

  document.getElementById('feedback-icon').innerHTML = correct
    ? '<i class="fas fa-check-circle"></i>'
    : '<i class="fas fa-times-circle"></i>';

  document.getElementById('feedback-text').textContent = correct
    ? 'Correct!'
    : `Incorrect — ${correctAnswer}`;
}

function updateOpponentStatus(status) {
  const pill = document.getElementById('opponent-status-pill');
  const text = document.getElementById('opponent-status-text');

  pill.className = `score-item opponent-status-pill ${status || 'waiting'}`;
  const labels = { waiting: 'Opponent waiting', playing: 'Opponent playing', finished: 'Opponent done' };
  text.textContent = labels[status] || 'Waiting';
}

// ============================================================================
// TIMER
// ============================================================================

function startQuestionTimer() {
  showdown.questionStartTime = Date.now();
  showdown.elapsedMs = 0;

  clearInterval(showdown.timerInterval);
  showdown.timerInterval = setInterval(() => {
    showdown.elapsedMs = Date.now() - showdown.questionStartTime;
    document.getElementById('play-timer').textContent = (showdown.elapsedMs / 1000).toFixed(1) + 's';
  }, 100);
}

function stopQuestionTimer() {
  clearInterval(showdown.timerInterval);
  return Date.now() - (showdown.questionStartTime || Date.now());
}

// ============================================================================
// WAITING & RESULTS
// ============================================================================

function showWaitingScreen(score, total) {
  switchScreen('waiting');
  document.getElementById('waiting-score').textContent = score || 0;
  document.getElementById('waiting-total').textContent = total || 5;

  // Poll for completion every 5 seconds
  const pollInterval = setInterval(async () => {
    const data = await fetchJSON(`/api/challenges/${showdown.challengeId}/results`);
    if (data?.results) {
      clearInterval(pollInterval);
      showResults(data.results);
    }
  }, 5000);

  // Stop polling after 5 minutes
  setTimeout(() => clearInterval(pollInterval), 5 * 60 * 1000);
}

function showResults(results) {
  switchScreen('results');

  const banner = document.getElementById('results-banner');
  if (results.result === 'win') {
    banner.className = 'results-banner win';
    banner.textContent = 'Victory!';
    // Confetti!
    if (typeof confetti === 'function') {
      confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 } });
    }
  } else if (results.result === 'loss') {
    banner.className = 'results-banner loss';
    banner.textContent = 'Defeat';
  } else {
    banner.className = 'results-banner tie';
    banner.textContent = 'Tie!';
  }

  document.getElementById('results-my-score').textContent = results.myScore;
  document.getElementById('results-my-time').textContent = formatTime(results.myTime);
  document.getElementById('results-their-score').textContent = results.theirScore;
  document.getElementById('results-their-time').textContent = formatTime(results.theirTime);

  const opponentLabel = results.result === 'win' ? results.opponentName : results.challengerName;
  const theyAreChallenger = results.challengerName !== 'You';
  document.getElementById('results-opponent-name').textContent =
    showdown.userId === results.challengerId
      ? results.opponentName
      : results.challengerName;

  document.getElementById('results-xp-amount').textContent = results.xpEarned || 0;
  document.getElementById('results-skill').textContent = results.skillName;
}

async function viewResults(id) {
  showdown.challengeId = id;
  const data = await fetchJSON(`/api/challenges/${id}/results`);
  if (data?.results) {
    showResults(data.results);
  } else {
    // Not completed yet
    switchScreen('hub');
  }
}

function handleRematch() {
  // Go back to create screen with same skill pre-selected
  openCreateScreen();
}

// ============================================================================
// UTILITIES
// ============================================================================

async function fetchJSON(url, options = {}) {
  try {
    // Add CSRF token if available
    if (options.method && options.method !== 'GET') {
      if (!options.headers) options.headers = {};
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        options.headers['X-CSRF-Token'] = csrfToken;
      }
    }

    const resp = await fetch(url, { credentials: 'same-origin', ...options });

    if (resp.status === 401) {
      window.location.href = '/login.html';
      return null;
    }

    return await resp.json();
  } catch (e) {
    console.error('[Showdown] Fetch error:', e);
    return null;
  }
}

function getCsrfToken() {
  // Check cookie
  const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
  if (match) return decodeURIComponent(match[1]);
  // Check meta tag
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta ? meta.content : null;
}

function esc(str) {
  if (!str) return '';
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

function renderMath(text) {
  if (!text) return '';
  // Basic LaTeX rendering using KaTeX if available
  if (typeof katex !== 'undefined') {
    return text.replace(/\$\$(.*?)\$\$/g, (_, math) => {
      try { return katex.renderToString(math, { throwOnError: false }); }
      catch (e) { return math; }
    }).replace(/\$(.*?)\$/g, (_, math) => {
      try { return katex.renderToString(math, { throwOnError: false, displayMode: false }); }
      catch (e) { return math; }
    });
  }
  return esc(text);
}

function formatCategory(cat) {
  if (!cat) return '';
  return cat.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatTime(ms) {
  if (!ms) return '0.0s';
  const seconds = ms / 1000;
  if (seconds < 60) return seconds.toFixed(1) + 's';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffHours = Math.round((date - now) / (1000 * 60 * 60));

  if (diffHours < 0) return 'expired';
  if (diffHours < 1) return 'soon';
  if (diffHours < 24) return `in ${diffHours}h`;
  return `in ${Math.round(diffHours / 24)}d`;
}

// Make functions available globally for inline onclick handlers
window.selectSkill = selectSkill;
window.selectMcOption = selectMcOption;
window.acceptChallenge = acceptChallenge;
window.startPlayingChallenge = startPlayingChallenge;
window.viewResults = viewResults;
window.selectClassmate = selectClassmate;
