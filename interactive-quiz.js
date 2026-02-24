/* Interactive Quiz Module
   Adds interactive answering to grammarData-driven lesson pages.
   Enhances existing .qcard DOM elements with input UI and feedback.
   Supports: pair, choice, error, scramble question types.
   Non-interactive types (translate, compose) are left untouched.

   Teacher Reveal integration:
   Listens for CustomEvents from teacher-reveal.js:
   - tr:session-start  → hide Check buttons (students can still select)
   - tr:session-end    → show Check buttons for unanswered questions
   - tr:question-revealed → auto-trigger feedback for that question */

(function() {
  'use strict';

  if (typeof grammarData === 'undefined' || !grammarData.sections) return;

  // Count interactive questions
  var totalInteractive = 0;
  grammarData.sections.forEach(function(sec) {
    sec.questions.forEach(function(q) {
      if (q.type && (q.correctAnswer || q.correctText)) totalInteractive++;
    });
  });
  if (totalInteractive === 0) return;

  // ── State ──
  var score = { correct: 0, answered: 0, total: totalInteractive };
  var answeredKeys = {};  // "si-qi" → { result: "correct"|"wrong", userAnswer: <varies>, type: string }
  var iqSessionActive = false;
  var reviewMode = false;
  var retryMode = false;
  var retryKeys = [];
  var retryBackup = {};
  var retryBarEl = null;

  // ── Gamification state ──
  var streak = 0;
  var bestStreak = 0;
  var badges = [];
  var sectionScores = {};  // si → { correct: N, total: N }

  var BADGES = [
    { id: 'first-blood', name: 'First Blood', desc: 'First correct answer', icon: '\u2B50' },
    { id: 'streak-3', name: 'On Fire', desc: '3 in a row', icon: '\uD83D\uDD25' },
    { id: 'streak-5', name: 'Blazing', desc: '5 in a row', icon: '\uD83D\uDD25\uD83D\uDD25' },
    { id: 'streak-10', name: 'Unstoppable', desc: '10 in a row', icon: '\uD83D\uDD25\uD83D\uDD25\uD83D\uDD25' },
    { id: 'perfect-section', name: 'Perfect Section', desc: '100% on a section', icon: '\u2705' },
    { id: 'lesson-complete', name: 'Lesson Complete', desc: 'All questions done', icon: '\uD83C\uDFC1' },
    { id: 'lesson-master', name: 'Lesson Master', desc: '100% entire lesson', icon: '\uD83C\uDFC6' }
  ];

  function loadProgress() {
    var key = 'iq-progress-' + (document.body.dataset.examId || 'default');
    try {
      var data = JSON.parse(localStorage.getItem(key) || '{}');
      bestStreak = data.bestStreak || 0;
      badges = data.badges || [];
      sectionScores = data.sectionScores || {};
      if (data.answeredKeys) {
        answeredKeys = {};
        Object.keys(data.answeredKeys).forEach(function(k) {
          var v = data.answeredKeys[k];
          answeredKeys[k] = (typeof v === 'string') ? { result: v } : v;
        });
      }
    } catch (e) { /* ignore corrupt data */ }
  }

  function saveProgress() {
    var key = 'iq-progress-' + (document.body.dataset.examId || 'default');
    localStorage.setItem(key, JSON.stringify({
      bestStreak: bestStreak,
      badges: badges,
      sectionScores: sectionScores,
      answeredKeys: answeredKeys
    }));
  }

  function getAnswerResult(key) {
    var entry = answeredKeys[key];
    if (!entry) return null;
    if (typeof entry === 'string') return entry;
    return entry.result;
  }

  // ── Progress panel DOM ──
  var progressTabEl = null;
  var progressPanelEl = null;
  var progressBackdropEl = null;
  var progressBodyEl = null;
  var tabScoreEl = null;
  var tabFillEl = null;
  var panelTotalEl = null;
  var panelFillEl = null;
  var streakEl = null;
  var trophyBtnEl = null;
  var badgePanelEl = null;
  var reviewNavEl = null;
  var retryBtnEl = null;
  var progressPanelOpen = false;

  var CATEGORY_NAMES = { basic: '\u57FA\u672C\u554F\u984C', comm: 'FOR COMMUNICATION', advanced: '\u767A\u5C55\u554F\u984C' };

  function createProgressPanel() {
    // ── Tab handle (always visible, bottom-left) ──
    progressTabEl = document.createElement('div');
    progressTabEl.className = 'iq-progress-tab';
    progressTabEl.onclick = function() { toggleProgressPanel(); };
    progressTabEl.title = 'Progress';

    tabScoreEl = document.createElement('span');
    tabScoreEl.className = 'iq-progress-tab-score';

    var tabBar = document.createElement('div');
    tabBar.className = 'iq-progress-tab-bar';
    tabFillEl = document.createElement('div');
    tabFillEl.className = 'iq-progress-tab-fill';
    tabBar.appendChild(tabFillEl);

    progressTabEl.appendChild(tabScoreEl);
    progressTabEl.appendChild(tabBar);
    document.body.appendChild(progressTabEl);

    // ── Panel (hidden, slides from left) ──
    progressPanelEl = document.createElement('div');
    progressPanelEl.className = 'iq-progress-panel';

    // Header
    var header = document.createElement('div');
    header.className = 'iq-progress-header';

    var headerTop = document.createElement('div');
    headerTop.className = 'iq-progress-header-top';

    var titleEl = document.createElement('span');
    titleEl.className = 'iq-progress-title';
    titleEl.textContent = 'Progress';

    var headerActions = document.createElement('div');
    headerActions.className = 'iq-progress-header-actions';

    streakEl = document.createElement('span');
    streakEl.className = 'iq-streak';
    streakEl.style.display = 'none';

    trophyBtnEl = document.createElement('button');
    trophyBtnEl.className = 'iq-trophy-btn';
    trophyBtnEl.textContent = '\uD83C\uDFC6';
    trophyBtnEl.title = 'Achievements';
    trophyBtnEl.onclick = function() { toggleBadgePanel(); };

    var closeBtn = document.createElement('button');
    closeBtn.className = 'iq-progress-close';
    closeBtn.textContent = '\u2715';
    closeBtn.onclick = function() { closeProgressPanel(); };

    headerActions.appendChild(streakEl);
    headerActions.appendChild(trophyBtnEl);
    headerActions.appendChild(closeBtn);
    headerTop.appendChild(titleEl);
    headerTop.appendChild(headerActions);

    // Total score in header
    panelTotalEl = document.createElement('div');
    panelTotalEl.className = 'iq-progress-total';

    var totalBar = document.createElement('div');
    totalBar.className = 'iq-progress-total-bar';
    panelFillEl = document.createElement('div');
    panelFillEl.className = 'iq-progress-total-fill';
    totalBar.appendChild(panelFillEl);

    header.appendChild(headerTop);
    header.appendChild(panelTotalEl);
    header.appendChild(totalBar);

    // Body (scrollable section list)
    progressBodyEl = document.createElement('div');
    progressBodyEl.className = 'iq-progress-body';

    // Footer
    var footer = document.createElement('div');
    footer.className = 'iq-progress-footer';

    retryBtnEl = document.createElement('button');
    retryBtnEl.className = 'iq-progress-retry-btn';
    retryBtnEl.textContent = 'Retry Wrong';
    retryBtnEl.style.display = 'none';
    retryBtnEl.onclick = function() { startRetryMode(); };

    var resetBtn = document.createElement('button');
    resetBtn.className = 'iq-progress-reset-btn';
    resetBtn.textContent = 'Reset All';
    resetBtn.onclick = function() { confirmAndResetProgress(); };

    footer.appendChild(retryBtnEl);
    footer.appendChild(resetBtn);

    progressPanelEl.appendChild(header);
    progressPanelEl.appendChild(progressBodyEl);
    progressPanelEl.appendChild(footer);
    document.body.appendChild(progressPanelEl);

    // Set initial off-screen position
    if (typeof gsap !== 'undefined') {
      gsap.set(progressPanelEl, { x: -320 });
    } else {
      progressPanelEl.style.transform = 'translateX(-320px)';
    }

    // ── Backdrop (mobile) ──
    progressBackdropEl = document.createElement('div');
    progressBackdropEl.className = 'iq-progress-backdrop';
    progressBackdropEl.style.display = 'none';
    progressBackdropEl.onclick = function() { closeProgressPanel(); };
    document.body.appendChild(progressBackdropEl);

    // Initial content
    updateProgressPanel();
  }

  // ── Update tab + panel content ──
  function updateProgressPanel() {
    var pct = score.total > 0 ? (score.correct / score.total) * 100 : 0;

    // Update tab
    if (tabScoreEl) tabScoreEl.textContent = score.correct + '/' + score.total;
    if (tabFillEl) tabFillEl.style.width = pct + '%';

    // Update panel header
    if (panelTotalEl) {
      panelTotalEl.textContent = '';
      var numSpan = document.createElement('span');
      numSpan.className = 'iq-progress-total-num';
      numSpan.textContent = score.correct + ' / ' + score.total;
      panelTotalEl.appendChild(numSpan);
      if (score.answered > 0 && score.answered < score.total) {
        var answeredSpan = document.createElement('span');
        answeredSpan.className = 'iq-progress-total-answered';
        answeredSpan.textContent = ' (' + score.answered + ' answered)';
        panelTotalEl.appendChild(answeredSpan);
      }
    }
    if (panelFillEl) panelFillEl.style.width = pct + '%';

    // Update retry button
    var wrongCount = getTotalWrong();
    if (retryBtnEl) {
      retryBtnEl.textContent = 'Retry Wrong' + (wrongCount > 0 ? ' (' + wrongCount + ')' : '');
      retryBtnEl.style.display = wrongCount > 0 ? '' : 'none';
    }

    // Rebuild body
    if (!progressBodyEl) return;
    progressBodyEl.textContent = '';

    var categoryMap = (typeof NavState !== 'undefined' && NavState.categoryMap) ? NavState.categoryMap : null;

    if (categoryMap) {
      Object.keys(categoryMap).forEach(function(cat) {
        var sectionIndices = categoryMap[cat];
        if (!sectionIndices || sectionIndices.length === 0) return;

        var catHeader = document.createElement('div');
        catHeader.className = 'iq-progress-category-name';
        catHeader.textContent = CATEGORY_NAMES[cat] || cat;
        progressBodyEl.appendChild(catHeader);

        sectionIndices.forEach(function(si) {
          var row = createSectionRow(si, cat);
          if (row) progressBodyEl.appendChild(row);
        });
      });
    } else {
      grammarData.sections.forEach(function(sec, si) {
        var row = createSectionRow(si, null);
        if (row) progressBodyEl.appendChild(row);
      });
    }
  }

  function createSectionRow(si, cat) {
    var sec = grammarData.sections[si];
    if (!sec) return null;

    var interactiveCount = 0;
    var answeredCount = 0;
    var correctCount = 0;
    sec.questions.forEach(function(q, qi) {
      if (q.type && (q.correctAnswer || q.correctText)) {
        interactiveCount++;
        var key = si + '-' + qi;
        if (answeredKeys[key]) {
          answeredCount++;
          if (getAnswerResult(key) === 'correct') correctCount++;
        }
      }
    });

    if (interactiveCount === 0) return null;

    var row = document.createElement('div');
    row.className = 'iq-progress-section-row';
    row.onclick = function() {
      if (typeof Router !== 'undefined' && Router.navigate) {
        Router.navigate('question', cat, si);
      } else if (typeof Router !== 'undefined' && Router.setSection) {
        if (cat && Router.setCategory) Router.setCategory(cat);
        Router.setSection(si);
      } else {
        window.location.hash = '#section-' + si;
      }
      closeProgressPanel();
    };

    var titleEl = document.createElement('span');
    titleEl.className = 'iq-progress-section-title';
    var shortTitle = sec.title.replace(/^\[\d+\]\s*/, '').replace(/^[\u57FA\u672C\u554F\u984C\u767A\u5C55\u554F\u984CFOR COMMUNICATION]+\s*\d*[\uFF5C|]\s*/, '');
    titleEl.textContent = shortTitle || sec.title;
    titleEl.title = sec.title;

    var fractionEl = document.createElement('span');
    fractionEl.className = 'iq-progress-section-fraction';
    fractionEl.textContent = correctCount + '/' + interactiveCount;

    var barEl = document.createElement('div');
    barEl.className = 'iq-progress-section-bar';
    var fillEl = document.createElement('div');
    fillEl.className = 'iq-progress-section-fill';
    fillEl.style.width = (interactiveCount > 0 ? (correctCount / interactiveCount) * 100 : 0) + '%';
    barEl.appendChild(fillEl);

    var statusEl = document.createElement('span');
    statusEl.className = 'iq-progress-section-status';
    if (answeredCount === 0) {
      statusEl.classList.add('not-started');
    } else if (correctCount === interactiveCount) {
      statusEl.classList.add('all-correct');
    } else {
      statusEl.classList.add('partial');
    }

    row.appendChild(titleEl);
    row.appendChild(fractionEl);
    row.appendChild(barEl);
    row.appendChild(statusEl);

    return row;
  }

  // ── Panel open/close ──
  function toggleProgressPanel() {
    if (progressPanelOpen) closeProgressPanel();
    else openProgressPanel();
  }

  function openProgressPanel() {
    if (!progressPanelEl || progressPanelOpen) return;
    progressPanelOpen = true;
    updateProgressPanel();
    if (typeof gsap !== 'undefined') {
      gsap.to(progressPanelEl, { x: 0, duration: 0.35, ease: 'power2.out' });
      if (progressBackdropEl) {
        progressBackdropEl.style.display = '';
        gsap.fromTo(progressBackdropEl, { opacity: 0 }, { opacity: 1, duration: 0.25 });
      }
    } else {
      progressPanelEl.style.transform = 'translateX(0)';
      if (progressBackdropEl) progressBackdropEl.style.display = '';
    }
  }

  function closeProgressPanel() {
    if (!progressPanelEl || !progressPanelOpen) return;
    progressPanelOpen = false;
    if (typeof gsap !== 'undefined') {
      gsap.to(progressPanelEl, { x: -320, duration: 0.3, ease: 'power2.inOut' });
      if (progressBackdropEl) {
        gsap.to(progressBackdropEl, { opacity: 0, duration: 0.2, onComplete: function() {
          progressBackdropEl.style.display = 'none';
        }});
      }
    } else {
      progressPanelEl.style.transform = 'translateX(-320px)';
      if (progressBackdropEl) progressBackdropEl.style.display = 'none';
    }
  }

  function flashTab(isCorrect) {
    if (!progressTabEl || typeof gsap === 'undefined') return;
    var color = isCorrect ? 'rgba(22, 163, 74, 0.4)' : 'rgba(220, 38, 38, 0.4)';
    gsap.fromTo(progressTabEl,
      { boxShadow: '0 0 0 0 ' + color },
      { boxShadow: '0 0 12px 4px ' + color, duration: 0.3, yoyo: true, repeat: 1, ease: 'power2.inOut' }
    );
  }

  function addScore(isCorrect, si) {
    score.answered++;
    if (isCorrect) {
      score.correct++;
      streak++;
      if (streak > bestStreak) bestStreak = streak;
    } else {
      streak = 0;
    }
    updateProgressPanel();
    updateStreakDisplay();
    flashTab(isCorrect);
    if (si !== undefined) updateSectionScore(si, isCorrect);
    checkAchievements(si);
    saveProgress();
  }

  function updateSectionScore(si, isCorrect) {
    if (!sectionScores[si]) sectionScores[si] = { correct: 0, total: 0 };
    sectionScores[si].total++;
    if (isCorrect) sectionScores[si].correct++;
  }

  // ── Helpers ──
  function getQKey(si, qi) { return si + '-' + qi; }

  function getQuestionData(si, qi) {
    var sec = grammarData.sections[si];
    return sec ? sec.questions[qi] : null;
  }

  function parseChoices(choicesStr) {
    var items = choicesStr.split(/\u3000|\t/);
    var result = [];
    items.forEach(function(item) {
      item = item.trim();
      if (!item) return;
      var match = item.match(/^([a-z])\.\s*(.+)/);
      if (match) {
        result.push({ letter: match[1], text: match[2] });
      }
    });
    return result;
  }

  function parsePairOptions(text) {
    var match = text.match(/\(\s*([^,]+),\s*([^)]+)\s*\)/);
    if (!match) return null;
    return [match[1].trim(), match[2].trim()];
  }

  function parseScrambleWords(scrambleStr) {
    var match = scrambleStr.match(/\[\s*(.+?)\s*\]/);
    if (!match) return [];
    var inside = match[1];
    // Comma-separated: [ word1, word2, word3 ]
    if (inside.indexOf(',') !== -1) {
      return inside.split(',').map(function(w) { return w.trim(); }).filter(Boolean);
    }
    // Labeled format: [ a. word1　b. word2　c. word3 ]
    var parts = inside.split(/[\s\u3000]*[a-z]\.[\s\u3000]*/);
    return parts.map(function(w) { return w.trim(); }).filter(Boolean);
  }

  function parseScrambleFrame(scrambleStr) {
    var match = scrambleStr.match(/^(.*?)\[.*\](.*)$/);
    if (!match) return { prefix: '', suffix: '' };
    return { prefix: match[1].trim(), suffix: match[2].trim() };
  }

  function matchesCorrectText(typed, correctText) {
    var answers = Array.isArray(correctText) ? correctText : [correctText];
    return answers.some(function(a) { return typed.toLowerCase() === a.toLowerCase(); });
  }
  function displayCorrectText(correctText) {
    return Array.isArray(correctText) ? correctText.join(' / ') : correctText;
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function createFeedback(isCorrect, message) {
    var el = document.createElement('div');
    el.className = 'iq-feedback ' + (isCorrect ? 'correct' : 'incorrect');
    el.textContent = message;
    return el;
  }

  // ── Enhance a single .qcard ──
  function enhanceCard(cardEl) {
    var si = parseInt(cardEl.dataset.si);
    var qi = parseInt(cardEl.dataset.qi);
    var key = getQKey(si, qi);

    if (cardEl.dataset.iqEnhanced) return;
    cardEl.dataset.iqEnhanced = 'true';

    var q = getQuestionData(si, qi);
    if (!q || !q.type || (!q.correctAnswer && !q.correctText)) return;

    var questionDiv = cardEl.querySelector('.qcard-question');
    if (!questionDiv) return;

    var zone = document.createElement('div');
    zone.className = 'iq-zone';
    zone.dataset.si = si;
    zone.dataset.qi = qi;

    switch (q.type) {
      case 'pair':
        buildPairUI(zone, q, si, qi);
        break;
      case 'choice':
        buildChoiceUI(zone, q, si, qi);
        break;
      case 'error':
        buildErrorUI(zone, q, si, qi, cardEl);
        break;
      case 'scramble':
        buildScrambleUI(zone, q, si, qi);
        break;
      case 'correction':
        buildCorrectionUI(zone, q, si, qi, cardEl);
        break;
      case 'fillin':
        buildFillinUI(zone, q, si, qi, cardEl);
        break;
      case 'compose':
        buildComposeUI(zone, q, si, qi);
        break;
      default:
        return;
    }

    questionDiv.appendChild(zone);

    // If previously answered, restore visual state immediately
    if (answeredKeys[key]) {
      applyAnsweredVisualState(zone, q, answeredKeys[key], cardEl);
    }
  }

  // ── Apply post-answer visual state for restored cards ──
  function applyAnsweredVisualState(zone, q, entry, cardEl) {
    var result = entry.result || (typeof entry === 'string' ? entry : null);
    var userAnswer = entry.userAnswer;
    var type = entry.type || q.type;
    var wasCorrect = result === 'correct';

    // Lock zone and hide check/show buttons
    zone.classList.add('locked');
    zone.querySelectorAll('.iq-check-btn').forEach(function(btn) { btn.style.display = 'none'; });

    switch (type) {
      case 'pair': {
        zone.querySelectorAll('.iq-choice').forEach(function(b) {
          if (b.textContent === q.correctAnswer) {
            b.classList.add('correct');
          } else if (!wasCorrect && b.textContent === userAnswer) {
            b.classList.add('selected', 'wrong');
          } else {
            b.classList.add('dimmed');
          }
        });
        break;
      }

      case 'choice': {
        zone.querySelectorAll('.iq-choice').forEach(function(b) {
          if (b.dataset.letter === q.correctAnswer) {
            b.classList.add('correct');
          } else if (!wasCorrect && b.dataset.letter === userAnswer) {
            b.classList.add('selected', 'wrong');
          } else {
            b.classList.add('dimmed');
          }
        });
        break;
      }

      case 'error': {
        var qtext = cardEl.querySelector('.qtext');
        if (qtext) {
          var underlines = qtext.querySelectorAll('u[data-label]');
          var selectedLabel = userAnswer ? userAnswer.label : null;
          underlines.forEach(function(u) {
            u.style.cursor = 'default';
            if (u.dataset.label === q.correctAnswer) {
              u.classList.add('correct');
            } else if (!wasCorrect && u.dataset.label === selectedLabel) {
              u.classList.add('selected', 'wrong');
            }
          });
        }
        var corrInput = zone.querySelector('.iq-correction-input');
        if (corrInput) {
          if (userAnswer && userAnswer.correctionText) corrInput.value = userAnswer.correctionText;
          corrInput.disabled = true;
        }
        break;
      }

      case 'correction': {
        var correctionInput = zone.querySelector('.iq-correction-input');
        if (correctionInput) {
          if (userAnswer) correctionInput.value = userAnswer;
          correctionInput.disabled = true;
        }
        var corrQtext = cardEl.querySelector('.qtext');
        if (corrQtext) {
          var underline = corrQtext.querySelector('u');
          if (underline) underline.classList.add(wasCorrect ? 'correct' : 'wrong');
        }
        if (!wasCorrect) {
          var display = displayCorrectText(q.correctText);
          var answerEl = document.createElement('div');
          answerEl.className = 'iq-correction-answer';
          answerEl.textContent = display;
          if (correctionInput) correctionInput.parentNode.insertBefore(answerEl, correctionInput.nextSibling);
        }
        break;
      }

      case 'fillin': {
        var fillinQtext = cardEl.querySelector('.qtext');
        if (fillinQtext && userAnswer && Array.isArray(userAnswer)) {
          var inputs = fillinQtext.querySelectorAll('.iq-fillin-input');
          inputs.forEach(function(inp, i) {
            if (userAnswer[i] !== undefined) inp.value = userAnswer[i];
            var expected = (q.correctAnswer[i] || '').toLowerCase();
            var typed = (userAnswer[i] || '').trim().toLowerCase();
            inp.classList.add(typed === expected ? 'correct' : 'wrong');
            inp.disabled = true;
          });
        }
        break;
      }

      case 'compose': {
        var textarea = zone.querySelector('.iq-compose-input');
        if (textarea) textarea.disabled = true;
        // Show model answer directly
        var reveal = document.createElement('div');
        reveal.className = 'iq-compose-reveal';
        reveal.textContent = q.correctAnswer;
        zone.appendChild(reveal);
        break;
      }

      case 'scramble':
        // Cannot restore word placement — just show feedback
        break;
    }

    // Add feedback message
    var displayAnswer = Array.isArray(q.correctAnswer)
      ? q.correctAnswer.join(', ')
      : (q.correctAnswer || displayCorrectText(q.correctText));
    var msg = wasCorrect ? 'Correct!' : 'Incorrect. Answer: ' + displayAnswer;
    zone.appendChild(createFeedback(wasCorrect, msg));

    if (!wasCorrect) cardEl.classList.add('iq-wrong');
  }

  // ── Pair UI ──
  function buildPairUI(zone, q, si, qi) {
    var options = parsePairOptions(q.text);
    if (!options) return;

    var choicesDiv = document.createElement('div');
    choicesDiv.className = 'iq-choices';
    var selected = null;

    function performCheck() {
      if (!selected || zone.classList.contains('locked')) return;
      var isCorrect = selected === q.correctAnswer;
      if (window.UISound) UISound.play(isCorrect ? 'correct' : 'wrong');
      zone.classList.add('locked');

      choicesDiv.querySelectorAll('.iq-choice').forEach(function(b) {
        if (b.textContent === q.correctAnswer) {
          b.classList.remove('selected');
          b.classList.add('correct');
        } else if (b.classList.contains('selected')) {
          b.classList.add('wrong');
        } else {
          b.classList.add('dimmed');
        }
      });

      var msg = isCorrect ? 'Correct!' : 'Incorrect. Answer: ' + q.correctAnswer;
      zone.appendChild(createFeedback(isCorrect, msg));

      answeredKeys[getQKey(si, qi)] = { result: isCorrect ? 'correct' : 'wrong', userAnswer: selected, type: 'pair' };
      addScore(isCorrect, si);
    }

    zone._performCheck = performCheck;

    options.forEach(function(opt) {
      var btn = document.createElement('button');
      btn.className = 'iq-choice';
      btn.textContent = opt;
      btn.onclick = function() {
        if (zone.classList.contains('locked')) return;
        choicesDiv.querySelectorAll('.iq-choice').forEach(function(b) {
          b.classList.remove('selected');
        });
        btn.classList.add('selected');
        selected = opt;
        if (window.UISound) UISound.play('click');
        if (iqSessionActive) {
          document.dispatchEvent(new CustomEvent('iq:answer-selected', {
            detail: { si: si, qi: qi, answer: opt, type: 'pair' }
          }));
          return;
        }
        // Auto-check after brief delay for selection animation
        setTimeout(function() { performCheck(); }, 300);
      };
      choicesDiv.appendChild(btn);
    });

    zone.appendChild(choicesDiv);
  }

  // ── Choice UI ──
  function buildChoiceUI(zone, q, si, qi) {
    if (!q.choices) return;
    var items = parseChoices(q.choices);
    if (items.length === 0) return;

    var choicesDiv = document.createElement('div');
    choicesDiv.className = 'iq-choices';
    var selectedLetter = null;

    function performCheck() {
      if (!selectedLetter || zone.classList.contains('locked')) return;
      var isCorrect = selectedLetter === q.correctAnswer;
      if (window.UISound) UISound.play(isCorrect ? 'correct' : 'wrong');
      zone.classList.add('locked');

      var correctText = '';
      choicesDiv.querySelectorAll('.iq-choice').forEach(function(b) {
        if (b.dataset.letter === q.correctAnswer) {
          b.classList.remove('selected');
          b.classList.add('correct');
          correctText = b.textContent;
        } else if (b.classList.contains('selected')) {
          b.classList.add('wrong');
        } else {
          b.classList.add('dimmed');
        }
      });

      var msg = isCorrect ? 'Correct!' : 'Incorrect. Answer: ' + correctText;
      zone.appendChild(createFeedback(isCorrect, msg));

      answeredKeys[getQKey(si, qi)] = { result: isCorrect ? 'correct' : 'wrong', userAnswer: selectedLetter, type: 'choice' };
      addScore(isCorrect, si);
    }

    zone._performCheck = performCheck;

    items.forEach(function(item) {
      var btn = document.createElement('button');
      btn.className = 'iq-choice';
      btn.textContent = item.letter + '. ' + item.text;
      btn.dataset.letter = item.letter;
      btn.onclick = function() {
        if (zone.classList.contains('locked')) return;
        choicesDiv.querySelectorAll('.iq-choice').forEach(function(b) {
          b.classList.remove('selected');
        });
        btn.classList.add('selected');
        selectedLetter = item.letter;
        if (window.UISound) UISound.play('click');
        if (iqSessionActive) {
          document.dispatchEvent(new CustomEvent('iq:answer-selected', {
            detail: { si: si, qi: qi, answer: item.letter, type: 'choice' }
          }));
          return;
        }
        // Auto-check after brief delay for selection animation
        setTimeout(function() { performCheck(); }, 300);
      };
      choicesDiv.appendChild(btn);
    });

    zone.appendChild(choicesDiv);
  }

  // ── Error UI ──
  function buildErrorUI(zone, q, si, qi, cardEl) {
    var qtext = cardEl.querySelector('.qtext');
    if (!qtext) return;

    var underlines = qtext.querySelectorAll('u');
    if (underlines.length < 2) return;

    var selectedLabel = null;
    var correctionInput = null;
    var checkBtn = null;
    var hasTextReq = !!q.correctText;

    function performCheck() {
      if (!selectedLabel || zone.classList.contains('locked')) return;
      var selectionCorrect = selectedLabel === q.correctAnswer;
      var textCorrect = true;

      if (hasTextReq && correctionInput) {
        var typed = correctionInput.value.trim();
        textCorrect = matchesCorrectText(typed, q.correctText);
        correctionInput.disabled = true;
      }

      var isCorrect = selectionCorrect && textCorrect;
      if (window.UISound) UISound.play(isCorrect ? 'correct' : 'wrong');
      zone.classList.add('locked');
      if (checkBtn) checkBtn.style.display = 'none';

      underlines.forEach(function(u) {
        if (!u.dataset.label) return;
        u.style.cursor = 'default';
        if (u.dataset.label === q.correctAnswer) {
          u.classList.remove('selected');
          u.classList.add('correct');
        } else if (u.classList.contains('selected')) {
          u.classList.add('wrong');
        }
      });

      var msg;
      if (isCorrect) {
        msg = 'Correct!';
      } else if (selectionCorrect && !textCorrect) {
        msg = 'You found the error! The correct form is: ' + displayCorrectText(q.correctText);
      } else {
        msg = 'Incorrect. The error is in part ' + q.correctAnswer + '.';
      }
      zone.appendChild(createFeedback(isCorrect, msg));

      if (hasTextReq && !textCorrect) {
        var answer = document.createElement('div');
        answer.className = 'iq-correction-answer';
        answer.textContent = displayCorrectText(q.correctText);
        correctionInput.parentNode.insertBefore(answer, correctionInput.nextSibling);
      }

      answeredKeys[getQKey(si, qi)] = { result: isCorrect ? 'correct' : 'wrong', userAnswer: { label: selectedLabel, correctionText: (correctionInput ? correctionInput.value.trim() : null) }, type: 'error' };
      addScore(isCorrect, si);
    }

    zone._performCheck = performCheck;

    underlines.forEach(function(u) {
      var text = u.textContent.trim();
      var match = text.match(/^([a-d])\./);
      if (!match) return;
      var label = match[1];
      u.classList.add('iq-error-option');
      u.dataset.label = label;
      u.style.cursor = 'pointer';
      u.onclick = function() {
        if (zone.classList.contains('locked')) return;
        underlines.forEach(function(uu) { uu.classList.remove('selected'); });
        u.classList.add('selected');
        selectedLabel = label;
        if (window.UISound) UISound.play('click');
        if (iqSessionActive) {
          document.dispatchEvent(new CustomEvent('iq:answer-selected', {
            detail: { si: si, qi: qi, answer: label, type: 'error' }
          }));
          return;
        }
        if (!hasTextReq) {
          // Auto-check for click-only error questions
          setTimeout(function() { performCheck(); }, 300);
        } else if (checkBtn) {
          checkBtn.disabled = !(correctionInput && correctionInput.value.trim());
        }
      };
    });

    var hint = document.createElement('div');
    hint.className = 'iq-scramble-label';
    hint.textContent = hasTextReq
      ? 'Click the error, then type the correct form'
      : 'Click the underlined part with an error';
    zone.appendChild(hint);

    if (hasTextReq) {
      correctionInput = document.createElement('input');
      correctionInput.type = 'text';
      correctionInput.className = 'iq-correction-input';
      correctionInput.placeholder = 'Type the correct form...';
      correctionInput.oninput = function() {
        if (!iqSessionActive && checkBtn) {
          checkBtn.disabled = !(selectedLabel && correctionInput.value.trim());
        }
      };
      correctionInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && checkBtn && !checkBtn.disabled) {
          e.preventDefault();
          performCheck();
        }
      });
      zone.appendChild(correctionInput);

      checkBtn = document.createElement('button');
      checkBtn.className = 'iq-check-btn iq-check-btn--subtle';
      checkBtn.textContent = 'Check';
      checkBtn.disabled = true;
      if (iqSessionActive) checkBtn.style.display = 'none';
      checkBtn.onclick = function() { performCheck(); };
      zone.appendChild(checkBtn);
    }
  }

  // ── Correction UI (single-underline error — type the fix) ──
  function buildCorrectionUI(zone, q, si, qi, cardEl) {
    var qtext = cardEl.querySelector('.qtext');
    if (!qtext) return;

    var underline = qtext.querySelector('u');
    if (underline) underline.classList.add('iq-error-highlight');
    var errorWord = underline ? underline.textContent.trim() : '';

    var hint = document.createElement('div');
    hint.className = 'iq-scramble-label';
    hint.textContent = 'Type the correct form for the underlined word';
    zone.appendChild(hint);

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'iq-correction-input';
    input.placeholder = errorWord + ' → ...';

    var checkBtn = document.createElement('button');
    checkBtn.className = 'iq-check-btn iq-check-btn--subtle';
    checkBtn.textContent = 'Check';
    checkBtn.disabled = true;
    if (iqSessionActive) checkBtn.style.display = 'none';

    function performCheck() {
      var typed = input.value.trim();
      if (!typed || zone.classList.contains('locked')) return;
      var isCorrect = matchesCorrectText(typed, q.correctText);
      if (window.UISound) UISound.play(isCorrect ? 'correct' : 'wrong');

      input.disabled = true;
      zone.classList.add('locked');
      checkBtn.style.display = 'none';

      if (underline) underline.classList.add(isCorrect ? 'correct' : 'wrong');

      var display = displayCorrectText(q.correctText);
      var msg = isCorrect
        ? 'Correct! ' + errorWord + ' → ' + display
        : 'Incorrect. The correct form is: ' + display;
      zone.appendChild(createFeedback(isCorrect, msg));

      if (!isCorrect) {
        var answer = document.createElement('div');
        answer.className = 'iq-correction-answer';
        answer.textContent = display;
        input.parentNode.insertBefore(answer, input.nextSibling);
      }

      answeredKeys[getQKey(si, qi)] = { result: isCorrect ? 'correct' : 'wrong', userAnswer: input.value.trim(), type: 'correction' };
      addScore(isCorrect, si);
    }

    zone._performCheck = performCheck;

    input.oninput = function() {
      if (!iqSessionActive) checkBtn.disabled = !input.value.trim();
    };
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !checkBtn.disabled) {
        e.preventDefault();
        performCheck();
      }
    });
    zone.appendChild(input);

    checkBtn.onclick = function() { performCheck(); };
    zone.appendChild(checkBtn);
  }

  // ── Fill-in UI (inline blank inputs in sentence) ──
  function buildFillinUI(zone, q, si, qi, cardEl) {
    var qtext = cardEl.querySelector('.qtext');
    if (!qtext || !q.correctAnswer || !Array.isArray(q.correctAnswer)) return;

    // Store original HTML for retry restoration (before blank replacement)
    if (!cardEl.dataset.originalQtext) {
      cardEl.dataset.originalQtext = qtext.innerHTML;  // safe: source is lesson HTML, not user input
    }

    // Replace (   ) / （　　） patterns with inline inputs
    var idx = 0;
    var blankRe = /[（(][\s\u3000]+[)）]/g;
    qtext.innerHTML = qtext.innerHTML.replace(blankRe, function() {  // safe: integer index only
      var i = idx++;
      return '<input type="text" class="iq-fillin-input" data-idx="' + i + '" autocomplete="off" spellcheck="false">';
    });

    var inputs = qtext.querySelectorAll('.iq-fillin-input');
    if (inputs.length === 0) return;

    // Auto-size each input based on expected answer length
    inputs.forEach(function(inp, i) {
      var answer = q.correctAnswer[i] || '';
      var charW = Math.max(answer.length, 3);
      inp.style.width = (charW * 12 + 24) + 'px';
    });

    var checkBtn = document.createElement('button');
    checkBtn.className = 'iq-check-btn iq-check-btn--subtle';
    checkBtn.textContent = 'Check';
    checkBtn.disabled = true;
    if (iqSessionActive) checkBtn.style.display = 'none';

    // Enable Check when all blanks have content
    function updateCheckState() {
      if (iqSessionActive) return;
      var allFilled = true;
      inputs.forEach(function(inp) {
        if (!inp.value.trim()) allFilled = false;
      });
      checkBtn.disabled = !allFilled;
    }

    function performCheck() {
      if (zone.classList.contains('locked')) return;
      var allCorrect = true;
      inputs.forEach(function(inp, i) {
        var typed = inp.value.trim().toLowerCase();
        var expected = (q.correctAnswer[i] || '').toLowerCase();
        var isRight = typed === expected;
        inp.classList.add(isRight ? 'correct' : 'wrong');
        inp.disabled = true;
        if (!isRight) allCorrect = false;
      });

      if (window.UISound) UISound.play(allCorrect ? 'correct' : 'wrong');
      zone.classList.add('locked');
      checkBtn.style.display = 'none';

      var display = q.correctAnswer.join(', ');
      var msg = allCorrect
        ? 'Correct! ' + display
        : 'Incorrect. Correct answer: ' + display;
      zone.appendChild(createFeedback(allCorrect, msg));

      answeredKeys[getQKey(si, qi)] = { result: allCorrect ? 'correct' : 'wrong', userAnswer: Array.from(inputs).map(function(inp) { return inp.value.trim(); }), type: 'fillin' };
      addScore(allCorrect, si);
    }

    zone._performCheck = performCheck;

    inputs.forEach(function(inp) {
      inp.addEventListener('input', updateCheckState);
      inp.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (!checkBtn.disabled) performCheck();
        }
      });
    });

    checkBtn.onclick = function() { performCheck(); };
    zone.appendChild(checkBtn);
  }

  // ── Compose UI (free-form English writing with self-evaluation) ──
  function buildComposeUI(zone, q, si, qi) {
    if (!q.correctAnswer) return;

    var textarea = document.createElement('textarea');
    textarea.className = 'iq-compose-input';
    textarea.rows = 2;
    textarea.placeholder = 'Write your English sentence here...';
    zone.appendChild(textarea);

    var showBtn = document.createElement('button');
    showBtn.className = 'iq-check-btn';
    showBtn.textContent = 'Show Answer';
    showBtn.disabled = true;
    if (iqSessionActive) showBtn.style.display = 'none';

    textarea.addEventListener('input', function() {
      if (!iqSessionActive) showBtn.disabled = !textarea.value.trim();
    });

    showBtn.onclick = function() {
      showBtn.style.display = 'none';
      textarea.disabled = true;

      var reveal = document.createElement('div');
      reveal.className = 'iq-compose-reveal';
      reveal.textContent = q.correctAnswer;
      zone.appendChild(reveal);

      var evalDiv = document.createElement('div');
      evalDiv.className = 'iq-self-eval';

      var rightBtn = document.createElement('button');
      rightBtn.className = 'iq-eval-btn right';
      rightBtn.textContent = 'Got it right';
      rightBtn.onclick = function() {
        if (window.UISound) UISound.play('correct');
        zone.classList.add('locked');
        evalDiv.remove();
        zone.appendChild(createFeedback(true, 'Correct!'));
        answeredKeys[getQKey(si, qi)] = { result: 'correct', userAnswer: 'self-correct', type: 'compose' };
        addScore(true, si);
      };

      var wrongBtn = document.createElement('button');
      wrongBtn.className = 'iq-eval-btn wrong';
      wrongBtn.textContent = 'Got it wrong';
      wrongBtn.onclick = function() {
        if (window.UISound) UISound.play('wrong');
        zone.classList.add('locked');
        evalDiv.remove();
        zone.appendChild(createFeedback(false, 'Answer: ' + q.correctAnswer));
        answeredKeys[getQKey(si, qi)] = { result: 'wrong', userAnswer: 'self-wrong', type: 'compose' };
        addScore(false, si);
      };

      evalDiv.appendChild(rightBtn);
      evalDiv.appendChild(wrongBtn);
      zone.appendChild(evalDiv);
    };
    zone.appendChild(showBtn);
  }

  // ── Scramble UI ──
  function buildScrambleUI(zone, q, si, qi) {
    var words = parseScrambleWords(q.scramble);
    if (words.length === 0) return;

    var shuffled = shuffle(words);
    var placed = [];

    var poolLabel = document.createElement('div');
    poolLabel.className = 'iq-scramble-label';
    poolLabel.textContent = 'Available words:';
    zone.appendChild(poolLabel);

    var poolDiv = document.createElement('div');
    poolDiv.className = 'iq-scramble-pool';

    var poolChips = [];
    shuffled.forEach(function(word, idx) {
      var chip = document.createElement('button');
      chip.className = 'iq-chip';
      chip.textContent = word;
      chip.dataset.word = word;
      chip.dataset.idx = idx;
      chip.onclick = function() {
        if (zone.classList.contains('locked') || chip.classList.contains('hidden')) return;
        chip.classList.add('hidden');
        placed.push({ word: word, poolIdx: idx });
        if (window.UISound) UISound.play('click');
        renderAnswerZone();
        if (!iqSessionActive) checkBtn.disabled = placed.length === 0;
      };
      poolDiv.appendChild(chip);
      poolChips.push(chip);
    });
    zone.appendChild(poolDiv);

    var ansLabel = document.createElement('div');
    ansLabel.className = 'iq-scramble-label';
    ansLabel.textContent = 'Your answer:';
    zone.appendChild(ansLabel);

    var frame = parseScrambleFrame(q.scramble);
    var ansDiv = document.createElement('div');
    ansDiv.className = 'iq-answer-zone';

    if (frame.prefix || frame.suffix) {
      var frameDiv = document.createElement('div');
      frameDiv.className = 'iq-scramble-frame';
      if (frame.prefix) {
        var pre = document.createElement('span');
        pre.className = 'iq-scramble-context';
        pre.textContent = frame.prefix;
        frameDiv.appendChild(pre);
      }
      frameDiv.appendChild(ansDiv);
      if (frame.suffix) {
        var suf = document.createElement('span');
        suf.className = 'iq-scramble-context';
        suf.textContent = frame.suffix;
        frameDiv.appendChild(suf);
      }
      zone.appendChild(frameDiv);
    } else {
      zone.appendChild(ansDiv);
    }

    function renderAnswerZone() {
      ansDiv.textContent = '';
      ansDiv.classList.toggle('has-items', placed.length > 0);
      placed.forEach(function(item, i) {
        var chip = document.createElement('button');
        chip.className = 'iq-chip placed';
        chip.textContent = item.word;
        chip.onclick = function() {
          if (zone.classList.contains('locked')) return;
          poolChips[item.poolIdx].classList.remove('hidden');
          placed.splice(i, 1);
          if (window.UISound) UISound.play('click');
          renderAnswerZone();
          if (!iqSessionActive) checkBtn.disabled = placed.length === 0;
        };
        ansDiv.appendChild(chip);
      });
    }

    var checkBtn = document.createElement('button');
    checkBtn.className = 'iq-check-btn';
    checkBtn.textContent = 'Check';
    checkBtn.disabled = true;
    if (iqSessionActive) checkBtn.style.display = 'none';
    checkBtn.onclick = function() {
      var studentAnswer = placed.map(function(p) { return p.word; }).join(' ');
      var isCorrect = studentAnswer.toLowerCase() === q.correctAnswer.toLowerCase();
      if (window.UISound) UISound.play(isCorrect ? 'correct' : 'wrong');
      zone.classList.add('locked');
      checkBtn.style.display = 'none';

      var msg = isCorrect
        ? 'Correct!'
        : 'Incorrect. Answer: ' + q.correctAnswer;
      zone.appendChild(createFeedback(isCorrect, msg));

      answeredKeys[getQKey(si, qi)] = { result: isCorrect ? 'correct' : 'wrong', userAnswer: null, type: 'scramble' };
      addScore(isCorrect, si);
    };
    zone.appendChild(checkBtn);
  }

  // ── Enhance all visible cards ──
  function enhanceVisibleCards() {
    var cards = document.querySelectorAll('.qcard[data-si][data-qi]');
    cards.forEach(function(card) { enhanceCard(card); });
  }

  // ── Re-apply on navigation (MutationObserver for SPA) ──
  function setupObserver() {
    var target = document.getElementById('questionsList');
    if (!target) return;
    new MutationObserver(function() {
      enhanceVisibleCards();
    }).observe(target, { childList: true });
  }

  // ── Restore answered state after re-render ──
  // Now handled by enhanceCard() which builds full UI + applies visual state.
  // This wrapper exists for backward compat with hashchange handler.
  function restoreAnsweredState() {
    enhanceVisibleCards();
  }

  // ── Teacher Reveal integration ──
  function setupTeacherRevealListeners() {
    document.addEventListener('tr:session-start', function() {
      iqSessionActive = true;
      // Hide all Check buttons
      document.querySelectorAll('.iq-check-btn').forEach(function(btn) {
        btn.style.display = 'none';
      });
    });

    document.addEventListener('tr:session-end', function() {
      iqSessionActive = false;
      // Show Check buttons for unanswered, unlocked questions
      document.querySelectorAll('.iq-zone').forEach(function(zone) {
        if (zone.classList.contains('locked')) return;
        var btn = zone.querySelector('.iq-check-btn');
        if (btn) {
          btn.style.display = '';
          // Enable if a selection, correction input, or fillin inputs exist
          var ci = zone.querySelector('.iq-correction-input');
          var fillinInputs = zone.closest('.qcard-question') ? zone.closest('.qcard-question').querySelectorAll('.iq-fillin-input') : [];
          var fillinFilled = fillinInputs.length > 0 && Array.prototype.every.call(fillinInputs, function(inp) { return inp.value.trim(); });
          var composeInput = zone.querySelector('.iq-compose-input');
          if (zone.querySelector('.iq-choice.selected') ||
              zone.querySelector('.iq-error-option.selected') ||
              (ci && ci.value.trim()) ||
              zone.querySelector('.iq-answer-zone.has-items') ||
              fillinFilled ||
              (composeInput && composeInput.value.trim())) {
            btn.disabled = false;
          }
        }
      });
    });

    document.addEventListener('tr:question-revealed', function(e) {
      var si = e.detail.si;
      var qi = e.detail.qi;
      var key = getQKey(si, qi);
      if (answeredKeys[key]) return;

      // Find the card's iq-zone
      var card = document.querySelector('.qcard[data-si="' + si + '"][data-qi="' + qi + '"]');
      if (!card) return;
      var zone = card.querySelector('.iq-zone');
      if (!zone || zone.classList.contains('locked')) return;

      // Check if a selection exists — auto-trigger the Check button
      var errorSelected = zone.querySelector('.iq-error-option.selected');
      var corrInput = zone.querySelector('.iq-correction-input');
      var fillinInputs = card.querySelectorAll('.iq-fillin-input');
      var fillinFilled = fillinInputs.length > 0 && Array.prototype.every.call(fillinInputs, function(inp) { return inp.value.trim(); });
      var composeInput = zone.querySelector('.iq-compose-input');
      var hasSelection = zone.querySelector('.iq-choice.selected') ||
                         (errorSelected && (!corrInput || corrInput.value.trim())) ||
                         (corrInput && corrInput.value.trim() && !errorSelected) ||
                         zone.querySelector('.iq-answer-zone.has-items') ||
                         fillinFilled ||
                         (composeInput && composeInput.value.trim());

      var checkBtn = zone.querySelector('.iq-check-btn');
      if (hasSelection && checkBtn) {
        checkBtn.style.display = '';
        checkBtn.disabled = false;
        checkBtn.click();
      } else if (checkBtn) {
        // No selection yet — show the Check button so student can still answer
        checkBtn.style.display = '';
      }
    });
  }

  // ── Detect if a teacher session is already active ──
  function detectExistingSession() {
    if (document.querySelector('.tr-session-badge') ||
        document.querySelector('.tr-locked')) {
      iqSessionActive = true;
    }
  }

  // ── Wrong Answer Review ──
  function getWrongBySec() {
    var groups = {};
    Object.keys(answeredKeys).forEach(function(key) {
      if (getAnswerResult(key) !== 'wrong') return;
      var parts = key.split('-');
      var si = parseInt(parts[0]);
      var qi = parseInt(parts[1]);
      if (!groups[si]) groups[si] = [];
      groups[si].push(qi);
    });
    return groups;
  }

  function getTotalWrong() {
    return Object.keys(answeredKeys).filter(function(k) {
      return getAnswerResult(k) === 'wrong';
    }).length;
  }

  function toggleReviewMode() {
    reviewMode = !reviewMode;

    if (reviewMode) {
      if (getTotalWrong() === 0) {
        reviewMode = false;
        return;
      }
      applyReviewFilter();
    } else {
      removeReviewFilter();
    }
  }

  function applyReviewFilter() {
    var wrongBySec = getWrongBySec();
    showReviewNav(wrongBySec);
    filterVisibleCards();
  }

  function filterVisibleCards() {
    var cards = document.querySelectorAll('.qcard[data-si][data-qi]');
    cards.forEach(function(card) {
      var key = getQKey(card.dataset.si, card.dataset.qi);
      card.style.display = (reviewMode && getAnswerResult(key) !== 'wrong') ? 'none' : '';
    });
  }

  function showReviewNav(wrongBySec) {
    if (!reviewNavEl) {
      reviewNavEl = document.createElement('div');
      reviewNavEl.className = 'iq-review-nav';
      document.body.appendChild(reviewNavEl);
    }

    reviewNavEl.textContent = '';
    var sectionIndices = Object.keys(wrongBySec).map(Number).sort();

    var label = document.createElement('div');
    label.className = 'iq-review-label';
    label.textContent = 'Wrong: ' + getTotalWrong() + ' questions';
    reviewNavEl.appendChild(label);

    sectionIndices.forEach(function(si) {
      var secTitle = grammarData.sections[si] ? grammarData.sections[si].title : 'S' + (si + 1);
      var btn = document.createElement('button');
      btn.className = 'iq-review-sec-btn';
      btn.textContent = secTitle + ' (' + wrongBySec[si].length + ')';
      btn.onclick = function() {
        if (typeof Router !== 'undefined' && Router.setSection) {
          Router.setSection(si);
        } else if (typeof NavState !== 'undefined') {
          window.location.hash = '#section-' + si;
        }
        setTimeout(filterVisibleCards, 100);
      };
      reviewNavEl.appendChild(btn);
    });

    reviewNavEl.style.display = '';
  }

  function removeReviewFilter() {
    if (reviewNavEl) reviewNavEl.style.display = 'none';
    var cards = document.querySelectorAll('.qcard[data-si][data-qi]');
    cards.forEach(function(card) { card.style.display = ''; });
  }

  // ── Retry Wrong ──
  function startRetryMode() {
    // Collect wrong keys
    var wrongKeys = Object.keys(answeredKeys).filter(function(k) {
      return answeredKeys[k].result === 'wrong';
    });
    if (wrongKeys.length === 0) {
      showToast('No wrong answers to retry!');
      return;
    }

    retryMode = true;
    retryKeys = wrongKeys;
    retryBackup = {};

    // Backup and clear wrong entries
    retryKeys.forEach(function(k) {
      retryBackup[k] = answeredKeys[k];
      delete answeredKeys[k];
    });

    // Adjust score
    score.answered -= retryKeys.length;
    streak = 0;

    // Clean up retry cards for re-enhancement
    retryKeys.forEach(function(k) {
      var parts = k.split('-');
      var si = parts[0], qi = parts[1];
      var card = document.querySelector('.qcard[data-si="' + si + '"][data-qi="' + qi + '"]');
      if (!card) return;

      // Restore fillin original HTML if stored
      if (card.dataset.originalQtext) {
        var qtext = card.querySelector('.qtext');
        if (qtext) qtext.innerHTML = card.dataset.originalQtext;  // safe: restoring lesson HTML
      }

      card.dataset.iqEnhanced = '';
      card.classList.remove('iq-wrong');
      var zone = card.querySelector('.iq-zone');
      if (zone) zone.remove();
    });

    // Re-enhance cleared cards
    enhanceVisibleCards();

    // Hide non-retry cards
    var allCards = document.querySelectorAll('.qcard[data-si][data-qi]');
    allCards.forEach(function(card) {
      var key = card.dataset.si + '-' + card.dataset.qi;
      if (retryKeys.indexOf(key) === -1) {
        card.style.display = 'none';
      } else {
        card.style.display = '';
      }
    });

    // Show retry bar
    showRetryBar(retryKeys.length);

    saveProgress();
    updateProgressPanel();
    closeProgressPanel();
  }

  function showRetryBar(count) {
    if (retryBarEl) retryBarEl.remove();
    retryBarEl = document.createElement('div');
    retryBarEl.className = 'iq-retry-bar';

    var text = document.createElement('span');
    text.textContent = 'Retrying ' + count + ' wrong answer' + (count > 1 ? 's' : '');
    retryBarEl.appendChild(text);

    var exitBtn = document.createElement('button');
    exitBtn.textContent = 'Exit';
    exitBtn.onclick = function() { exitRetryMode(false); };
    retryBarEl.appendChild(exitBtn);

    document.body.appendChild(retryBarEl);
    if (typeof gsap !== 'undefined') {
      gsap.fromTo(retryBarEl, { y: -44 }, { y: 0, duration: 0.3, ease: 'power2.out' });
    }
  }

  function checkRetryComplete() {
    var allDone = retryKeys.every(function(k) { return answeredKeys[k]; });
    if (!allDone) return;
    var allCorrect = retryKeys.every(function(k) { return answeredKeys[k].result === 'correct'; });
    exitRetryMode(allCorrect);
  }

  function exitRetryMode(allCorrect) {
    retryMode = false;

    // Show all cards
    var allCards = document.querySelectorAll('.qcard[data-si][data-qi]');
    allCards.forEach(function(card) { card.style.display = ''; });

    // Remove retry bar
    if (retryBarEl) {
      if (typeof gsap !== 'undefined') {
        gsap.to(retryBarEl, { y: -44, duration: 0.2, onComplete: function() { retryBarEl.remove(); retryBarEl = null; } });
      } else {
        retryBarEl.remove();
        retryBarEl = null;
      }
    }

    // Count results
    var correctCount = retryKeys.filter(function(k) { return answeredKeys[k] && answeredKeys[k].result === 'correct'; }).length;
    if (allCorrect) {
      showToast('All correct! Great job!');
    } else {
      showToast('Retry complete. ' + correctCount + '/' + retryKeys.length + ' correct.');
    }

    retryKeys = [];
    retryBackup = {};
    updateProgressPanel();
  }

  function showToast(message) {
    var toast = document.createElement('div');
    toast.className = 'iq-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    if (typeof gsap !== 'undefined') {
      gsap.fromTo(toast, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.3 });
      gsap.to(toast, { opacity: 0, y: -10, duration: 0.3, delay: 2, onComplete: function() { toast.remove(); } });
    } else {
      setTimeout(function() { toast.remove(); }, 2500);
    }
  }

  // ── Reset with GSAP confirmation ──
  function confirmAndResetProgress() {
    var overlay = document.createElement('div');
    overlay.className = 'iq-confirm-overlay';

    var dialog = document.createElement('div');
    dialog.className = 'iq-confirm-dialog';

    var title = document.createElement('div');
    title.className = 'iq-confirm-title';
    title.textContent = 'Reset Progress';
    dialog.appendChild(title);

    var text = document.createElement('div');
    text.className = 'iq-confirm-text';
    text.textContent = 'All answers, scores, badges, and streaks will be cleared. This cannot be undone.';
    dialog.appendChild(text);

    var actions = document.createElement('div');
    actions.className = 'iq-confirm-actions';

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'iq-confirm-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = function() {
      if (typeof gsap !== 'undefined') {
        gsap.to(overlay, { opacity: 0, duration: 0.15, onComplete: function() { overlay.remove(); } });
      } else {
        overlay.remove();
      }
    };
    actions.appendChild(cancelBtn);

    var okBtn = document.createElement('button');
    okBtn.className = 'iq-confirm-ok';
    okBtn.textContent = 'Reset';
    okBtn.onclick = function() {
      performFullReset();
      if (typeof gsap !== 'undefined') {
        gsap.to(overlay, { opacity: 0, duration: 0.15, onComplete: function() { overlay.remove(); } });
      } else {
        overlay.remove();
      }
    };
    actions.appendChild(okBtn);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    if (typeof gsap !== 'undefined') {
      gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.2 });
      gsap.fromTo(dialog, { scale: 0.9, y: 20 }, { scale: 1, y: 0, duration: 0.3, ease: 'back.out(1.7)' });
    }
  }

  function performFullReset() {
    streak = 0;
    bestStreak = 0;
    badges = [];
    sectionScores = {};
    score.correct = 0;
    score.answered = 0;
    answeredKeys = {};
    retryMode = false;
    retryKeys = [];
    retryBackup = {};
    if (retryBarEl) { retryBarEl.remove(); retryBarEl = null; }
    saveProgress();
    updateProgressPanel();
    updateStreakDisplay();
    closeProgressPanel();
    // Re-render current cards without answered state
    var cards = document.querySelectorAll('.qcard[data-si][data-qi]');
    cards.forEach(function(card) {
      // Restore fillin original HTML if stored
      if (card.dataset.originalQtext) {
        var qtext = card.querySelector('.qtext');
        if (qtext) qtext.innerHTML = card.dataset.originalQtext;  // safe: restoring lesson HTML
      }
      card.dataset.iqEnhanced = '';
      card.classList.remove('iq-wrong');
      card.style.display = '';
      var zone = card.querySelector('.iq-zone');
      if (zone) zone.remove();
    });
    enhanceVisibleCards();
  }

  // ── Gamification UI ──
  function updateStreakDisplay() {
    if (!streakEl) return;
    if (streak === 0) {
      streakEl.style.display = 'none';
      streakEl.textContent = '';
      return;
    }
    streakEl.style.display = '';
    streakEl.textContent = '\uD83D\uDD25 ' + streak;

    // Milestone pulse at 3, 5, 10
    if (streak === 3 || streak === 5 || streak === 10) {
      streakEl.classList.remove('iq-streak-pulse');
      void streakEl.offsetWidth;  // reflow to restart animation
      streakEl.classList.add('iq-streak-pulse');
    }
  }

  function getSectionQuestionCount(si) {
    var sec = grammarData.sections[si];
    if (!sec) return 0;
    var count = 0;
    sec.questions.forEach(function(q) {
      if (q.type && (q.correctAnswer || q.correctText)) count++;
    });
    return count;
  }

  function checkAchievements(si) {
    var newBadges = [];

    if (score.correct >= 1 && badges.indexOf('first-blood') === -1)
      newBadges.push('first-blood');
    if (streak >= 3 && badges.indexOf('streak-3') === -1)
      newBadges.push('streak-3');
    if (streak >= 5 && badges.indexOf('streak-5') === -1)
      newBadges.push('streak-5');
    if (streak >= 10 && badges.indexOf('streak-10') === -1)
      newBadges.push('streak-10');

    // Perfect section: all questions in section answered correctly
    if (si !== undefined && sectionScores[si]) {
      var sectionTotal = getSectionQuestionCount(si);
      if (sectionTotal > 0 && sectionScores[si].correct === sectionTotal
          && sectionScores[si].total === sectionTotal
          && badges.indexOf('perfect-section') === -1) {
        newBadges.push('perfect-section');
      }
    }

    // Lesson complete: all questions answered
    if (score.answered === score.total && badges.indexOf('lesson-complete') === -1)
      newBadges.push('lesson-complete');

    // Lesson master: all correct
    if (score.correct === score.total && score.answered === score.total
        && badges.indexOf('lesson-master') === -1)
      newBadges.push('lesson-master');

    newBadges.forEach(function(id) {
      badges.push(id);
      showBadgeToast(id);
    });
  }

  function findBadge(id) {
    for (var i = 0; i < BADGES.length; i++) {
      if (BADGES[i].id === id) return BADGES[i];
    }
    return null;
  }

  function showBadgeToast(id) {
    var badge = findBadge(id);
    if (!badge) return;

    var toast = document.createElement('div');
    toast.className = 'iq-toast';
    toast.innerHTML = '<span class="iq-toast-icon">' + badge.icon + '</span>' +
      '<span class="iq-toast-text"><strong>' + badge.name + '</strong><br>' + badge.desc + '</span>';
    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        toast.classList.add('iq-toast-show');
      });
    });

    setTimeout(function() {
      toast.classList.remove('iq-toast-show');
      toast.classList.add('iq-toast-hide');
      setTimeout(function() { toast.remove(); }, 400);
    }, 3000);
  }

  function toggleBadgePanel() {
    if (badgePanelEl) {
      badgePanelEl.remove();
      badgePanelEl = null;
      return;
    }

    badgePanelEl = document.createElement('div');
    badgePanelEl.className = 'iq-badge-panel';

    var header = document.createElement('div');
    header.className = 'iq-badge-header';
    header.innerHTML = '<span>\uD83C\uDFC6 Achievements</span>' +
      '<span class="iq-badge-count">' + badges.length + ' / ' + BADGES.length + '</span>';
    badgePanelEl.appendChild(header);

    var grid = document.createElement('div');
    grid.className = 'iq-badge-grid';

    BADGES.forEach(function(badge) {
      var earned = badges.indexOf(badge.id) !== -1;
      var card = document.createElement('div');
      card.className = 'iq-badge-card' + (earned ? ' iq-badge-earned' : '');

      var icon = document.createElement('div');
      icon.className = 'iq-badge-icon';
      icon.textContent = earned ? badge.icon : '\uD83D\uDD12';

      var name = document.createElement('div');
      name.className = 'iq-badge-name';
      name.textContent = earned ? badge.name : '???';

      var desc = document.createElement('div');
      desc.className = 'iq-badge-desc';
      desc.textContent = earned ? badge.desc : '';

      card.appendChild(icon);
      card.appendChild(name);
      card.appendChild(desc);
      grid.appendChild(card);
    });

    badgePanelEl.appendChild(grid);

    // Reset button
    var resetBtn = document.createElement('button');
    resetBtn.className = 'iq-badge-reset';
    resetBtn.textContent = 'Reset Progress';
    resetBtn.onclick = function() {
      streak = 0;
      bestStreak = 0;
      badges = [];
      sectionScores = {};
      score.correct = 0;
      score.answered = 0;
      answeredKeys = {};
      saveProgress();
      toggleBadgePanel();
      updateProgressPanel();
      updateStreakDisplay();
    };
    badgePanelEl.appendChild(resetBtn);

    // Close button
    var closeBtn = document.createElement('button');
    closeBtn.className = 'iq-badge-close';
    closeBtn.textContent = '\u2715';
    closeBtn.onclick = function() { toggleBadgePanel(); };
    badgePanelEl.appendChild(closeBtn);

    document.body.appendChild(badgePanelEl);
  }

  // ── Init ──
  function init() {
    loadProgress();

    // Reconstruct score from loaded answeredKeys
    Object.keys(answeredKeys).forEach(function(key) {
      score.answered++;
      if (getAnswerResult(key) === 'correct') score.correct++;
    });

    detectExistingSession();
    createProgressPanel();
    setupTeacherRevealListeners();
    enhanceVisibleCards();
    setupObserver();

    window.addEventListener('hashchange', function() {
      setTimeout(function() {
        enhanceVisibleCards();
        if (reviewMode) filterVisibleCards();
      }, 50);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 100);
  }
})();
