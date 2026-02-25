/* Student Responses Module
   Real-time aggregated student response display for teacher sessions.
   Students select answers on their phones during a teacher session;
   teacher sees live distribution (e.g., "A: 3, B: 12, C: 2").

   Architecture:
   - interactive-quiz.js dispatches 'iq:answer-selected' CustomEvents
   - This module writes selections to Firebase
   - Teacher panel shows aggregated bar charts per question

   Requires: firebase-app-compat.js, firebase-database-compat.js, firebase-config.js
   Must be loaded AFTER interactive-quiz.js and teacher-reveal.js */

(function() {
  'use strict';

  var examId = document.body && document.body.dataset.examId;
  if (!examId) return;

  if (typeof firebase === 'undefined' || !window.firebaseConfig) return;
  if (!firebase.apps.length) firebase.initializeApp(window.firebaseConfig);
  var db = firebase.database();

  // ── Device ID (persistent per device) ──
  var DEVICE_KEY = 'iq-device-id';
  var deviceId = localStorage.getItem(DEVICE_KEY);
  if (!deviceId) {
    deviceId = 'dev-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    localStorage.setItem(DEVICE_KEY, deviceId);
  }

  var responsesRef = db.ref('responses/' + examId);
  var isTeacher = false;
  var listeners = {};
  var aggregateDisplays = {};

  // ── Student Side: Write responses to Firebase ──
  var debounceTimers = {};
  var TEXT_TYPES = { fillin: 1, correction: 1, compose: 1, scramble: 1 };

  function writeResponse(key, d) {
    responsesRef.child(key).child(deviceId).set({
      answer: d.answer,
      type: d.type || 'choice',
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
  }

  document.addEventListener('iq:answer-selected', function(e) {
    if (isTeacher) return;
    var d = e.detail;
    var key = d.si + '-' + d.qi;

    if (TEXT_TYPES[d.type]) {
      clearTimeout(debounceTimers[key]);
      debounceTimers[key] = setTimeout(function() { writeResponse(key, d); }, 500);
    } else {
      writeResponse(key, d);
    }
  });

  // ── Teacher Side: Listen and aggregate ──
  function startListening(si, qi) {
    var key = si + '-' + qi;
    if (listeners[key]) return;

    var correctAnswer = null;
    if (typeof grammarData !== 'undefined' && grammarData.sections[si]) {
      correctAnswer = grammarData.sections[si].questions[qi].correctAnswer;
    }

    listeners[key] = responsesRef.child(key).on('value', function(snap) {
      var responses = snap.val();
      if (!responses) {
        updateDisplay(key, {}, 0, correctAnswer);
        return;
      }

      var counts = {};
      var total = 0;
      Object.keys(responses).forEach(function(devId) {
        var answer = responses[devId].answer;
        if (!counts[answer]) counts[answer] = 0;
        counts[answer]++;
        total++;
      });

      updateDisplay(key, counts, total, correctAnswer);
    });
  }

  function updateDisplay(key, counts, total, correctAnswer) {
    var display = aggregateDisplays[key];
    if (!display) return;

    display.textContent = '';
    if (total === 0) {
      display.style.display = 'none';
      return;
    }

    display.style.display = '';

    var parts = key.split('-');
    var qLabel = document.createElement('div');
    qLabel.className = 'sr-question-label';
    qLabel.textContent = 'Q' + (parseInt(parts[1]) + 1);
    display.appendChild(qLabel);

    var totalLabel = document.createElement('div');
    totalLabel.className = 'sr-total';
    totalLabel.textContent = total + ' responses';
    display.appendChild(totalLabel);

    // Detect if answers are text-type (long/varied) or discrete (A/B/C/D)
    var answers = Object.keys(counts).sort();
    var isTextType = answers.some(function(a) { return a.length > 3; });

    answers.forEach(function(answer) {
      var isCorrect = correctAnswer && answer.toLowerCase() === correctAnswer.toLowerCase();
      var bar = document.createElement('div');
      bar.className = 'sr-bar';

      var label = document.createElement('span');
      label.className = 'sr-label ' + (isCorrect ? 'sr-correct' : 'sr-wrong');
      if (isTextType) {
        label.classList.add('sr-text-label');
        label.textContent = answer.length > 24 ? answer.substring(0, 22) + '...' : answer;
        label.title = answer;
      } else {
        label.textContent = answer.toUpperCase();
      }

      var track = document.createElement('div');
      track.className = 'sr-fill-track';
      var fill = document.createElement('div');
      fill.className = 'sr-fill ' + (isCorrect ? 'sr-correct' : 'sr-wrong');
      var pct = total > 0 ? (counts[answer] / total * 100) : 0;
      fill.style.width = pct + '%';
      track.appendChild(fill);

      var count = document.createElement('span');
      count.className = 'sr-count';
      count.textContent = counts[answer];

      bar.appendChild(label);
      bar.appendChild(track);
      bar.appendChild(count);
      display.appendChild(bar);
    });
  }

  // ── Inject response displays into teacher panel ──
  function injectIntoPanel() {
    // New layout: inject into per-question .tr-q-answers containers
    var ansAreas = document.querySelectorAll('.tr-q-answers[data-section][data-question]');
    if (ansAreas.length > 0) {
      ansAreas.forEach(function(ansArea) {
        var si = parseInt(ansArea.dataset.section);
        var qi = parseInt(ansArea.dataset.question);
        var key = si + '-' + qi;

        var display = document.createElement('div');
        display.className = 'sr-question-display';
        display.dataset.key = key;
        display.style.display = 'none';
        ansArea.appendChild(display);
        aggregateDisplays[key] = display;

        startListening(si, qi);
      });
      return;
    }

    // Fallback: legacy grid layout (non-dualscope patterns)
    var sectionGroups = document.querySelectorAll('.tr-section-group');
    sectionGroups.forEach(function(secDiv) {
      var qBtns = secDiv.querySelectorAll('.tr-btn-q[data-section][data-question]');
      if (qBtns.length === 0) return;

      var si = parseInt(qBtns[0].dataset.section);

      var responseArea = document.createElement('div');
      responseArea.className = 'sr-section-responses';
      responseArea.style.display = 'none';
      secDiv.appendChild(responseArea);

      qBtns.forEach(function(btn) {
        var qi = parseInt(btn.dataset.question);
        var key = si + '-' + qi;

        var display = document.createElement('div');
        display.className = 'sr-question-display';
        display.dataset.key = key;
        display.style.display = 'none';
        responseArea.appendChild(display);
        aggregateDisplays[key] = display;

        startListening(si, qi);
      });

      var observer = new MutationObserver(function() {
        var displays = responseArea.querySelectorAll('.sr-question-display');
        var anyShown = false;
        displays.forEach(function(d) {
          if (d.style.display !== 'none' && d.children.length > 0) anyShown = true;
        });
        responseArea.style.display = anyShown ? '' : 'none';
      });
      observer.observe(responseArea, { childList: true, subtree: true, attributes: true });
    });
  }

  // ── Cleanup ──
  function detachAllListeners() {
    Object.keys(listeners).forEach(function(key) {
      responsesRef.child(key).off('value', listeners[key]);
    });
    listeners = {};
    aggregateDisplays = {};
  }

  // ── Session lifecycle ──
  document.addEventListener('tr:session-start', function() {
    // Re-inject if panel was rebuilt
    setTimeout(function() {
      if (isTeacher && Object.keys(aggregateDisplays).length === 0) {
        injectIntoPanel();
      }
    }, 300);
  });

  document.addEventListener('tr:session-end', function() {
    responsesRef.remove();
    detachAllListeners();
  });

  document.addEventListener('tr:reset-responses', function() {
    responsesRef.remove();
    Object.keys(aggregateDisplays).forEach(function(key) {
      var display = aggregateDisplays[key];
      if (display) {
        display.textContent = '';
        display.style.display = 'none';
      }
    });
  });

  // ── Init: Watch for teacher panel creation ──
  function init() {
    var panelCheck = new MutationObserver(function() {
      if (document.querySelector('.tr-panel') && !isTeacher) {
        isTeacher = true;
        panelCheck.disconnect();
        setTimeout(injectIntoPanel, 200);
      }
    });
    panelCheck.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
