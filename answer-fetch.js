/* Answer Fetch Module
   Fetches answer data from Firebase on demand when students click Answer buttons.
   Answers are NOT embedded in HTML source — only loaded from Firebase when requested.

   Requires: firebase-app-compat.js, firebase-database-compat.js, firebase-config.js
   Must be loaded AFTER those scripts.

   Supported pattern: dualscope (.qcard with data-si/data-qi attributes) */

(function() {
  'use strict';

  var examId = document.body && document.body.dataset.examId;
  if (!examId) return;

  if (typeof firebase === 'undefined' || !window.firebaseConfig) return;
  if (!firebase.apps.length) firebase.initializeApp(window.firebaseConfig);
  var db = firebase.database();

  // Section-level cache: { sectionIndex: { questionIndex: answerData } }
  var cache = {};
  // Track in-flight fetches to avoid duplicate requests
  var fetching = {};

  // Fetch all answers for a section (batch read)
  function fetchSection(si, callback) {
    var key = examId + '/' + si;
    if (cache[si]) {
      if (callback) callback(null);
      return;
    }
    if (fetching[si]) {
      // Already fetching, queue callback
      if (callback) fetching[si].push(callback);
      return;
    }
    fetching[si] = callback ? [callback] : [];

    db.ref('answers/' + examId + '/' + si).once('value')
      .then(function(snap) {
        var data = snap.val();
        cache[si] = data || {};
        var cbs = fetching[si] || [];
        delete fetching[si];
        cbs.forEach(function(cb) { cb(null); });
      })
      .catch(function(err) {
        var cbs = fetching[si] || [];
        delete fetching[si];
        cbs.forEach(function(cb) { cb(err); });
      });
  }

  // Render answer content into an ans-box element
  function renderAnswer(ansBox, data) {
    if (!data || !ansBox) return;

    // Clear placeholder
    ansBox.textContent = '';

    // Answer label
    if (data.answer) {
      var label = document.createElement('span');
      label.className = 'box-label';
      label.textContent = '\u6b63\u89e3: ' + data.answer;
      ansBox.appendChild(label);
    }

    // Translation
    if (data.translation) {
      var trans = document.createElement('div');
      trans.className = 'jp-text';
      trans.textContent = data.translation;
      ansBox.appendChild(trans);
    }

    // Explanation
    if (data.explanation) {
      var expl = document.createElement('div');
      expl.className = 'jp-text';
      expl.textContent = data.explanation;
      ansBox.appendChild(expl);
    }

    // Choice explanations
    if (data.choiceExplanations) {
      var ceDiv = document.createElement('div');
      ceDiv.className = 'choice-explanations';
      var keys = Object.keys(data.choiceExplanations);
      keys.forEach(function(choice) {
        var expText = data.choiceExplanations[choice];
        var ceItem = document.createElement('div');
        var decodedChoice = choice.replace(/\uff0e/g, '.');
        var isCorrect = data.answer && data.answer.indexOf(decodedChoice) !== -1;
        ceItem.className = 'choice-exp ' + (isCorrect ? 'correct' : 'wrong');
        ceItem.textContent = expText;
        ceDiv.appendChild(ceItem);
      });
      ansBox.appendChild(ceDiv);
    }

    // Grammar reference
    if (data.grammar) {
      var gram = document.createElement('div');
      gram.className = 'grammar-ref';
      gram.textContent = data.grammar;
      ansBox.appendChild(gram);
    }
  }

  // Show loading state in ans-box
  function showLoading(ansBox) {
    ansBox.textContent = '\u8aad\u307f\u8fbc\u307f\u4e2d...';
  }

  // Show error state in ans-box
  function showError(ansBox) {
    ansBox.textContent = '\u89e3\u7b54\u3092\u8aad\u307f\u8fbc\u3081\u307e\u305b\u3093\u3067\u3057\u305f\u3002\u30cd\u30c3\u30c8\u63a5\u7d9a\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002';
  }

  // Fetch and render answer for a specific qcard element
  function fetchAnswerForElement(qEl) {
    if (!qEl) return;
    var si = parseInt(qEl.dataset.si);
    var qi = parseInt(qEl.dataset.qi);
    if (isNaN(si) || isNaN(qi)) return;

    var collapsible = qEl.querySelector('.collapsible[data-type="answer"]');
    if (!collapsible) return;
    if (collapsible.dataset.loaded === 'true') return;

    var ansBox = collapsible.querySelector('.ans-box');
    if (!ansBox) return;

    // Check cache first
    if (cache[si] && cache[si][qi]) {
      renderAnswer(ansBox, cache[si][qi]);
      collapsible.dataset.loaded = 'true';
      return;
    }

    showLoading(ansBox);

    fetchSection(si, function(err) {
      if (err) {
        showError(ansBox);
        return;
      }
      var data = cache[si] && cache[si][qi];
      if (data) {
        renderAnswer(ansBox, data);
        collapsible.dataset.loaded = 'true';
      } else {
        showError(ansBox);
      }
    });
  }

  // Event delegation: intercept Answer button clicks
  document.addEventListener('click', function(e) {
    var btn = e.target;
    if (!btn.classList.contains('toggle-btn') || !btn.classList.contains('answer')) return;

    var qEl = btn.closest('.qcard');
    if (!qEl) return;

    fetchAnswerForElement(qEl);
  }, false);

  // Expose for teacher-reveal integration
  window.fetchAnswerForElement = fetchAnswerForElement;

  // Also expose batch prefetch for a section
  window.prefetchAnswers = function(si) {
    fetchSection(si, null);
  };
})();
