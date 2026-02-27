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
  var retrySummaryTimer = null;

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
    try {
      localStorage.setItem(key, JSON.stringify({
        bestStreak: bestStreak,
        badges: badges,
        sectionScores: sectionScores,
        answeredKeys: answeredKeys,
        lastAccess: Date.now()
      }));
    } catch (e) { /* private browsing or quota exceeded */ }
  }

  function pruneOldProgress() {
    var cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000; // 60 days
    try {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k && k.indexOf('iq-progress-') === 0) {
          var data = JSON.parse(localStorage.getItem(k) || '{}');
          if (data.lastAccess && data.lastAccess < cutoff) {
            localStorage.removeItem(k);
          }
        }
      }
    } catch (e) { /* ignore */ }
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
  var tabHideTimer = null;
  var tabIsHidden = false;
  var edgeTriggerEl = null;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var CATEGORY_NAMES = { basic: '\u57FA\u672C\u554F\u984C', comm: 'FOR COMMUNICATION', advanced: '\u767A\u5C55\u554F\u984C' };

  function createProgressPanel() {
    // ── Tab handle (always visible, bottom-left) ──
    progressTabEl = document.createElement('div');
    progressTabEl.className = 'iq-progress-tab';
    progressTabEl.setAttribute('tabindex', '0');
    progressTabEl.setAttribute('role', 'button');
    progressTabEl.setAttribute('aria-label', 'Open progress panel');
    progressTabEl.onclick = function() { toggleProgressPanel(); };
    progressTabEl.onkeydown = function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleProgressPanel(); } };
    progressTabEl.title = 'Click to open progress panel';

    tabScoreEl = document.createElement('span');
    tabScoreEl.className = 'iq-progress-tab-score';
    tabScoreEl.setAttribute('aria-live', 'polite');
    tabScoreEl.setAttribute('aria-atomic', 'true');

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

    // ── Nav bar toggle (visible in top nav) ──
    var topNavRight = document.querySelector('.top-nav-right');
    if (topNavRight) {
      var navToggle = document.createElement('button');
      navToggle.className = 'iq-nav-toggle';
      navToggle.title = 'Progress Panel';
      // SVG clipboard icon (more reliable than emoji across platforms)
      var svgNS = 'http://www.w3.org/2000/svg';
      var svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('width', '16');
      svg.setAttribute('height', '16');
      svg.setAttribute('viewBox', '0 0 16 16');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.5');
      var rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', '3'); rect.setAttribute('y', '2');
      rect.setAttribute('width', '10'); rect.setAttribute('height', '12');
      rect.setAttribute('rx', '1.5');
      var l1 = document.createElementNS(svgNS, 'line');
      l1.setAttribute('x1', '5.5'); l1.setAttribute('y1', '5');
      l1.setAttribute('x2', '10.5'); l1.setAttribute('y2', '5');
      var l2 = document.createElementNS(svgNS, 'line');
      l2.setAttribute('x1', '5.5'); l2.setAttribute('y1', '8');
      l2.setAttribute('x2', '10.5'); l2.setAttribute('y2', '8');
      var l3 = document.createElementNS(svgNS, 'line');
      l3.setAttribute('x1', '5.5'); l3.setAttribute('y1', '11');
      l3.setAttribute('x2', '8.5'); l3.setAttribute('y2', '11');
      svg.appendChild(rect);
      svg.appendChild(l1);
      svg.appendChild(l2);
      svg.appendChild(l3);
      navToggle.appendChild(svg);
      navToggle.onclick = function() { toggleProgressPanel(); };
      topNavRight.insertBefore(navToggle, topNavRight.firstChild);
    }

    // ── Tab auto-hide ──
    progressTabEl.addEventListener('mouseenter', function() {
      clearTimeout(tabHideTimer);
    });
    progressTabEl.addEventListener('mouseleave', function() {
      resetTabHideTimer();
    });
    var tabProximityRafId = 0;
    document.addEventListener('mousemove', function(e) {
      if (progressPanelOpen || tabProximityRafId) return;
      var cx = e.clientX, cy = e.clientY;
      tabProximityRafId = requestAnimationFrame(function() {
        tabProximityRafId = 0;
        var nearTab = cy > window.innerHeight - 100 && cx < 150;
        if (nearTab && tabIsHidden) {
          showTabWithGsap();
          clearTimeout(tabHideTimer);
        }
      });
    }, { passive: true });
    resetTabHideTimer();

    // ── Edge trigger (left-edge hover zone) ──
    edgeTriggerEl = document.createElement('div');
    edgeTriggerEl.className = 'iq-edge-trigger';
    var edgeHintEl = document.createElement('span');
    edgeHintEl.className = 'iq-edge-hint';
    edgeHintEl.textContent = 'Open panel';
    edgeTriggerEl.appendChild(edgeHintEl);
    document.body.appendChild(edgeTriggerEl);

    edgeTriggerEl.addEventListener('mouseenter', function() {
      if (progressPanelOpen) return;
      if (tabIsHidden) showTabWithGsap();
      clearTimeout(tabHideTimer);
    });
    edgeTriggerEl.addEventListener('click', function() {
      if (!progressPanelOpen) openProgressPanel();
    });
    edgeTriggerEl.addEventListener('mouseleave', function() {
      if (!progressPanelOpen) resetTabHideTimer();
    });

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
    clearTimeout(tabHideTimer);
    if (tabIsHidden) showTabWithGsap();
    if (edgeTriggerEl) edgeTriggerEl.style.display = 'none';
    updateProgressPanel();
    if (typeof gsap !== 'undefined') {
      gsap.killTweensOf(progressPanelEl);
      gsap.to(progressPanelEl, { x: 0, duration: 0.35, ease: 'power2.out' });
      if (progressBackdropEl) {
        gsap.killTweensOf(progressBackdropEl);
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
    resetTabHideTimer();
    if (edgeTriggerEl) edgeTriggerEl.style.display = '';
    if (typeof gsap !== 'undefined') {
      gsap.killTweensOf(progressPanelEl);
      gsap.to(progressPanelEl, { x: -320, duration: 0.3, ease: 'power2.inOut' });
      if (progressBackdropEl) {
        gsap.killTweensOf(progressBackdropEl);
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
    if (tabIsHidden) showTabWithGsap();
    resetTabHideTimer();
    var color = isCorrect ? 'rgba(22, 163, 74, 0.4)' : 'rgba(220, 38, 38, 0.4)';
    gsap.killTweensOf(progressTabEl);
    gsap.fromTo(progressTabEl,
      { boxShadow: '0 0 0 0 ' + color },
      { boxShadow: '0 0 12px 4px ' + color, duration: 0.3, yoyo: true, repeat: 1, ease: 'power2.inOut' }
    );
  }

  function hideTabWithGsap() {
    if (!progressTabEl || tabIsHidden || progressPanelOpen) return;
    tabIsHidden = true;
    if (typeof gsap !== 'undefined') {
      gsap.killTweensOf(progressTabEl);
      gsap.to(progressTabEl, {
        opacity: 0, x: -20,
        duration: reducedMotion ? 0.01 : 0.3,
        ease: 'power2.inOut',
        onComplete: function() { progressTabEl.style.pointerEvents = 'none'; }
      });
    }
  }

  function showTabWithGsap() {
    if (!progressTabEl || !tabIsHidden) return;
    tabIsHidden = false;
    progressTabEl.style.pointerEvents = '';
    if (typeof gsap !== 'undefined') {
      gsap.killTweensOf(progressTabEl);
      gsap.to(progressTabEl, {
        opacity: 1, x: 0,
        duration: reducedMotion ? 0.01 : 0.25,
        ease: 'power2.out'
      });
    }
  }

  function resetTabHideTimer() {
    clearTimeout(tabHideTimer);
    if (progressPanelOpen) return;
    tabHideTimer = setTimeout(hideTabWithGsap, 3000);
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
    if (retryMode) checkRetryComplete();
  }

  function updateSectionScore(si, isCorrect) {
    if (!sectionScores[si]) sectionScores[si] = { correct: 0, total: 0 };
    sectionScores[si].total++;
    if (isCorrect) sectionScores[si].correct++;
  }

  // ── Helpers ──
  function getQKey(si, qi) { return si + '-' + qi; }

  function recordAnswer(si, qi, isCorrect, userAnswer, type) {
    if (window.UISound) UISound.play(isCorrect ? 'correct' : 'wrong');
    answeredKeys[getQKey(si, qi)] = { result: isCorrect ? 'correct' : 'wrong', userAnswer: userAnswer, type: type };
    addScore(isCorrect, si);

    // Auto-expand vocab/hint/answer toggles after check
    if (!iqSessionActive) autoExpandToggles(si, qi);

    // Dispatch wrong-answer event for spaced repetition
    if (!isCorrect) {
      var q = getQuestionData(si, qi);
      var examId = (document.body && document.body.dataset.examId) || 'default';
      var correctAnswer = q ? (q.correctAnswer || (q.correctText ? displayCorrectText(q.correctText) : '')) : '';
      document.dispatchEvent(new CustomEvent('iq:wrong-answer', {
        detail: {
          examId: examId,
          si: si,
          qi: qi,
          questionText: q ? (q.text || '').substring(0, 100) : '',
          wrongAnswer: typeof userAnswer === 'string' ? userAnswer : JSON.stringify(userAnswer),
          correctAnswer: Array.isArray(correctAnswer) ? correctAnswer.join(', ') : correctAnswer,
          choices: q ? (q.choices || '') : '',
          type: type
        }
      }));
    }
  }

  function autoExpandToggles(si, qi) {
    var card = document.querySelector('.qcard[data-si="' + si + '"][data-qi="' + qi + '"]');
    if (!card) return;

    var blocks = [];
    ['vocab', 'hint', 'answer'].forEach(function(type) {
      var block = card.querySelector('.collapsible[data-type="' + type + '"]');
      var btn = card.querySelector('.toggle-btn.' + type);
      if (!block || !btn || block.classList.contains('open')) return;
      btn.setAttribute('aria-expanded', 'true');
      block.classList.add('open');
      blocks.push(block);
      if (type === 'answer' && typeof window.fetchAnswerForElement === 'function') {
        window.fetchAnswerForElement(card);
      }
    });

    if (blocks.length === 0) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (typeof gsap !== 'undefined') {
      blocks.forEach(function(b) { gsap.killTweensOf(b); });
      gsap.fromTo(blocks,
        { opacity: 0, y: -20 },
        { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.12 }
      );
      blocks.forEach(function(block, i) {
        var items = block.querySelectorAll('.vocab-item, .hint-item, .ans-box > *');
        if (items.length > 0) {
          gsap.killTweensOf(items);
          gsap.from(items, { opacity: 0, x: -8, stagger: 0.04, duration: 0.5, ease: 'power2.out', delay: 0.2 + i * 0.12 });
        }
      });
    }

    // Scroll immediately — .open class already set, layout is final
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (typeof updateProgress === 'function') updateProgress();
  }

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
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.textContent = message;
    if (typeof gsap !== 'undefined' && !reducedMotion) {
      gsap.fromTo(el, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' });
    }
    return el;
  }

  // ── Check Popup (appears above the interacted element) ──
  function dismissPopup(zone) {
    var existing = zone._popup;
    if (!existing) return;
    zone._popup = null;
    if (typeof gsap !== 'undefined') {
      gsap.to(existing, { scale: 0, opacity: 0, duration: 0.15, ease: 'power2.in', onComplete: function() { existing.remove(); } });
    } else {
      existing.remove();
    }
  }

  function showCheckPopup(anchorEl, zone, onCheck) {
    if (iqSessionActive) return null;
    dismissPopup(zone);
    if (window.UISound) UISound.play('button');

    var popup = document.createElement('div');
    popup.className = 'iq-check-popup';

    var checkBtn = document.createElement('button');
    checkBtn.className = 'iq-popup-check-btn';
    checkBtn.textContent = 'Check';
    checkBtn.onclick = function(e) {
      e.stopPropagation();
      var result = onCheck();
      if (result) {
        transformToResult(popup, result.isCorrect, result.message);
      }
    };
    popup.appendChild(checkBtn);

    // Position popup above or below anchor (smart flip)
    zone.style.position = 'relative';
    zone.appendChild(popup);

    var zoneRect = zone.getBoundingClientRect();
    var anchorRect = anchorEl.getBoundingClientRect();
    var anchorCenterX = anchorRect.left + anchorRect.width / 2 - zoneRect.left;
    var spaceAbove = anchorRect.top - zoneRect.top;

    popup.style.position = 'absolute';
    popup.style.left = anchorCenterX + 'px';

    if (spaceAbove < 60) {
      popup.style.top = (anchorRect.bottom - zoneRect.top) + 'px';
      popup.style.transform = 'translate(-50%, 0) translateY(10px)';
      popup.classList.add('below');
    } else {
      popup.style.top = (anchorRect.top - zoneRect.top) + 'px';
      popup.style.transform = 'translate(-50%, -100%) translateY(-10px)';
    }

    zone._popup = popup;

    // GSAP entrance
    if (typeof gsap !== 'undefined') {
      gsap.fromTo(popup,
        { scale: 0, opacity: 0, transformOrigin: popup.classList.contains('below') ? 'top center' : 'bottom center' },
        { scale: 1, opacity: 1, duration: 0.25, ease: 'back.out(1.7)' }
      );
    }

    return popup;
  }

  function transformToResult(popup, isCorrect, message) {
    if (!popup) return;
    popup.classList.add('result', isCorrect ? 'correct' : 'incorrect');
    popup.setAttribute('role', 'status');
    popup.setAttribute('aria-live', 'assertive');

    // Replace content
    popup.textContent = '';
    var icon = document.createElement('span');
    icon.className = 'iq-popup-icon';
    icon.textContent = isCorrect ? '\u2713' : '\u2717';
    popup.appendChild(icon);

    var msg = document.createElement('span');
    msg.className = 'iq-popup-msg';
    msg.textContent = message;
    popup.appendChild(msg);

    // GSAP morph animation
    if (typeof gsap !== 'undefined') {
      gsap.fromTo(popup,
        { scale: 0.9 },
        { scale: 1, duration: 0.2, ease: 'back.out(1.4)' }
      );
    }
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

  function applyChoiceFeedback(zone, correctValue, userAnswer, wasCorrect, valueFn) {
    zone.querySelectorAll('.iq-choice').forEach(function(b) {
      var v = valueFn(b);
      if (v === correctValue) {
        b.classList.add('correct');
      } else if (!wasCorrect && v === userAnswer) {
        b.classList.add('selected', 'wrong');
      } else {
        b.classList.add('dimmed');
      }
    });
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
        applyChoiceFeedback(zone, q.correctAnswer, userAnswer, wasCorrect, function(b) { return b.textContent; });
        break;
      }

      case 'choice': {
        applyChoiceFeedback(zone, q.correctAnswer, userAnswer, wasCorrect, function(b) { return b.dataset.letter; });
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
      if (!selected || zone.classList.contains('locked')) return null;
      var isCorrect = selected === q.correctAnswer;
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
      recordAnswer(si, qi, isCorrect, selected, 'pair');
      return { isCorrect: isCorrect, message: msg };
    }

    zone._performCheck = performCheck;

    options.forEach(function(opt) {
      var btn = document.createElement('button');
      btn.className = 'iq-choice';
      btn.textContent = opt;
      btn.setAttribute('aria-pressed', 'false');
      btn.onclick = function() {
        if (zone.classList.contains('locked')) return;
        choicesDiv.querySelectorAll('.iq-choice').forEach(function(b) {
          b.classList.remove('selected');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('selected');
        btn.setAttribute('aria-pressed', 'true');
        selected = opt;
        if (window.UISound) UISound.play('select');
        if (iqSessionActive) {
          document.dispatchEvent(new CustomEvent('iq:answer-selected', {
            detail: { si: si, qi: qi, answer: opt, type: 'pair' }
          }));
          return;
        }
        showCheckPopup(btn, zone, performCheck);
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
      if (!selectedLetter || zone.classList.contains('locked')) return null;
      var isCorrect = selectedLetter === q.correctAnswer;
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
      recordAnswer(si, qi, isCorrect, selectedLetter, 'choice');
      return { isCorrect: isCorrect, message: msg };
    }

    zone._performCheck = performCheck;

    items.forEach(function(item) {
      var btn = document.createElement('button');
      btn.className = 'iq-choice';
      btn.textContent = item.letter + '. ' + item.text;
      btn.dataset.letter = item.letter;
      btn.setAttribute('aria-pressed', 'false');
      btn.onclick = function() {
        if (zone.classList.contains('locked')) return;
        choicesDiv.querySelectorAll('.iq-choice').forEach(function(b) {
          b.classList.remove('selected');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('selected');
        btn.setAttribute('aria-pressed', 'true');
        selectedLetter = item.letter;
        if (window.UISound) UISound.play('select');
        if (iqSessionActive) {
          document.dispatchEvent(new CustomEvent('iq:answer-selected', {
            detail: { si: si, qi: qi, answer: item.letter, type: 'choice' }
          }));
          return;
        }
        showCheckPopup(btn, zone, performCheck);
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
      if (!selectedLabel || zone.classList.contains('locked')) return null;
      var selectionCorrect = selectedLabel === q.correctAnswer;
      var textCorrect = true;

      if (hasTextReq && correctionInput) {
        var typed = correctionInput.value.trim();
        textCorrect = matchesCorrectText(typed, q.correctText);
        correctionInput.disabled = true;
      }

      var isCorrect = selectionCorrect && textCorrect;
      zone.classList.add('locked');

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

      if (hasTextReq && !textCorrect) {
        var answer = document.createElement('div');
        answer.className = 'iq-correction-answer';
        answer.textContent = displayCorrectText(q.correctText);
        correctionInput.parentNode.insertBefore(answer, correctionInput.nextSibling);
      }

      recordAnswer(si, qi, isCorrect, { label: selectedLabel, correctionText: (correctionInput ? correctionInput.value.trim() : null) }, 'error');
      return { isCorrect: isCorrect, message: msg };
    }

    zone._performCheck = performCheck;

    function tryShowPopup(anchorEl) {
      if (iqSessionActive) return;
      if (hasTextReq) {
        // Need both selection AND text filled
        if (selectedLabel && correctionInput && correctionInput.value.trim()) {
          showCheckPopup(correctionInput, zone, performCheck);
        }
      } else {
        showCheckPopup(anchorEl, zone, performCheck);
      }
    }

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
        if (window.UISound) UISound.play('select');
        if (iqSessionActive) {
          document.dispatchEvent(new CustomEvent('iq:answer-selected', {
            detail: { si: si, qi: qi, answer: label, type: 'error' }
          }));
          return;
        }
        tryShowPopup(u);
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
        if (iqSessionActive && selectedLabel && correctionInput.value.trim()) {
          document.dispatchEvent(new CustomEvent('iq:answer-selected', {
            detail: { si: si, qi: qi, answer: selectedLabel + ': ' + correctionInput.value.trim(), type: 'correction' }
          }));
        } else if (!iqSessionActive && selectedLabel && correctionInput.value.trim()) {
          tryShowPopup(correctionInput);
        }
      };
      correctionInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && selectedLabel && correctionInput.value.trim()) {
          e.preventDefault();
          // Trigger check directly via popup or perform
          if (zone._popup) {
            var result = performCheck();
            if (result) transformToResult(zone._popup, result.isCorrect, result.message);
          } else {
            tryShowPopup(correctionInput);
          }
        }
      });
      zone.appendChild(correctionInput);
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

    function performCheck() {
      var typed = input.value.trim();
      if (!typed || zone.classList.contains('locked')) return;
      var isCorrect = matchesCorrectText(typed, q.correctText);

      input.disabled = true;
      zone.classList.add('locked');

      if (underline) underline.classList.add(isCorrect ? 'correct' : 'wrong');

      var display = displayCorrectText(q.correctText);
      var msg = isCorrect
        ? 'Correct! ' + errorWord + ' → ' + display
        : 'Incorrect. The correct form is: ' + display;

      if (!isCorrect) {
        var answer = document.createElement('div');
        answer.className = 'iq-correction-answer';
        answer.textContent = display;
        input.parentNode.insertBefore(answer, input.nextSibling);
      }

      recordAnswer(si, qi, isCorrect, input.value.trim(), 'correction');
      return { isCorrect: isCorrect, message: msg };
    }

    zone._performCheck = performCheck;

    input.oninput = function() {
      if (iqSessionActive && input.value.trim()) {
        document.dispatchEvent(new CustomEvent('iq:answer-selected', {
          detail: { si: si, qi: qi, answer: input.value.trim(), type: 'fillin' }
        }));
      } else if (!iqSessionActive && input.value.trim()) {
        showCheckPopup(input, zone, performCheck);
      }
    };
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && input.value.trim()) {
        e.preventDefault();
        if (zone._popup) {
          var result = performCheck();
          if (result) transformToResult(zone._popup, result.isCorrect, result.message);
        } else if (!iqSessionActive) {
          showCheckPopup(input, zone, performCheck);
        }
      }
    });
    zone.appendChild(input);
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

    function allBlanksFilled() {
      var filled = true;
      inputs.forEach(function(inp, i) {
        var expected = (q.correctAnswer[i] || '').toLowerCase();
        var isXAnswer = expected === '×' || expected === 'x';
        if (!inp.value.trim() && !isXAnswer) filled = false;
      });
      return filled;
    }

    function tryShowFillinPopup() {
      if (!allBlanksFilled()) return;
      if (iqSessionActive) {
        document.dispatchEvent(new CustomEvent('iq:answer-selected', {
          detail: { si: si, qi: qi, answer: Array.from(inputs).map(function(inp, i) {
            var val = inp.value.trim();
            var expected = (q.correctAnswer[i] || '').toLowerCase();
            if (!val && (expected === '×' || expected === 'x')) val = '×';
            return val;
          }).join(', '), type: 'fillin' }
        }));
        return;
      }
      // Show popup above the last filled input
      var lastInput = inputs[inputs.length - 1];
      showCheckPopup(lastInput, zone, performCheck);
    }

    function performCheck() {
      if (zone.classList.contains('locked')) return;
      var allCorrect = true;
      inputs.forEach(function(inp, i) {
        var typed = inp.value.trim().toLowerCase();
        var expected = (q.correctAnswer[i] || '').toLowerCase();
        var isRight = (expected === '×' || expected === 'x')
          ? (typed === '' || typed === 'x' || typed === '×')
          : typed === expected;
        inp.classList.add(isRight ? 'correct' : 'wrong');
        inp.disabled = true;
        if (!isRight) allCorrect = false;
      });

      zone.classList.add('locked');

      var display = q.correctAnswer.join(', ');
      var msg = allCorrect
        ? 'Correct! ' + display
        : 'Incorrect. Correct answer: ' + display;

      recordAnswer(si, qi, allCorrect, Array.from(inputs).map(function(inp) { return inp.value.trim(); }), 'fillin');
      return { isCorrect: allCorrect, message: msg };
    }

    zone._performCheck = performCheck;

    inputs.forEach(function(inp) {
      inp.addEventListener('input', function() { tryShowFillinPopup(); });
      inp.addEventListener('focus', function() { tryShowFillinPopup(); });
      inp.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (allBlanksFilled()) {
            if (zone._popup) {
              var result = performCheck();
              if (result) transformToResult(zone._popup, result.isCorrect, result.message);
            } else if (!iqSessionActive) {
              tryShowFillinPopup();
            }
          }
        }
      });
    });
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
      if (iqSessionActive && textarea.value.trim()) {
        document.dispatchEvent(new CustomEvent('iq:answer-selected', {
          detail: { si: si, qi: qi, answer: textarea.value.trim(), type: 'compose' }
        }));
      } else if (!iqSessionActive) {
        showBtn.disabled = !textarea.value.trim();
      }
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
        zone.classList.add('locked');
        evalDiv.remove();
        zone.appendChild(createFeedback(true, 'Correct!'));
        recordAnswer(si, qi, true, 'self-correct', 'compose');
      };

      var wrongBtn = document.createElement('button');
      wrongBtn.className = 'iq-eval-btn wrong';
      wrongBtn.textContent = 'Got it wrong';
      wrongBtn.onclick = function() {
        zone.classList.add('locked');
        evalDiv.remove();
        zone.appendChild(createFeedback(false, 'Answer: ' + q.correctAnswer));
        recordAnswer(si, qi, false, 'self-wrong', 'compose');
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
        if (iqSessionActive && placed.length > 0) {
          document.dispatchEvent(new CustomEvent('iq:answer-selected', {
            detail: { si: si, qi: qi, answer: placed.map(function(p) { return p.word; }).join(' '), type: 'scramble' }
          }));
        }
        if (!iqSessionActive && placed.length === shuffled.length) {
          showCheckPopup(ansDiv, zone, performCheck);
        } else {
          dismissPopup(zone);
        }
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
          if (!iqSessionActive && placed.length > 0) {
            showCheckPopup(ansDiv, zone, performCheck);
          } else {
            dismissPopup(zone);
          }
        };
        ansDiv.appendChild(chip);
      });
    }

    function performCheck() {
      if (zone.classList.contains('locked')) return;
      var studentAnswer = placed.map(function(p) { return p.word; }).join(' ');
      var isCorrect = studentAnswer.toLowerCase() === q.correctAnswer.toLowerCase();
      zone.classList.add('locked');

      var msg = isCorrect
        ? 'Correct!'
        : 'Incorrect. Answer: ' + q.correctAnswer;

      recordAnswer(si, qi, isCorrect, null, 'scramble');
      return { isCorrect: isCorrect, message: msg };
    }

    zone._performCheck = performCheck;
  }

  // ── Enhance all visible cards ──
  function enhanceVisibleCards() {
    var cards = document.querySelectorAll('.qcard[data-si][data-qi]');
    cards.forEach(function(card) { enhanceCard(card); });
  }

  // ── Re-apply on navigation (MutationObserver for SPA) ──
  var iqObserver = null;
  function setupObserver() {
    if (iqObserver) { iqObserver.disconnect(); iqObserver = null; }
    var target = document.getElementById('questionsList');
    if (!target) return;
    iqObserver = new MutationObserver(function() {
      try {
        enhanceVisibleCards();
      } catch (e) {
        console.error('[interactive-quiz] observer error:', e);
      }
    });
    iqObserver.observe(target, { childList: true });
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
      // Dismiss any open popups and hide remaining Check buttons (compose)
      document.querySelectorAll('.iq-zone').forEach(function(zone) {
        dismissPopup(zone);
      });
      document.querySelectorAll('.iq-check-btn').forEach(function(btn) {
        btn.style.display = 'none';
      });
    });

    document.addEventListener('tr:session-end', function() {
      iqSessionActive = false;
      // Re-enable compose Check buttons for unanswered questions
      document.querySelectorAll('.iq-zone').forEach(function(zone) {
        if (zone.classList.contains('locked')) return;
        var btn = zone.querySelector('.iq-check-btn');
        if (btn) {
          btn.style.display = '';
          var composeInput = zone.querySelector('.iq-compose-input');
          if (composeInput && composeInput.value.trim()) {
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

      var card = document.querySelector('.qcard[data-si="' + si + '"][data-qi="' + qi + '"]');
      if (!card) return;
      var zone = card.querySelector('.iq-zone');
      if (!zone || zone.classList.contains('locked')) return;

      // Check if a selection/input exists — auto-trigger via _performCheck
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

      if (hasSelection && zone._performCheck) {
        var result = zone._performCheck();
        // For revealed questions, show inline feedback (no popup)
        if (result) {
          zone.appendChild(createFeedback(result.isCorrect, result.message));
        }
      } else if (hasSelection) {
        // Fallback for compose (has check button, not _performCheck)
        var checkBtn = zone.querySelector('.iq-check-btn');
        if (checkBtn) {
          checkBtn.style.display = '';
          checkBtn.disabled = false;
          checkBtn.click();
        }
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

    if (focusMode) { rebuildFocusCards(); focusIndex = 0; updateFocusIndicator(); }
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
      if (typeof gsap !== 'undefined' && !reducedMotion) {
        gsap.fromTo(reviewNavEl, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' });
      }
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

    // Close all open toggles — kill tweens first to prevent stale opacity
    document.querySelectorAll('.qcard .collapsible.open').forEach(function(block) {
      if (typeof gsap !== 'undefined') gsap.killTweensOf(block);
      block.classList.remove('open');
      if (typeof gsap !== 'undefined') gsap.set(block, { clearProps: 'all' });
      block.style.opacity = '';
    });

    // Backup and clear wrong entries, adjust sectionScores
    retryKeys.forEach(function(k) {
      retryBackup[k] = answeredKeys[k];
      // Decrement sectionScores to prevent double-counting on re-answer
      var si = parseInt(k.split('-')[0]);
      if (sectionScores[si]) {
        sectionScores[si].total = Math.max(0, sectionScores[si].total - 1);
        if (answeredKeys[k] && answeredKeys[k].result === 'correct') {
          sectionScores[si].correct = Math.max(0, sectionScores[si].correct - 1);
        }
      }
      delete answeredKeys[k];
    });

    // Adjust score
    score.answered = Math.max(0, score.answered - retryKeys.length);
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

    // Rebuild focus mode if active
    if (focusMode) { rebuildFocusCards(); focusIndex = 0; updateFocusIndicator(); }
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
      gsap.killTweensOf(retryBarEl);
      gsap.fromTo(retryBarEl, { y: -44 }, { y: 0, duration: 0.3, ease: 'power2.out' });
    }
  }

  function checkRetryComplete() {
    var allDone = retryKeys.every(function(k) { return answeredKeys[k]; });
    if (!allDone) return;
    // Delay so autoExpandToggles (500ms) + animation (700ms) finishes first
    if (retrySummaryTimer) clearTimeout(retrySummaryTimer);
    retrySummaryTimer = setTimeout(function() {
      retrySummaryTimer = null;
      if (!retryMode) return;
      showRetrySummary();
    }, 1500);
  }

  function showRetrySummary() {
    var correctCount = retryKeys.filter(function(k) {
      return answeredKeys[k] && answeredKeys[k].result === 'correct';
    }).length;
    var totalCount = retryKeys.length;
    var allCorrect = correctCount === totalCount;

    var previousFocus = document.activeElement;

    var overlay = document.createElement('div');
    overlay.className = 'iq-confirm-overlay';

    var dialog = document.createElement('div');
    dialog.className = 'iq-confirm-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', allCorrect ? 'Perfect score' : 'Retry summary');

    var closeBtn = document.createElement('button');
    closeBtn.className = 'sr-modal-close iq-retry-close';
    closeBtn.textContent = '\u2715';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.onclick = function() {
      dismissOverlay(overlay, null);
    };
    dialog.appendChild(closeBtn);

    var icon = document.createElement('div');
    icon.className = 'iq-retry-summary-icon';
    icon.textContent = allCorrect ? '\u2705' : '\uD83D\uDCCA';
    dialog.appendChild(icon);

    var title = document.createElement('div');
    title.className = 'iq-confirm-title';
    title.textContent = allCorrect ? 'Perfect!' : 'Retry Complete';
    dialog.appendChild(title);

    var scoreEl = document.createElement('div');
    scoreEl.className = 'iq-retry-summary-score';
    var numSpan = document.createElement('span');
    numSpan.className = 'iq-retry-summary-num';
    numSpan.textContent = correctCount;
    var sepSpan = document.createElement('span');
    sepSpan.className = 'iq-retry-summary-sep';
    sepSpan.textContent = '/';
    var denSpan = document.createElement('span');
    denSpan.className = 'iq-retry-summary-den';
    denSpan.textContent = totalCount;
    var labelSpan = document.createElement('span');
    labelSpan.className = 'iq-retry-summary-label';
    labelSpan.textContent = ' correct';
    scoreEl.appendChild(numSpan);
    scoreEl.appendChild(sepSpan);
    scoreEl.appendChild(denSpan);
    scoreEl.appendChild(labelSpan);
    dialog.appendChild(scoreEl);

    var breakdown = document.createElement('div');
    breakdown.className = 'iq-retry-summary-breakdown';
    retryKeys.forEach(function(k) {
      var qi = parseInt(k.split('-')[1]);
      var result = answeredKeys[k];
      var dot = document.createElement('span');
      dot.className = 'iq-retry-dot ' + (result.result === 'correct' ? 'correct' : 'wrong');
      dot.textContent = 'Q' + (qi + 1);
      breakdown.appendChild(dot);
    });
    dialog.appendChild(breakdown);

    var text = document.createElement('div');
    text.className = 'iq-confirm-text';
    if (allCorrect) {
      text.textContent = 'All retry questions answered correctly!';
    } else {
      var stillWrong = totalCount - correctCount;
      text.textContent = stillWrong + ' question' + (stillWrong > 1 ? 's' : '') + ' still incorrect.';
    }
    dialog.appendChild(text);

    var actions = document.createElement('div');
    actions.className = 'iq-confirm-actions';

    if (!allCorrect) {
      var retryAgainBtn = document.createElement('button');
      retryAgainBtn.className = 'iq-confirm-cancel';
      retryAgainBtn.textContent = 'Retry Again';
      retryAgainBtn.onclick = function() {
        dismissOverlay(overlay, function() {
          exitRetryMode();
          startRetryMode();
        });
      };
      actions.appendChild(retryAgainBtn);
    }

    var returnBtn = document.createElement('button');
    returnBtn.className = 'iq-confirm-ok';
    if (allCorrect) {
      returnBtn.style.background = 'linear-gradient(135deg, #16A34A, #22C55E)';
    }
    returnBtn.textContent = 'Return to All Questions';
    returnBtn.onclick = function() {
      dismissOverlay(overlay, function() {
        exitRetryMode();
      });
    };
    actions.appendChild(returnBtn);

    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    if (typeof gsap !== 'undefined') {
      gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: reducedMotion ? 0.01 : 0.2 });
      gsap.fromTo(dialog, { scale: 0.9, y: 20 }, { scale: 1, y: 0, duration: reducedMotion ? 0.01 : 0.3, ease: 'back.out(1.7)' });
    }

    // Focus trap + keyboard support
    overlay.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        dismissOverlay(overlay, function() { exitRetryMode(); });
        if (previousFocus) previousFocus.focus();
        return;
      }
      if (e.key === 'Tab') {
        var focusable = dialog.querySelectorAll('button');
        if (focusable.length === 0) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    });
    var firstBtn = dialog.querySelector('button');
    if (firstBtn) firstBtn.focus();
  }

  function dismissOverlay(overlay, callback) {
    if (typeof gsap !== 'undefined') {
      gsap.to(overlay, { opacity: 0, duration: reducedMotion ? 0.01 : 0.15, onComplete: function() {
        overlay.remove();
        if (callback) callback();
      }});
    } else {
      overlay.remove();
      if (callback) callback();
    }
  }

  function exitRetryMode() {
    retryMode = false;
    if (retrySummaryTimer) { clearTimeout(retrySummaryTimer); retrySummaryTimer = null; }
    var scrollY = window.scrollY;

    // Show hidden cards at opacity 0, then fade in
    var allCards = document.querySelectorAll('.qcard[data-si][data-qi]');
    var hiddenCards = [];
    allCards.forEach(function(card) {
      if (card.style.display === 'none') {
        hiddenCards.push(card);
        card.style.display = '';
        card.style.opacity = '0';
      }
    });

    // Restore scroll position before browser reflows
    window.scrollTo(0, scrollY);

    // Fade in previously hidden cards
    if (typeof gsap !== 'undefined' && hiddenCards.length > 0) {
      gsap.to(hiddenCards, {
        opacity: 1, duration: reducedMotion ? 0.01 : 0.3, stagger: 0.02, ease: 'power2.out',
        onComplete: function() { hiddenCards.forEach(function(c) { c.style.opacity = ''; }); }
      });
    } else {
      hiddenCards.forEach(function(c) { c.style.opacity = ''; });
    }

    // Remove retry bar
    if (retryBarEl) {
      if (typeof gsap !== 'undefined') {
        gsap.to(retryBarEl, { y: -44, duration: 0.2, onComplete: function() { retryBarEl.remove(); retryBarEl = null; } });
      } else {
        retryBarEl.remove();
        retryBarEl = null;
      }
    }

    retryKeys = [];
    retryBackup = {};
    updateProgressPanel();
  }

  function showToast(message) {
    var toast = document.createElement('div');
    toast.className = 'iq-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.style.bottom = '80px';
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
    var previousFocus = document.activeElement;

    var overlay = document.createElement('div');
    overlay.className = 'iq-confirm-overlay';

    var dialog = document.createElement('div');
    dialog.className = 'iq-confirm-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Reset progress confirmation');

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
        gsap.to(overlay, { opacity: 0, duration: 0.15, onComplete: function() { overlay.remove(); if (previousFocus) previousFocus.focus(); } });
      } else {
        overlay.remove();
        if (previousFocus) previousFocus.focus();
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

    // Focus trap + keyboard support
    overlay.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        if (typeof gsap !== 'undefined') {
          gsap.to(overlay, { opacity: 0, duration: 0.15, onComplete: function() { overlay.remove(); if (previousFocus) previousFocus.focus(); } });
        } else {
          overlay.remove();
          if (previousFocus) previousFocus.focus();
        }
        return;
      }
      if (e.key === 'Tab') {
        var focusable = dialog.querySelectorAll('button');
        if (focusable.length === 0) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    });
    cancelBtn.focus();
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
    if (retrySummaryTimer) { clearTimeout(retrySummaryTimer); retrySummaryTimer = null; }
    if (retryBarEl) { retryBarEl.remove(); retryBarEl = null; }
    saveProgress();
    updateProgressPanel();
    updateStreakDisplay();
    closeProgressPanel();
    // Re-render current cards without answered state
    var cards = document.querySelectorAll('.qcard[data-si][data-qi]');
    cards.forEach(function(card) {
      // Kill active GSAP tweens on card and its animated children
      if (typeof gsap !== 'undefined') {
        gsap.killTweensOf(card);
        card.querySelectorAll('.collapsible, .iq-zone, .iq-check-popup').forEach(function(el) {
          gsap.killTweensOf(el);
        });
      }
      // Close all open collapsibles and clean state
      card.querySelectorAll('.collapsible.open').forEach(function(block) {
        block.classList.remove('open');
        if (typeof gsap !== 'undefined') gsap.set(block, { clearProps: 'all' });
        block.style.opacity = '';
      });
      // Reset aria-expanded on toggle buttons
      card.querySelectorAll('.toggle-btn[aria-expanded="true"]').forEach(function(btn) {
        btn.setAttribute('aria-expanded', 'false');
      });
      // Clear answer loaded state so re-fetch works
      card.querySelectorAll('.collapsible[data-type="answer"]').forEach(function(c) {
        delete c.dataset.loaded;
        delete c.dataset.loading;
        var ansBox = c.querySelector('.ans-box');
        if (ansBox) ansBox.textContent = '';
      });
      // Restore fillin original qtext if stored (safe: restoring lesson HTML)
      if (card.dataset.originalQtext) {
        var qtext = card.querySelector('.qtext');
        if (qtext) qtext.innerHTML = card.dataset.originalQtext;
      }
      card.dataset.iqEnhanced = '';
      card.classList.remove('iq-wrong');
      card.style.display = '';
      card.style.opacity = '';
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
    if (window.UISound) {
      UISound.play('correct');
      setTimeout(function() { UISound.play('notify'); }, 200);
    }

    var toast = document.createElement('div');
    toast.className = 'iq-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    var iconSpan = document.createElement('span');
    iconSpan.className = 'iq-toast-icon';
    iconSpan.textContent = badge.icon;
    var textSpan = document.createElement('span');
    textSpan.className = 'iq-toast-text';
    var strong = document.createElement('strong');
    strong.textContent = badge.name;
    textSpan.appendChild(strong);
    textSpan.appendChild(document.createElement('br'));
    textSpan.appendChild(document.createTextNode(badge.desc));
    toast.appendChild(iconSpan);
    toast.appendChild(textSpan);
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
    var headerTitle = document.createElement('span');
    headerTitle.textContent = '\uD83C\uDFC6 Achievements';
    var headerCount = document.createElement('span');
    headerCount.className = 'iq-badge-count';
    headerCount.textContent = badges.length + ' / ' + BADGES.length;
    header.appendChild(headerTitle);
    header.appendChild(headerCount);
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
      toggleBadgePanel();
      performFullReset();
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

  // ── Keyboard Navigation ──
  function getVisibleCard() {
    var cards = document.querySelectorAll('.qcard[data-si][data-qi]');
    var viewMid = window.innerHeight / 2;
    var best = null;
    var bestDist = Infinity;
    cards.forEach(function(card) {
      if (card.style.display === 'none') return;
      var rect = card.getBoundingClientRect();
      var dist = Math.abs(rect.top + rect.height / 2 - viewMid);
      if (dist < bestDist) {
        bestDist = dist;
        best = card;
      }
    });
    return best;
  }

  function toggleOnNearestCard(type) {
    var card = getVisibleCard();
    if (!card) return;
    var btn = card.querySelector('.toggle-btn.' + type);
    if (btn) btn.click();
  }

  function scrollToCard(card) {
    if (!card) return;
    if (window.UISound) UISound.play('click');
    if (typeof gsap !== 'undefined' && !reducedMotion) {
      var target = card.getBoundingClientRect().top + window.pageYOffset - window.innerHeight / 2 + card.offsetHeight / 2;
      var scrollObj = { y: window.pageYOffset };
      gsap.to(scrollObj, {
        y: target, duration: 0.4, ease: 'power2.out',
        onUpdate: function() { window.scrollTo(0, scrollObj.y); }
      });
    } else {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function navigateCards(direction) {
    var cards = Array.prototype.slice.call(document.querySelectorAll('.qcard[data-si][data-qi]'));
    cards = cards.filter(function(c) { return c.style.display !== 'none'; });
    if (cards.length === 0) return;
    var currentIdx = findNearestCardIndex(cards);
    var nextIdx = direction > 0
      ? Math.min(currentIdx + 1, cards.length - 1)
      : Math.max(currentIdx - 1, 0);
    if (nextIdx !== currentIdx) scrollToCard(cards[nextIdx]);
  }

  function setupKeyboardNav() {
    document.addEventListener('keydown', function(e) {
      // Don't intercept when typing in an input/textarea
      var tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (e.key === 'Escape') {
          e.target.blur();
          e.preventDefault();
        }
        return;
      }

      var key = e.key;
      var lower = key.toLowerCase();

      // Escape: priority chain — badge panel > focus mode > review nav > progress panel > popup > collapsible
      if (key === 'Escape') {
        if (badgePanelEl) { toggleBadgePanel(); e.preventDefault(); return; }
        if (focusMode) { exitFocusMode(); e.preventDefault(); return; }
        if (reviewMode && reviewNavEl && reviewNavEl.style.display !== 'none') {
          toggleReviewMode(); e.preventDefault(); return;
        }
        if (progressPanelOpen) { closeProgressPanel(); e.preventDefault(); return; }
        // Close popup on visible zone
        var visZone = getVisibleActiveZone();
        if (visZone && visZone._popup) { dismissPopup(visZone); e.preventDefault(); return; }
        var openCollapsible = document.querySelector('.collapsible.open');
        if (openCollapsible) { openCollapsible.classList.remove('open'); e.preventDefault(); return; }
        return;
      }

      // Focus mode navigation intercepts
      if (focusMode) {
        if (key === 'ArrowLeft' || lower === 'k') { navigateFocus(-1); e.preventDefault(); return; }
        if (key === 'ArrowRight' || lower === 'j') { navigateFocus(1); e.preventDefault(); return; }
      }

      // 1-9: select choice or scramble chip
      var numKey = -1;
      if (key >= '1' && key <= '9') numKey = parseInt(key) - 1;

      if (numKey >= 0) {
        var activeZone = getVisibleActiveZone();
        if (activeZone) {
          // Check if scramble type (has pool chips)
          var poolChips = activeZone.querySelectorAll('.iq-chip:not(.hidden)');
          if (poolChips.length > 0 && numKey < poolChips.length) {
            poolChips[numKey].click();
            e.preventDefault();
            return;
          }
          // Regular choice (1-4 only)
          if (numKey < 4) {
            var choices = activeZone.querySelectorAll('.iq-choice:not(.dimmed):not(.correct):not(.wrong)');
            if (numKey < choices.length) {
              choices[numKey].click();
              e.preventDefault();
            }
          }
        }
        return;
      }

      // a-d: select choice OR toggle answer (collision logic)
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        var choiceIndex = -1;
        if (lower >= 'a' && lower <= 'd') choiceIndex = lower.charCodeAt(0) - 97;

        if (choiceIndex >= 0 && choiceIndex < 4) {
          var zone = getVisibleActiveZone();
          if (zone) {
            var ch = zone.querySelectorAll('.iq-choice:not(.dimmed):not(.correct):not(.wrong)');
            if (choiceIndex < ch.length) {
              ch[choiceIndex].click();
              e.preventDefault();
              return;
            }
          }
          // No active zone or no choices — 'a' toggles answer
          if (lower === 'a') { toggleOnNearestCard('answer'); e.preventDefault(); return; }
          return;
        }
      }

      // Backspace: undo last scramble chip
      if (key === 'Backspace') {
        var sz = getVisibleActiveZone();
        if (sz) {
          var placedChips = sz.querySelectorAll('.iq-answer-zone .iq-chip.placed');
          if (placedChips.length > 0) {
            placedChips[placedChips.length - 1].click();
            e.preventDefault();
          }
        }
        return;
      }

      // Enter: trigger check on the visible question
      if (key === 'Enter') {
        var ez = getVisibleActiveZone();
        if (ez && ez._popup) {
          var checkBtn = ez._popup.querySelector('.iq-popup-check-btn');
          if (checkBtn) { checkBtn.click(); e.preventDefault(); }
        }
        return;
      }

      // Navigation & toggles (case-insensitive, no modifiers)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (lower === 'j') { if (!focusMode) navigateCards(1); e.preventDefault(); return; }
      if (lower === 'k') { if (!focusMode) navigateCards(-1); e.preventDefault(); return; }
      if (lower === 'h') { toggleOnNearestCard('hint'); e.preventDefault(); return; }
      if (lower === 'w') { toggleOnNearestCard('vocab'); e.preventDefault(); return; }
      if (lower === 'p') { toggleProgressPanel(); e.preventDefault(); return; }
      if (lower === 'f') { toggleFocusMode(); e.preventDefault(); return; }

      // Arrow keys: navigate between questions (scroll to prev/next qcard)
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        if (!focusMode) {
          navigateCards(key === 'ArrowDown' ? 1 : -1);
          e.preventDefault();
        }
      }
    });
  }

  // ── Keyboard hint badges ──
  var kbdHintsVisible = false;

  function createKbdToggle() {
    var topNavRight = document.querySelector('.top-nav-right');
    if (!topNavRight) return;

    // Restore preference
    try { kbdHintsVisible = localStorage.getItem('iq-kbd-hints') === '1'; } catch (e) {}
    if (kbdHintsVisible) document.body.classList.add('iq-kbd-hints-visible');

    var btn = document.createElement('button');
    btn.className = 'iq-kbd-toggle' + (kbdHintsVisible ? ' active' : '');
    btn.title = 'Keyboard shortcuts';
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    var r = document.createElementNS(svgNS, 'rect');
    r.setAttribute('x', '1'); r.setAttribute('y', '4');
    r.setAttribute('width', '14'); r.setAttribute('height', '9');
    r.setAttribute('rx', '2');
    var l1 = document.createElementNS(svgNS, 'line');
    l1.setAttribute('x1', '4'); l1.setAttribute('y1', '7.5');
    l1.setAttribute('x2', '6'); l1.setAttribute('y2', '7.5');
    var l2 = document.createElementNS(svgNS, 'line');
    l2.setAttribute('x1', '7'); l2.setAttribute('y1', '7.5');
    l2.setAttribute('x2', '9'); l2.setAttribute('y2', '7.5');
    var l3 = document.createElementNS(svgNS, 'line');
    l3.setAttribute('x1', '10'); l3.setAttribute('y1', '7.5');
    l3.setAttribute('x2', '12'); l3.setAttribute('y2', '7.5');
    var l4 = document.createElementNS(svgNS, 'line');
    l4.setAttribute('x1', '5'); l4.setAttribute('y1', '10.5');
    l4.setAttribute('x2', '11'); l4.setAttribute('y2', '10.5');
    svg.appendChild(r); svg.appendChild(l1); svg.appendChild(l2); svg.appendChild(l3); svg.appendChild(l4);
    btn.appendChild(svg);

    btn.onclick = function() {
      kbdHintsVisible = !kbdHintsVisible;
      btn.classList.toggle('active', kbdHintsVisible);
      document.body.classList.toggle('iq-kbd-hints-visible', kbdHintsVisible);
      try { localStorage.setItem('iq-kbd-hints', kbdHintsVisible ? '1' : '0'); } catch (e) {}
    };

    topNavRight.insertBefore(btn, topNavRight.firstChild);
  }

  // ── Sound mute toggle ──
  function createMuteToggle() {
    var topNavRight = document.querySelector('.top-nav-right');
    if (!topNavRight || typeof window.UISound === 'undefined') return;

    var btn = document.createElement('button');
    btn.className = 'iq-mute-toggle' + (UISound.muted ? ' muted' : '');
    btn.title = 'Toggle sound';
    updateMuteIcon(btn, UISound.muted);

    btn.onclick = function() {
      var nowMuted = UISound.toggleMute();
      btn.classList.toggle('muted', nowMuted);
      updateMuteIcon(btn, nowMuted);
    };

    topNavRight.insertBefore(btn, topNavRight.firstChild);
  }

  function updateMuteIcon(btn, isMuted) {
    var svgNS = 'http://www.w3.org/2000/svg';
    btn.textContent = '';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    // Speaker body
    var poly = document.createElementNS(svgNS, 'polygon');
    poly.setAttribute('points', '2,6 5,6 8,3 8,13 5,10 2,10');
    svg.appendChild(poly);
    if (isMuted) {
      var x1 = document.createElementNS(svgNS, 'line');
      x1.setAttribute('x1', '10'); x1.setAttribute('y1', '6');
      x1.setAttribute('x2', '14'); x1.setAttribute('y2', '10');
      var x2 = document.createElementNS(svgNS, 'line');
      x2.setAttribute('x1', '14'); x2.setAttribute('y1', '6');
      x2.setAttribute('x2', '10'); x2.setAttribute('y2', '10');
      svg.appendChild(x1); svg.appendChild(x2);
    } else {
      var arc = document.createElementNS(svgNS, 'path');
      arc.setAttribute('d', 'M10,5.5 Q13,8 10,10.5');
      svg.appendChild(arc);
    }
    btn.appendChild(svg);
  }

  // ── Focus Mode ──
  var focusMode = false;
  var focusIndex = 0;
  var focusCards = [];
  var focusAnimating = false;
  var focusPendingDirection = null;
  var focusTouchStartX = 0;
  var focusTouchStartY = 0;
  var focusOverlayEl = null;
  var focusIndicatorEl = null;
  var focusPrevBtn = null;
  var focusNextBtn = null;

  function createFocusToggle() {
    var topNavRight = document.querySelector('.top-nav-right');
    if (!topNavRight) return;

    var btn = document.createElement('button');
    btn.className = 'iq-focus-toggle';
    btn.title = 'Focus mode (F)';
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    var c = document.createElementNS(svgNS, 'circle');
    c.setAttribute('cx', '8'); c.setAttribute('cy', '8'); c.setAttribute('r', '5');
    var l1 = document.createElementNS(svgNS, 'line');
    l1.setAttribute('x1', '8'); l1.setAttribute('y1', '1'); l1.setAttribute('x2', '8'); l1.setAttribute('y2', '4');
    var l2 = document.createElementNS(svgNS, 'line');
    l2.setAttribute('x1', '8'); l2.setAttribute('y1', '12'); l2.setAttribute('x2', '8'); l2.setAttribute('y2', '15');
    var l3 = document.createElementNS(svgNS, 'line');
    l3.setAttribute('x1', '1'); l3.setAttribute('y1', '8'); l3.setAttribute('x2', '4'); l3.setAttribute('y2', '8');
    var l4 = document.createElementNS(svgNS, 'line');
    l4.setAttribute('x1', '12'); l4.setAttribute('y1', '8'); l4.setAttribute('x2', '15'); l4.setAttribute('y2', '8');
    svg.appendChild(c); svg.appendChild(l1); svg.appendChild(l2); svg.appendChild(l3); svg.appendChild(l4);
    btn.appendChild(svg);

    btn.onclick = function() { toggleFocusMode(); };
    topNavRight.insertBefore(btn, topNavRight.firstChild);
  }

  function createFocusOverlay() {
    if (focusOverlayEl) return;
    focusOverlayEl = document.createElement('div');
    focusOverlayEl.className = 'iq-focus-overlay';

    focusPrevBtn = document.createElement('button');
    focusPrevBtn.className = 'iq-focus-arrow iq-focus-prev';
    focusPrevBtn.textContent = '\u2039';
    focusPrevBtn.onclick = function() { navigateFocus(-1); };

    focusNextBtn = document.createElement('button');
    focusNextBtn.className = 'iq-focus-arrow iq-focus-next';
    focusNextBtn.textContent = '\u203A';
    focusNextBtn.onclick = function() { navigateFocus(1); };

    focusIndicatorEl = document.createElement('div');
    focusIndicatorEl.className = 'iq-focus-indicator';

    focusOverlayEl.appendChild(focusPrevBtn);
    focusOverlayEl.appendChild(focusNextBtn);
    focusOverlayEl.appendChild(focusIndicatorEl);
    document.body.appendChild(focusOverlayEl);
  }

  function toggleFocusMode() {
    if (focusMode) exitFocusMode();
    else enterFocusMode();
  }

  function enterFocusMode() {
    if (focusMode) return;
    if (typeof NavState !== 'undefined' && NavState.view !== 'question') return;

    rebuildFocusCards();
    if (focusCards.length === 0) return;

    focusMode = true;
    focusIndex = findNearestCardIndex(focusCards);

    createFocusOverlay();

    // Force-clear reveal state (initCardReveal sets opacity:0, y:20)
    if (typeof gsap !== 'undefined') gsap.set(focusCards, { opacity: 1, y: 0 });

    focusCards.forEach(function(card, i) {
      if (i !== focusIndex) {
        if (typeof gsap !== 'undefined' && !reducedMotion) {
          gsap.to(card, { opacity: 0, scale: 0.95, duration: 0.25, ease: 'power2.in',
            onComplete: function() { card.style.display = 'none'; }
          });
        } else {
          card.style.display = 'none';
        }
      }
    });

    var focused = focusCards[focusIndex];
    if (typeof gsap !== 'undefined' && !reducedMotion) {
      gsap.to(focused, { opacity: 1, y: 0, scale: 1.02, duration: 0.3, ease: 'back.out(1.4)' });
    }
    focused.scrollIntoView({ behavior: 'smooth', block: 'center' });

    focusOverlayEl.classList.add('active');
    if (typeof gsap !== 'undefined' && !reducedMotion) {
      gsap.fromTo(focusOverlayEl, { opacity: 0 }, { opacity: 1, duration: 0.25 });
    }

    document.body.classList.add('iq-focus-active');
    updateFocusIndicator();

    var toggle = document.querySelector('.iq-focus-toggle');
    if (toggle) toggle.classList.add('active');

    if (window.UISound) UISound.play('transUp');

    try {
      var fKey = 'iq-focus-' + (document.body.dataset.examId || 'default');
      localStorage.setItem(fKey, '1');
    } catch (e) {}
  }

  function exitFocusMode() {
    if (!focusMode) return;
    focusMode = false;

    var previousCard = focusCards[focusIndex];

    var allCards = document.querySelectorAll('.qcard[data-si][data-qi]');
    allCards.forEach(function(card) {
      if (retryMode) {
        var key = card.dataset.si + '-' + card.dataset.qi;
        card.style.display = retryKeys.indexOf(key) !== -1 ? '' : 'none';
      } else if (reviewMode) {
        var rkey = getQKey(card.dataset.si, card.dataset.qi);
        card.style.display = (getAnswerResult(rkey) === 'wrong') ? '' : 'none';
      } else {
        card.style.display = '';
      }
    });

    if (typeof gsap !== 'undefined' && !reducedMotion) {
      var visibleCards = Array.prototype.slice.call(allCards).filter(function(c) { return c.style.display !== 'none'; });
      gsap.fromTo(visibleCards,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, scale: 1, duration: 0.3, stagger: 0.03, ease: 'power2.out' }
      );
    } else {
      allCards.forEach(function(c) {
        if (c.style.display !== 'none') { c.style.opacity = ''; c.style.transform = ''; }
      });
    }

    if (previousCard) {
      setTimeout(function() {
        previousCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }

    if (focusOverlayEl) focusOverlayEl.classList.remove('active');
    document.body.classList.remove('iq-focus-active');

    var toggle = document.querySelector('.iq-focus-toggle');
    if (toggle) toggle.classList.remove('active');

    if (window.UISound) UISound.play('transDown');

    try {
      var fKey = 'iq-focus-' + (document.body.dataset.examId || 'default');
      localStorage.removeItem(fKey);
    } catch (e) {}
  }

  function navigateFocus(direction) {
    if (!focusMode || focusAnimating) return;
    var newIdx = focusIndex + direction;

    // At boundary — try advancing to adjacent section
    if (newIdx < 0 || newIdx >= focusCards.length) {
      if (typeof NavState !== 'undefined' && typeof Router !== 'undefined') {
        var sections = NavState.categoryMap[NavState.category];
        if (sections) {
          var localIdx = sections.indexOf(NavState.section);
          var nextLocalIdx = localIdx + direction;
          if (nextLocalIdx >= 0 && nextLocalIdx < sections.length) {
            focusPendingDirection = direction > 0 ? 'forward' : 'backward';
            focusAnimating = true;
            var current = focusCards[focusIndex];
            var slideX = direction > 0 ? -60 : 60;
            if (typeof gsap !== 'undefined' && !reducedMotion) {
              gsap.to(current, {
                opacity: 0, x: slideX, scale: 0.95, duration: 0.25, ease: 'power2.in',
                onComplete: function() {
                  current.style.display = 'none';
                  Router.setSection(sections[nextLocalIdx]);
                }
              });
            } else {
              current.style.display = 'none';
              Router.setSection(sections[nextLocalIdx]);
            }
            if (window.UISound) UISound.play('click');
            return;
          }
        }
      }
      return; // at absolute boundary (first/last section)
    }

    // Normal within-section navigation
    focusAnimating = true;
    var current = focusCards[focusIndex];
    var next = focusCards[newIdx];
    var slideX = direction > 0 ? -60 : 60;

    if (typeof gsap !== 'undefined' && !reducedMotion) {
      gsap.to(current, {
        opacity: 0, x: slideX, scale: 0.95, duration: 0.25, ease: 'power2.in',
        onComplete: function() {
          current.style.display = 'none';
          next.style.display = '';
          gsap.fromTo(next,
            { opacity: 0, x: -slideX, y: 0, scale: 0.95 },
            { opacity: 1, x: 0, y: 0, scale: 1.02, duration: 0.3, ease: 'power2.out',
              onComplete: function() { focusAnimating = false; }
            }
          );
          next.scrollIntoView({ behavior: 'auto', block: 'center' });
        }
      });
    } else {
      current.style.display = 'none';
      next.style.display = '';
      next.scrollIntoView({ behavior: 'auto', block: 'center' });
      focusAnimating = false;
    }

    focusIndex = newIdx;
    updateFocusIndicator();
    if (window.UISound) UISound.play('click');
  }

  function rebuildFocusCards() {
    focusCards = Array.prototype.slice.call(
      document.querySelectorAll('.qcard[data-si][data-qi]')
    ).filter(function(c) {
      if (c.style.display === 'none' && !focusMode) return false;
      if (retryMode) {
        var key = c.dataset.si + '-' + c.dataset.qi;
        return retryKeys.indexOf(key) !== -1;
      }
      if (reviewMode) {
        var rkey = getQKey(c.dataset.si, c.dataset.qi);
        return getAnswerResult(rkey) === 'wrong';
      }
      return true;
    });
    if (focusMode && focusIndex >= focusCards.length) {
      focusIndex = Math.max(0, focusCards.length - 1);
    }
  }

  function updateFocusIndicator() {
    if (!focusIndicatorEl) return;
    focusIndicatorEl.textContent = 'Q ' + (focusIndex + 1) + ' / ' + focusCards.length;

    var canGoPrev = focusIndex > 0;
    var canGoNext = focusIndex < focusCards.length - 1;

    // Check for adjacent sections so arrows stay enabled at section boundaries
    if (typeof NavState !== 'undefined') {
      var sections = NavState.categoryMap[NavState.category];
      if (sections) {
        var localIdx = sections.indexOf(NavState.section);
        if (!canGoPrev && localIdx > 0) canGoPrev = true;
        if (!canGoNext && localIdx < sections.length - 1) canGoNext = true;
      }
    }

    if (focusPrevBtn) focusPrevBtn.disabled = !canGoPrev;
    if (focusNextBtn) focusNextBtn.disabled = !canGoNext;
  }

  function setupFocusSwipe() {
    var container = document.getElementById('questionsList');
    if (!container) return;

    container.addEventListener('touchstart', function(e) {
      if (!focusMode) return;
      focusTouchStartX = e.touches[0].clientX;
      focusTouchStartY = e.touches[0].clientY;
    }, { passive: true });

    container.addEventListener('touchend', function(e) {
      if (!focusMode) return;
      var dx = e.changedTouches[0].clientX - focusTouchStartX;
      var dy = e.changedTouches[0].clientY - focusTouchStartY;
      if (Math.abs(dx) > 50 && Math.abs(dy) < Math.abs(dx) * 0.7) {
        navigateFocus(dx < 0 ? 1 : -1);
      }
    }, { passive: true });
  }

  // Find the iq-zone of the question card nearest the viewport center
  function getVisibleActiveZone() {
    var cards = document.querySelectorAll('.qcard[data-si][data-qi]');
    var viewMid = window.innerHeight / 2;
    var best = null;
    var bestDist = Infinity;

    cards.forEach(function(card) {
      if (card.style.display === 'none') return;
      var zone = card.querySelector('.iq-zone');
      if (!zone || zone.classList.contains('locked')) return;
      var rect = card.getBoundingClientRect();
      var dist = Math.abs(rect.top + rect.height / 2 - viewMid);
      if (dist < bestDist) {
        bestDist = dist;
        best = zone;
      }
    });
    return best;
  }

  function findNearestCardIndex(cards) {
    var viewMid = window.innerHeight / 2;
    var bestIdx = 0;
    var bestDist = Infinity;
    cards.forEach(function(card, i) {
      var rect = card.getBoundingClientRect();
      var dist = Math.abs(rect.top + rect.height / 2 - viewMid);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    });
    return bestIdx;
  }

  // ── Init ──
  function init() {
    pruneOldProgress();
    loadProgress();

    // Reconstruct score from loaded answeredKeys
    Object.keys(answeredKeys).forEach(function(key) {
      score.answered++;
      if (getAnswerResult(key) === 'correct') score.correct++;
    });

    detectExistingSession();
    createProgressPanel();
    createKbdToggle();
    createMuteToggle();
    createFocusToggle();
    setupTeacherRevealListeners();
    setupKeyboardNav();
    setupFocusSwipe();
    enhanceVisibleCards();
    setupObserver();

    // Restore focus mode from localStorage
    try {
      var fKey = 'iq-focus-' + (document.body.dataset.examId || 'default');
      if (localStorage.getItem(fKey) === '1') {
        setTimeout(function() { enterFocusMode(); }, 300);
      }
    } catch (e) {}

    window.addEventListener('hashchange', function() {
      setTimeout(function() {
        enhanceVisibleCards();
        if (reviewMode) filterVisibleCards();
        if (focusMode) rebuildFocusCards();
      }, 50);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 100);
  }
})();
