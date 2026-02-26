/* Session Leaderboard Module
   Optional live competition during teacher sessions.
   Students pick a nickname; scores update in real-time.
   Shows top 5 + student's own position.
   Resets each session (no permanent rankings).

   Requires: firebase-app-compat.js, firebase-database-compat.js, firebase-config.js
   Must be loaded AFTER interactive-quiz.js */

(function() {
  'use strict';

  var examId = document.body && document.body.dataset.examId;
  if (!examId) return;
  if (typeof firebase === 'undefined' || !firebase.apps.length) return;

  var db = firebase.database();
  var lbRef = db.ref('leaderboard/' + examId);

  var DEVICE_KEY = 'iq-device-id';
  var NICKNAME_KEY = 'iq-nickname';
  var deviceId = localStorage.getItem(DEVICE_KEY);
  if (!deviceId) {
    deviceId = 'dev-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    localStorage.setItem(DEVICE_KEY, deviceId);
  }

  var nickname = localStorage.getItem(NICKNAME_KEY) || '';
  var myScore = 0;
  var isActive = false;
  var panelEl = null;
  var listEl = null;
  var lbListener = null;
  var teacherEnabled = false;

  // ── Nickname prompt ──
  function promptNickname(callback) {
    if (nickname) {
      callback(nickname);
      return;
    }

    var previousFocus = document.activeElement;

    var overlay = document.createElement('div');
    overlay.className = 'lb-overlay';

    var dialog = document.createElement('div');
    dialog.className = 'lb-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Enter nickname');

    var title = document.createElement('div');
    title.className = 'lb-dialog-title';
    title.textContent = 'Enter your nickname';
    dialog.appendChild(title);

    var subtitle = document.createElement('div');
    subtitle.className = 'lb-dialog-subtitle';
    subtitle.textContent = 'This will be shown on the leaderboard';
    dialog.appendChild(subtitle);

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'lb-dialog-input';
    input.placeholder = 'Nickname (max 12 chars)';
    input.maxLength = 12;
    input.autocomplete = 'off';
    dialog.appendChild(input);

    var btn = document.createElement('button');
    btn.className = 'lb-dialog-btn';
    btn.textContent = 'Join';
    btn.disabled = true;
    btn.onclick = function() {
      var name = input.value.trim().replace(/[<>&"]/g, '');
      if (!name) return;
      nickname = name;
      localStorage.setItem(NICKNAME_KEY, nickname);
      overlay.remove();
      callback(nickname);
    };
    dialog.appendChild(btn);

    input.addEventListener('input', function() {
      input.value = input.value.replace(/[<>&"]/g, '');
      btn.disabled = !input.value.trim();
    });
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && input.value.trim()) {
        btn.click();
      }
    });

    // Focus trap
    overlay.addEventListener('keydown', function(e) {
      if (e.key === 'Tab') {
        var focusable = dialog.querySelectorAll('input, button');
        if (focusable.length === 0) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
      if (e.key === 'Escape') {
        overlay.remove();
        if (previousFocus) previousFocus.focus();
      }
    });

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    input.focus();
  }

  // ── Write score to Firebase ──
  function writeScore() {
    if (!isActive || !nickname) return;
    lbRef.child(deviceId).set({
      name: nickname,
      score: myScore,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    }).catch(function(err) { console.warn('[leaderboard] write failed:', err.message); });
  }

  // ── Listen for score changes from interactive-quiz ──
  document.addEventListener('iq:answer-checked', function(e) {
    if (!isActive || !nickname) return;
    if (e.detail && e.detail.isCorrect) {
      myScore++;
      writeScore();
    }
  });

  // ── Create leaderboard panel ──
  function createPanel() {
    if (panelEl) return;

    panelEl = document.createElement('div');
    panelEl.className = 'lb-panel';
    panelEl.setAttribute('aria-label', 'Leaderboard');

    var header = document.createElement('div');
    header.className = 'lb-header';

    var titleEl = document.createElement('span');
    titleEl.className = 'lb-title';
    titleEl.textContent = 'Leaderboard';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'lb-close';
    closeBtn.textContent = '\u2715';
    closeBtn.setAttribute('aria-label', 'Close leaderboard');
    closeBtn.onclick = function() { hidePanel(); };

    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    panelEl.appendChild(header);

    listEl = document.createElement('div');
    listEl.className = 'lb-list';
    listEl.setAttribute('aria-live', 'polite');
    panelEl.appendChild(listEl);

    document.body.appendChild(panelEl);
  }

  function showPanel() {
    if (!panelEl) createPanel();
    panelEl.style.display = '';
  }

  function hidePanel() {
    if (panelEl) panelEl.style.display = 'none';
  }

  // ── Update leaderboard display ──
  function updateDisplay(entries) {
    if (!listEl) return;
    listEl.textContent = '';

    if (entries.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'lb-empty';
      empty.textContent = 'No scores yet';
      listEl.appendChild(empty);
      return;
    }

    // Sort by score descending, then by timestamp ascending (first to get score)
    entries.sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return (a.timestamp || 0) - (b.timestamp || 0);
    });

    // Show top 5
    var shown = Math.min(entries.length, 5);
    var myPosition = -1;

    entries.forEach(function(entry, idx) {
      if (entry.id === deviceId) myPosition = idx;
    });

    for (var i = 0; i < shown; i++) {
      listEl.appendChild(createRow(entries[i], i + 1));
    }

    // If my position is beyond top 5, show separator + my row
    if (myPosition >= shown) {
      var sep = document.createElement('div');
      sep.className = 'lb-separator';
      sep.textContent = '\u00B7 \u00B7 \u00B7';
      listEl.appendChild(sep);
      listEl.appendChild(createRow(entries[myPosition], myPosition + 1));
    }
  }

  function createRow(entry, rank) {
    var row = document.createElement('div');
    row.className = 'lb-row';
    if (entry.id === deviceId) row.classList.add('lb-row--me');

    var rankEl = document.createElement('span');
    rankEl.className = 'lb-rank';
    if (rank === 1) rankEl.textContent = '\uD83E\uDD47';
    else if (rank === 2) rankEl.textContent = '\uD83E\uDD48';
    else if (rank === 3) rankEl.textContent = '\uD83E\uDD49';
    else rankEl.textContent = '#' + rank;

    var nameEl = document.createElement('span');
    nameEl.className = 'lb-name';
    nameEl.textContent = entry.name || 'Anonymous';

    var scoreEl = document.createElement('span');
    scoreEl.className = 'lb-score';
    scoreEl.textContent = entry.score || 0;

    row.appendChild(rankEl);
    row.appendChild(nameEl);
    row.appendChild(scoreEl);
    return row;
  }

  // ── Start/stop leaderboard ──
  function startLeaderboard() {
    if (isActive) return;
    isActive = true;

    promptNickname(function() {
      myScore = 0;
      writeScore();
      createPanel();
      showPanel();

      // Listen for real-time updates
      lbListener = lbRef.on('value', function(snap) {
        var data = snap.val() || {};
        var entries = Object.keys(data).map(function(id) {
          return {
            id: id,
            name: data[id].name,
            score: data[id].score || 0,
            timestamp: data[id].timestamp || 0
          };
        });
        updateDisplay(entries);
      });
    });
  }

  function stopLeaderboard() {
    isActive = false;
    if (lbListener) {
      lbRef.off('value', lbListener);
      lbListener = null;
    }
    hidePanel();
    // Clean up leaderboard data for this session
    lbRef.remove().catch(function(err) { console.warn('[leaderboard] remove failed:', err.message); });
  }

  // ── Teacher control: listen for session events ──
  document.addEventListener('tr:session-start', function() {
    // Teacher decides whether to enable leaderboard
    // For now, auto-start on session start
    if (teacherEnabled) startLeaderboard();
  });

  document.addEventListener('tr:session-end', function() {
    stopLeaderboard();
  });

  // ── Expose for teacher panel toggle ──
  window.Leaderboard = {
    start: function() { teacherEnabled = true; startLeaderboard(); },
    stop: function() { teacherEnabled = false; stopLeaderboard(); },
    isActive: function() { return isActive; }
  };

  // ── Dispatch answer-checked events from interactive-quiz ──
  // We hook into the existing recordAnswer by listening for DOM changes
  // Actually, we need interactive-quiz to dispatch this event
  // For now, the integration point is the iq:wrong-answer (wrong) and we also need iq:correct-answer
  // The simplest approach: observe the score tab text changes
  var lastScoreText = '';
  function pollScore() {
    var tabScore = document.querySelector('.iq-progress-tab-score');
    if (!tabScore || !isActive) return;
    var text = tabScore.textContent;
    if (text !== lastScoreText && lastScoreText) {
      // Score changed — extract current correct count
      var match = text.match(/^(\d+)\//);
      if (match) {
        var newScore = parseInt(match[1]);
        if (newScore > myScore) {
          myScore = newScore;
          writeScore();
        }
      }
    }
    lastScoreText = text;
  }

  // MutationObserver on the score element
  function observeScore() {
    var tabScore = document.querySelector('.iq-progress-tab-score');
    if (!tabScore) {
      setTimeout(observeScore, 1000);
      return;
    }
    var observer = new MutationObserver(function() {
      if (isActive) pollScore();
    });
    observer.observe(tabScore, { childList: true, characterData: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(observeScore, 500); });
  } else {
    setTimeout(observeScore, 500);
  }
})();
