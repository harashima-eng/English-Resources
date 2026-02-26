/* Teacher Reveal Module
   Real-time teacher-controlled answer reveal for exam practice sessions.
   When a teacher starts a session, student answer buttons are locked.
   The teacher reveals answers one-by-one via a floating control panel.
   No active session = normal self-study mode (transparent).

   Supported patterns:
   - kogakuin: .q-item / .answer-btn / .answer-box
   - chuo-aoyama: .q / .ans-btn / .ans-box / .sec[data-sec]
   - hosei-tus: .q / .ans-btn / .ans-box / .view[id^="view-sec"]
   - dualscope: .qcard / .toggle-btn.answer / .collapsible[data-type="answer"]
     (dynamic rendering via grammarData, MutationObserver for re-apply) */

(function() {
  'use strict';

  // ── Constants ──
  var PANEL_MIN_WIDTH = 300;
  var PANEL_MAX_WIDTH = 600;
  var PANEL_GUTTER = 40;
  var DESKTOP_BREAKPOINT = 900;
  var SESSION_EXPIRY_MS = 4 * 60 * 60 * 1000; // 4 hours
  var TOAST_DURATION_MS = 2500;
  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Exam ID check ──
  var examId = document.body && document.body.dataset.examId;
  if (!examId) return;

  // ── Firebase init ──
  if (typeof firebase === 'undefined' || !firebase.apps.length) return;
  var db = firebase.database();
  var auth = firebase.auth();
  var examRef = db.ref('exams/' + examId);

  // ── Pattern detection ──
  function detectPattern() {
    if (document.querySelector('.q-item .answer-btn')) {
      return {
        name: 'kogakuin',
        questionSel: '.q-item',
        answerBtnSel: '.answer-btn',
        answerBoxSel: '.answer-box',
        hintBtnSel: '.hint-btn',
        hintBoxSel: '.hint-box',
        sectionSel: '.section-header[data-target]',
        getSectionQuestions: function(secEl) {
          var targetId = secEl.dataset.target;
          var container = document.getElementById(targetId);
          return container ? container.querySelectorAll(this.questionSel) : [];
        }
      };
    }
    if (document.querySelector('.sec[data-sec]')) {
      return {
        name: 'chuo-aoyama',
        questionSel: '.q',
        answerBtnSel: '.ans-btn',
        answerBoxSel: '.ans-box',
        hintBtnSel: '.hint-btn',
        hintBoxSel: '.hint-box',
        sectionSel: '.sec[data-sec]',
        getSectionQuestions: function(secEl) {
          return secEl.querySelectorAll(this.questionSel);
        }
      };
    }
    if (document.querySelector('.view .ans-btn')) {
      return {
        name: 'hosei-tus',
        questionSel: '.q',
        answerBtnSel: '.ans-btn',
        answerBoxSel: '.ans-box',
        hintBtnSel: '.hint-btn',
        hintBoxSel: '.hint-box',
        sectionSel: '.view[id^="view-sec"]',
        getSectionQuestions: function(secEl) {
          return secEl.querySelectorAll(this.questionSel);
        }
      };
    }
    // Dualscope: grammarData-driven pages with .toggle-btn.answer
    if (typeof grammarData !== 'undefined' && grammarData.sections) {
      var isDynamic = !!document.getElementById('questionsList');
      return {
        name: 'dualscope',
        questionSel: '.qcard',
        answerBtnSel: '.toggle-btn.answer',
        answerBoxSel: '.collapsible[data-type="answer"]',
        hintBtnSel: '.toggle-btn.hint',
        hintBoxSel: '.collapsible[data-type="hint"]',
        sectionSel: isDynamic ? null : '.section',
        isDynamic: isDynamic,
        getSectionQuestions: function(secEl) {
          return secEl ? secEl.querySelectorAll(this.questionSel) : [];
        }
      };
    }
    return null;
  }

  var pattern = detectPattern();
  if (!pattern) return;

  // ── Build exam index ──
  var examIndex = { sections: [] };

  function buildIndex() {
    examIndex.sections = [];

    // Dualscope: build from grammarData (DOM elements are transient)
    if (pattern.name === 'dualscope') {
      grammarData.sections.forEach(function(sec, si) {
        var questions = [];
        sec.questions.forEach(function(q, qi) {
          questions.push({ el: null, index: qi });
        });
        examIndex.sections.push({ el: null, index: si, title: sec.title, questions: questions });
      });
      return;
    }

    // Static patterns: build from DOM
    var sectionEls = document.querySelectorAll(pattern.sectionSel);
    if (sectionEls.length === 0) {
      var allQs = document.querySelectorAll(pattern.questionSel);
      var questions = [];
      allQs.forEach(function(qEl, qi) {
        questions.push({ el: qEl, index: qi });
      });
      examIndex.sections.push({ el: null, index: 0, questions: questions });
      return;
    }
    sectionEls.forEach(function(secEl, si) {
      var qEls = pattern.getSectionQuestions(secEl);
      var questions = [];
      qEls.forEach(function(qEl, qi) {
        questions.push({ el: qEl, index: qi });
      });
      examIndex.sections.push({ el: secEl, index: si, questions: questions });
    });
  }

  buildIndex();

  // ── State ──
  var state = {
    sessionActive: false,
    isTeacher: false,
    teacherUid: null,
    revealed: {},
    sectionRevealed: {}
  };
  var initialized = false;

  // ── Helpers ──
  function getQKey(si, qi) { return si + '-' + qi; }

  function getAnswerBox(qEl) { return qEl.querySelector(pattern.answerBoxSel); }
  function getHintBox(qEl) { return qEl.querySelector(pattern.hintBoxSel); }
  function getAnswerBtn(qEl) { return qEl.querySelector(pattern.answerBtnSel); }
  function getHintBtn(qEl) { return qEl.querySelector(pattern.hintBtnSel); }

  // Find a question's DOM element dynamically (needed for dualscope)
  function findDOMQuestion(si, qi) {
    if (pattern.name !== 'dualscope') {
      return examIndex.sections[si] && examIndex.sections[si].questions[qi]
        ? examIndex.sections[si].questions[qi].el : null;
    }
    if (pattern.isDynamic) {
      // SPA-style: only current section is in the DOM
      var currentSi = typeof NavState !== 'undefined' ? NavState.section : -1;
      if (currentSi !== si) return null;
      var container = document.getElementById('questionsList');
      if (!container) return null;
      var cards = container.querySelectorAll('.qcard');
      return cards[qi] || null;
    }
    // All-at-once: find by section index then question index
    var sections = document.querySelectorAll('.section');
    if (!sections[si]) return null;
    var cards = sections[si].querySelectorAll('.qcard');
    return cards[qi] || null;
  }

  // Get the DOM element for a question (static ref or dynamic lookup)
  function getQEl(si, qi) {
    var sec = examIndex.sections[si];
    if (!sec) return null;
    var q = sec.questions[qi];
    if (!q) return null;
    return q.el || findDOMQuestion(si, qi);
  }

  // Get a short preview of question text for the teacher panel
  function getQuestionPreview(si, qi) {
    if (typeof grammarData !== 'undefined' && grammarData.sections[si]) {
      var q = grammarData.sections[si].questions[qi];
      if (q && q.text) {
        var t = q.text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        return t.length > 40 ? t.substring(0, 38) + '...' : t;
      }
    }
    var el = getQEl(si, qi);
    if (el) {
      var t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      return t.length > 40 ? t.substring(0, 38) + '...' : t;
    }
    return 'Q' + (qi + 1);
  }

  // Resolve a question DOM element back to {si, qi} indices
  function findQIndices(qEl) {
    if (pattern.name === 'dualscope') {
      if (pattern.isDynamic) {
        var si = typeof NavState !== 'undefined' ? NavState.section : -1;
        if (si < 0) return null;
        var container = document.getElementById('questionsList');
        if (!container) return null;
        var cards = container.querySelectorAll('.qcard');
        for (var qi = 0; qi < cards.length; qi++) {
          if (cards[qi] === qEl) return { si: si, qi: qi };
        }
        return null;
      }
      // Static dualscope: all sections rendered in DOM
      var sections = document.querySelectorAll('.section');
      for (var si = 0; si < sections.length; si++) {
        var cards = sections[si].querySelectorAll('.qcard');
        for (var qi = 0; qi < cards.length; qi++) {
          if (cards[qi] === qEl) return { si: si, qi: qi };
        }
      }
      return null;
    }
    // Non-dualscope: use examIndex el refs
    for (var s = 0; s < examIndex.sections.length; s++) {
      var sec = examIndex.sections[s];
      for (var q = 0; q < sec.questions.length; q++) {
        if (sec.questions[q].el === qEl) return { si: sec.index, qi: sec.questions[q].index };
      }
    }
    return null;
  }

  // ── Student mode: lock/unlock ──
  function lockQuestion(qEl) {
    if (!qEl) return;
    var btn = getAnswerBtn(qEl);
    var box = getAnswerBox(qEl);
    if (btn) btn.classList.add('tr-locked');
    if (box) { box.classList.remove('show'); box.classList.remove('open'); box.classList.add('tr-answer-hidden'); }
  }

  function revealQuestion(qEl) {
    if (!qEl) return;
    var btn = getAnswerBtn(qEl);
    var box = getAnswerBox(qEl);
    if (btn) btn.classList.remove('tr-locked');
    if (box) box.classList.remove('tr-answer-hidden');
  }

  // Auto-open answer box (teacher side only)
  function showAnswerBox(qEl) {
    if (!qEl) return;
    var box = getAnswerBox(qEl);
    if (box) {
      box.classList.add('show');
      box.classList.add('open');
      // Trigger Firebase answer fetch if not yet loaded
      if (!box.dataset.loaded && window.fetchAnswerForElement) {
        window.fetchAnswerForElement(qEl);
      }
    }
  }

  // Animate a collapsible block open (shared by all open paths)
  function animateOpen(block) {
    block.classList.add('open');
    if (typeof gsap !== 'undefined' && !prefersReducedMotion) {
      gsap.fromTo(block, { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
      var items = block.querySelectorAll('.vocab-item, .hint-item, .ans-box > *');
      if (items.length > 1) {
        gsap.from(items, { opacity: 0, x: -10, stagger: 0.05, duration: 0.3, ease: 'power2.out', delay: 0.1 });
      }
    }
  }

  // Open all collapsibles (vocab, hint, answer) on teacher's card
  function openAllCollapsibles(qEl) {
    if (!qEl) return;
    if (pattern.name === 'dualscope') {
      ['vocab', 'hint', 'answer'].forEach(function(type) {
        var block = qEl.querySelector('.collapsible[data-type="' + type + '"]');
        if (block && !block.classList.contains('open')) {
          animateOpen(block);
        }
      });
      if (window.fetchAnswerForElement) {
        window.fetchAnswerForElement(qEl);
      }
    } else {
      showAnswerBox(qEl);
    }
  }

  function unlockAll() {
    if (pattern.name === 'dualscope') {
      applyLocksToVisibleDOM(true);
      return;
    }
    examIndex.sections.forEach(function(sec) {
      sec.questions.forEach(function(q) {
        var btn = getAnswerBtn(q.el);
        var box = getAnswerBox(q.el);
        if (btn) btn.classList.remove('tr-locked');
        if (box) box.classList.remove('tr-answer-hidden');
      });
    });
  }

  function lockAllQuestions() {
    if (state.isTeacher) return;
    if (pattern.name === 'dualscope') {
      applyLocksToVisibleDOM(false);
      return;
    }
    examIndex.sections.forEach(function(sec) {
      sec.questions.forEach(function(q) {
        var key = getQKey(sec.index, q.index);
        if (!state.revealed[key]) lockQuestion(q.el);
      });
    });
  }

  // Apply lock state to all currently visible DOM questions (dualscope)
  function applyLocksToVisibleDOM(unlockAll) {
    if (pattern.isDynamic) {
      var si = typeof NavState !== 'undefined' ? NavState.section : -1;
      if (si < 0) return;
      var container = document.getElementById('questionsList');
      if (!container) return;
      var cards = container.querySelectorAll('.qcard');
      for (var qi = 0; qi < cards.length; qi++) {
        if (unlockAll || state.revealed[getQKey(si, qi)]) {
          revealQuestion(cards[qi]);
        } else {
          lockQuestion(cards[qi]);
        }
      }
    } else {
      var sections = document.querySelectorAll('.section');
      for (var si = 0; si < sections.length; si++) {
        var qCards = sections[si].querySelectorAll('.qcard');
        for (var qi = 0; qi < qCards.length; qi++) {
          if (unlockAll || state.revealed[getQKey(si, qi)]) {
            revealQuestion(qCards[qi]);
          } else {
            lockQuestion(qCards[qi]);
          }
        }
      }
    }
  }

  // ── Capture-phase click interceptor ──
  document.addEventListener('click', function(e) {
    var t = e.target;
    var isAnswerBtn = t.classList.contains('answer-btn') || t.classList.contains('ans-btn') ||
      (t.classList.contains('toggle-btn') && t.classList.contains('answer'));
    if (!isAnswerBtn) return;

    var qEl = t.closest(pattern.questionSel);
    if (!qEl) return;

    // Normal mode (no session): open vocab + hint alongside answer
    if (!state.sessionActive) {
      if (pattern.name === 'dualscope') {
        var ansBlock = qEl.querySelector(pattern.answerBoxSel);
        if (ansBlock && !ansBlock.classList.contains('open')) {
          ['vocab', 'hint'].forEach(function(type) {
            var block = qEl.querySelector('.collapsible[data-type="' + type + '"]');
            if (block && !block.classList.contains('open')) {
              animateOpen(block);
            }
          });
        }
      }
      return; // Let inline toggle() handle the answer itself
    }

    if (state.isTeacher) {
      var indices = findQIndices(qEl);
      if (indices) {
        var key = getQKey(indices.si, indices.qi);
        // Reveal to students (Firebase write) — only on first click
        if (!state.revealed[key]) {
          state.revealed[key] = true;
          var updates = {};
          updates['sections/' + indices.si + '/questions/' + indices.qi + '/revealed'] = true;
          examRef.update(updates).catch(function(e) { showToast('Error: ' + e.message); });
          if (panelEl) {
            var panelQBtn = panelEl.querySelector('.tr-btn-q[data-section="' + indices.si + '"][data-question="' + indices.qi + '"]');
            if (panelQBtn) panelQBtn.classList.add('revealed');
          }
        }
        // Open all 3 if answer is currently closed; let toggle close if open
        var ansBlock = qEl.querySelector(pattern.answerBoxSel);
        if (ansBlock && !ansBlock.classList.contains('open')) {
          openAllCollapsibles(qEl);
          e.stopImmediatePropagation();
          e.preventDefault();
          return;
        }
      }
      return; // Answer is open → let click propagate so toggle() closes it
    }

    // Student: check if revealed
    var revealed = false;

    if (pattern.name === 'dualscope') {
      var indices = findQIndices(qEl);
      if (indices) revealed = !!state.revealed[getQKey(indices.si, indices.qi)];
    } else {
      examIndex.sections.forEach(function(sec) {
        sec.questions.forEach(function(q) {
          if (q.el === qEl && state.revealed[getQKey(sec.index, q.index)]) revealed = true;
        });
      });
    }

    if (!revealed) {
      e.stopImmediatePropagation();
      e.preventDefault();
      showToast('先生が解答を公開するまでお待ちください');
    }
  }, true);

  // ── Toast ──
  var toastEl = null;
  var toastTimer = null;

  function showToast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'tr-toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    clearTimeout(toastTimer);
    if (typeof gsap !== 'undefined' && !prefersReducedMotion) {
      gsap.killTweensOf(toastEl);
      toastEl.classList.add('show');
      gsap.fromTo(toastEl, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
      toastTimer = setTimeout(function() {
        gsap.to(toastEl, { opacity: 0, y: 20, duration: 0.3, ease: 'power2.in', onComplete: function() {
          toastEl.classList.remove('show');
          gsap.set(toastEl, { clearProps: 'all' });
        }});
      }, TOAST_DURATION_MS);
    } else {
      toastEl.classList.remove('show');
      void toastEl.offsetWidth;
      toastEl.classList.add('show');
      toastTimer = setTimeout(function() { toastEl.classList.remove('show'); }, TOAST_DURATION_MS);
    }
  }

  // ── Firebase listeners (student) ──
  function startStudentListener() {
    examRef.child('activeSession').on('value', function(snap) {
      try {
        var wasActive = state.sessionActive;
        state.sessionActive = !!snap.val();

        if (state.sessionActive && !state.isTeacher) {
          lockAllQuestions();
          showSessionBadge();
          document.dispatchEvent(new CustomEvent('tr:session-start'));
        } else if (!state.sessionActive && wasActive) {
          unlockAll();
          state.revealed = {};
          state.sectionRevealed = {};
          hideSessionBadge();
          showToast('練習セッション終了 — 自習モードに戻りました');
          document.dispatchEvent(new CustomEvent('tr:session-end'));
        }
      } catch (e) {
        console.error('[teacher-reveal] activeSession listener error:', e);
      }
    });

    examRef.child('sections').on('value', function(snap) {
      try {
        if (!state.sessionActive || state.isTeacher) return;
        var sections = snap.val();
        if (!sections) return;

        Object.keys(sections).forEach(function(si) {
          var sec = sections[si];
          if (!sec) return;
          var secIdx = parseInt(si);

          if (sec.revealAll && !state.sectionRevealed[si]) {
            state.sectionRevealed[si] = true;
            if (examIndex.sections[secIdx]) {
              examIndex.sections[secIdx].questions.forEach(function(q) {
                var key = getQKey(secIdx, q.index);
                if (!state.revealed[key]) {
                  state.revealed[key] = true;
                  var qEl = getQEl(secIdx, q.index);
                  revealQuestion(qEl);
                  document.dispatchEvent(new CustomEvent('tr:question-revealed', { detail: { si: secIdx, qi: q.index } }));
                }
              });
            }
          }

          if (sec.questions) {
            Object.keys(sec.questions).forEach(function(qi) {
              var qData = sec.questions[qi];
              var qIdx = parseInt(qi);
              var key = getQKey(secIdx, qIdx);
              if (qData && qData.revealed) {
                if (state.revealed[key]) return;
                state.revealed[key] = true;
                var qEl = getQEl(secIdx, qIdx);
                revealQuestion(qEl);
                document.dispatchEvent(new CustomEvent('tr:question-revealed', { detail: { si: secIdx, qi: qIdx } }));
              } else if (qData && !qData.revealed && state.revealed[key]) {
                // Teacher re-locked this question
                state.revealed[key] = false;
                var qEl = getQEl(secIdx, qIdx);
                lockQuestion(qEl);
              }
            });
          }
        });
      } catch (e) {
        console.error('[teacher-reveal] sections listener error:', e);
      }
    });

    examRef.child('revealAll').on('value', function(snap) {
      try {
        if (!state.sessionActive || state.isTeacher) return;
        if (snap.val() === true) {
          examIndex.sections.forEach(function(sec) {
            sec.questions.forEach(function(q) {
              var key = getQKey(sec.index, q.index);
              if (!state.revealed[key]) {
                state.revealed[key] = true;
                var qEl = getQEl(sec.index, q.index);
                revealQuestion(qEl);
                document.dispatchEvent(new CustomEvent('tr:question-revealed', { detail: { si: sec.index, qi: q.index } }));
              }
            });
          });
        }
      } catch (e) {
        console.error('[teacher-reveal] revealAll listener error:', e);
      }
    });
  }

  // ── Session badge ──
  var badgeEl = null;

  function showSessionBadge() {
    if (state.isTeacher) return;
    if (!badgeEl) {
      badgeEl = document.createElement('div');
      badgeEl.className = 'tr-session-badge';
      badgeEl.textContent = '授業モード';
      badgeEl.style.cursor = 'pointer';
      badgeEl.onclick = function() { teacherLogin(); };
      document.body.appendChild(badgeEl);
    }
    badgeEl.style.display = '';
    var loginBtn = document.querySelector('.tr-login-btn');
    if (loginBtn) loginBtn.style.display = 'none';
  }

  function hideSessionBadge() {
    if (badgeEl) badgeEl.style.display = 'none';
    var loginBtn = document.querySelector('.tr-login-btn');
    if (loginBtn) loginBtn.style.display = '';
  }

  // ── Login button ──
  function createLoginButton() {
    var btn = document.createElement('button');
    btn.className = 'tr-login-btn';
    btn.textContent = 'Teacher Login';
    btn.onclick = function() { teacherLogin(); };
    var topNavRight = document.querySelector('.top-nav-right');
    if (topNavRight) {
      btn.classList.add('tr-login-btn--nav');
      topNavRight.appendChild(btn);
    } else {
      document.body.appendChild(btn);
    }
    return btn;
  }

  // ── Teacher login (popup-first, redirect fallback) ──
  function teacherLogin() {
    var loginBtn = document.querySelector('.tr-login-btn');
    if (loginBtn) loginBtn.classList.add('loading');

    var provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).then(function(result) {
      if (result.user) {
        handleAuthResult(result.user);
      }
    }).catch(function(err) {
      if (err.code === 'auth/popup-blocked' ||
          err.code === 'auth/popup-closed-by-user' ||
          err.code === 'auth/cancelled-popup-request') {
        showToast('\u30EA\u30C0\u30A4\u30EC\u30AF\u30C8\u3057\u307E\u3059...');
        auth.signInWithRedirect(provider);
      } else {
        if (loginBtn) loginBtn.classList.remove('loading');
        showToast('\u30ED\u30B0\u30A4\u30F3\u30A8\u30E9\u30FC: ' + err.message);
      }
    });
  }

  function handleAuthResult(user) {
    var loginBtn = document.querySelector('.tr-login-btn');
    if (user.email !== 'harashima@komagome.ed.jp') {
      if (loginBtn) loginBtn.classList.remove('loading');
      auth.signOut().catch(function() {});
      showToast('\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093');
      return;
    }
    if (state.isTeacher) return;
    state.isTeacher = true;
    state.teacherUid = user.uid;
    var loginBtn = document.querySelector('.tr-login-btn');
    if (loginBtn) loginBtn.style.display = 'none';
    if (badgeEl) badgeEl.style.display = 'none';
    showTeacherPanel();
    if (!initialized) {
      initialized = true;
      startStudentListener();
      restoreState();
      trackPresence();
      setupDynamicObserver();
    }
    showToast('\u30ED\u30B0\u30A4\u30F3\u3057\u307E\u3057\u305F: ' + user.displayName);
  }

  // ── Content shift (avoid panel overlap) ──
  function shiftContent(show) {
    var el = document.querySelector('.main-content') || document.querySelector('main');
    if (!el) el = document.body;
    if (show && window.innerWidth >= DESKTOP_BREAKPOINT) {
      var w = panelEl ? panelEl.offsetWidth : 420;
      var target = (w + PANEL_GUTTER) + 'px';
      if (typeof gsap !== 'undefined' && !prefersReducedMotion) {
        gsap.to(el, { paddingRight: target, duration: 0.3, ease: 'power2.out' });
      } else {
        el.style.paddingRight = target;
      }
    } else {
      if (typeof gsap !== 'undefined' && !prefersReducedMotion) {
        gsap.to(el, { paddingRight: '0px', duration: 0.3, ease: 'power2.out' });
      } else {
        el.style.paddingRight = '';
      }
    }
  }

  // ── Collapse / Expand ──
  var collapsedTabEl = null;

  function collapsePanel() {
    if (!panelEl) return;
    panelEl.style.display = 'none';
    shiftContent(false);
    if (!collapsedTabEl) {
      collapsedTabEl = document.createElement('button');
      collapsedTabEl.className = 'tr-collapsed-tab';
      collapsedTabEl.textContent = '\u25B6';  // ▶
      collapsedTabEl.title = 'Expand Teacher Control';
      collapsedTabEl.onclick = function() { expandPanel(); };
      document.body.appendChild(collapsedTabEl);
    }
    collapsedTabEl.style.display = '';
  }

  function expandPanel() {
    if (collapsedTabEl) collapsedTabEl.style.display = 'none';
    if (panelEl) { panelEl.style.display = ''; shiftContent(true); }
  }

  // ── Teacher panel ──
  var panelEl = null;

  function showTeacherPanel() {
    if (collapsedTabEl) collapsedTabEl.style.display = 'none';
    if (panelEl) { panelEl.style.display = ''; shiftContent(true); return; }

    panelEl = document.createElement('div');
    panelEl.className = 'tr-panel';
    buildPanelDOM(panelEl);

    // Resize handle (left edge drag)
    var resizeHandle = document.createElement('div');
    resizeHandle.className = 'tr-resize-handle';
    panelEl.appendChild(resizeHandle);
    var resizeStartX, resizeStartW;
    function onResizeMove(e) {
      var newW = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, resizeStartW + (resizeStartX - e.clientX)));
      panelEl.style.width = newW + 'px';
    }
    function onResizeUp() {
      document.removeEventListener('mousemove', onResizeMove);
      document.removeEventListener('mouseup', onResizeUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      shiftContent(true);
    }
    resizeHandle.addEventListener('mousedown', function(e) {
      resizeStartX = e.clientX;
      resizeStartW = panelEl.offsetWidth;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onResizeMove);
      document.addEventListener('mouseup', onResizeUp);
      e.preventDefault();
    });

    document.body.appendChild(panelEl);
    shiftContent(true);

    examRef.child('activeSession').on('value', function(snap) {
      updateSessionButton(!!snap.val());
    });
  }

  function buildPanelDOM(container) {
    // Header
    var header = document.createElement('div');
    header.className = 'tr-panel-header';
    var title = document.createElement('span');
    title.textContent = 'Teacher Control';
    var btnGroup = document.createElement('div');
    btnGroup.style.display = 'flex';
    btnGroup.style.alignItems = 'center';

    var collapseBtn = document.createElement('button');
    collapseBtn.className = 'tr-panel-collapse-btn';
    collapseBtn.textContent = '\u25C0';  // ◀
    collapseBtn.title = 'Collapse panel';
    collapseBtn.onclick = function() { collapsePanel(); };

    var closeBtn = document.createElement('button');
    closeBtn.className = 'tr-panel-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.onclick = function() {
      container.style.display = 'none';
      shiftContent(false);
      if (collapsedTabEl) collapsedTabEl.style.display = 'none';
      showReopenButton();
    };

    btnGroup.appendChild(collapseBtn);
    btnGroup.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(btnGroup);
    container.appendChild(header);

    // Body
    var body = document.createElement('div');
    body.className = 'tr-panel-body';

    // Session toggle
    var sessionSec = document.createElement('div');
    sessionSec.className = 'tr-panel-section';
    var sessionBtn = document.createElement('button');
    sessionBtn.className = 'tr-btn tr-btn-primary';
    sessionBtn.dataset.action = 'toggle-session';
    sessionBtn.textContent = state.sessionActive ? 'End Session' : 'Start Session';
    sessionBtn.onclick = function() {
      if (state.sessionActive) endSession();
      else startSession();
    };
    sessionSec.appendChild(sessionBtn);

    var resetBtn = document.createElement('button');
    resetBtn.className = 'tr-btn tr-btn-reset';
    resetBtn.textContent = 'Reset Responses';
    resetBtn.onclick = function() {
      if (!confirm('\u751F\u5F92\u306E\u56DE\u7B54\u3092\u30EA\u30BB\u30C3\u30C8\u3057\u307E\u3059\u304B\uFF1F')) return;
      document.dispatchEvent(new CustomEvent('tr:reset-responses'));
      showToast('\u56DE\u7B54\u3092\u30EA\u30BB\u30C3\u30C8\u3057\u307E\u3057\u305F');
    };
    sessionSec.appendChild(resetBtn);

    var cleanupBtn = document.createElement('button');
    cleanupBtn.className = 'tr-btn tr-btn-reset';
    cleanupBtn.textContent = 'Clean Up Old Data';
    cleanupBtn.onclick = function() {
      if (!confirm('\u3053\u306e\u8a66\u9a13\u306e\u56de\u7b54\u30c7\u30fc\u30bf\u3068\u30ea\u30fc\u30c0\u30fc\u30dc\u30fc\u30c9\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f')) return;
      var updates = {};
      updates['responses/' + examId] = null;
      updates['leaderboard/' + examId] = null;
      db.ref().update(updates).then(function() {
        showToast('\u30c7\u30fc\u30bf\u3092\u524a\u9664\u3057\u307e\u3057\u305f');
      }).catch(function(e) { showToast('Error: ' + e.message); });
    };
    sessionSec.appendChild(cleanupBtn);

    body.appendChild(sessionSec);

    // Section controls — row layout with Q preview
    examIndex.sections.forEach(function(sec, si) {
      var secDiv = document.createElement('div');
      secDiv.className = 'tr-panel-section tr-section-group';

      // Section header row: collapse chevron + title + ALL button
      var headerRow = document.createElement('div');
      headerRow.className = 'tr-section-header-row';

      var secToggle = document.createElement('button');
      secToggle.className = 'tr-section-toggle';
      secToggle.textContent = '\u25BC'; // ▼
      secToggle.title = 'Collapse section';
      headerRow.appendChild(secToggle);

      var secTitle = document.createElement('div');
      secTitle.className = 'tr-section-title';
      var label = (si + 1) + '';
      if (sec.el) {
        var headerText = sec.el.textContent.trim().substring(0, 24);
        if (headerText) label = headerText;
      } else if (sec.title) {
        label = sec.title.substring(0, 28);
      }
      secTitle.textContent = label;
      headerRow.appendChild(secTitle);

      var allBtn = document.createElement('button');
      allBtn.className = 'tr-btn tr-btn-section';
      allBtn.dataset.section = si;
      allBtn.textContent = 'ALL';
      allBtn.onclick = function() {
        if (state.sectionRevealed[si]) return;
        state.sectionRevealed[si] = true;
        allBtn.classList.add('revealed');
        qContainer.querySelectorAll('.tr-btn-q').forEach(function(qb) {
          qb.classList.add('revealed');
        });

        var updates = {};
        updates['sections/' + si + '/revealAll'] = true;
        if (examIndex.sections[si]) {
          examIndex.sections[si].questions.forEach(function(q) {
            state.revealed[getQKey(si, q.index)] = true;
            updates['sections/' + si + '/questions/' + q.index + '/revealed'] = true;
            openAllCollapsibles(getQEl(si, q.index));
          });
        }
        examRef.update(updates).catch(function(e) { showToast('Error: ' + e.message); });
        showToast('\u30BB\u30AF\u30B7\u30E7\u30F3 ' + (si + 1) + ' \u3092\u516C\u958B\u3057\u307E\u3057\u305F');
      };
      headerRow.appendChild(allBtn);
      secDiv.appendChild(headerRow);

      // Questions container (collapsible via section toggle)
      var qContainer = document.createElement('div');
      qContainer.className = 'tr-q-container';

      secToggle.onclick = function() {
        qContainer.classList.toggle('collapsed');
        secToggle.classList.toggle('collapsed');
      };

      sec.questions.forEach(function(q, qi) {
        // Q row: [Q button] [preview text] [answer chevron]
        var qRow = document.createElement('div');
        qRow.className = 'tr-q-row';

        var qBtn = document.createElement('button');
        qBtn.className = 'tr-btn tr-btn-q';
        qBtn.dataset.section = si;
        qBtn.dataset.question = qi;
        qBtn.textContent = 'Q' + (qi + 1);
        qBtn.onclick = function() {
          var key = getQKey(si, qi);
          var updates = {};
          if (state.revealed[key]) {
            // Un-reveal for students
            state.revealed[key] = false;
            qBtn.classList.remove('revealed');
            updates['sections/' + si + '/questions/' + qi + '/revealed'] = false;
            examRef.update(updates).catch(function(e) { showToast('Error: ' + e.message); });
            if (window.UISound) UISound.play('click');
          } else {
            // Reveal to students
            state.revealed[key] = true;
            qBtn.classList.add('revealed');
            updates['sections/' + si + '/questions/' + qi + '/revealed'] = true;
            examRef.update(updates).catch(function(e) { showToast('Error: ' + e.message); });
            openAllCollapsibles(getQEl(si, qi));
            if (window.UISound) UISound.play('reveal');
          }
        };
        qRow.appendChild(qBtn);

        var preview = document.createElement('div');
        preview.className = 'tr-q-preview';
        preview.textContent = getQuestionPreview(si, qi);
        preview.title = preview.textContent;
        qRow.appendChild(preview);

        // Answer distribution toggle chevron
        var ansToggle = document.createElement('button');
        ansToggle.className = 'tr-answer-toggle';
        ansToggle.textContent = '\u25BC'; // ▼
        ansToggle.title = 'Show student responses';
        qRow.appendChild(ansToggle);

        qContainer.appendChild(qRow);

        // Collapsible student response area
        var ansArea = document.createElement('div');
        ansArea.className = 'tr-q-answers';
        ansArea.dataset.section = si;
        ansArea.dataset.question = qi;
        qContainer.appendChild(ansArea);

        ansToggle.onclick = function() {
          ansArea.classList.toggle('open');
          ansToggle.classList.toggle('open');
        };
      });

      secDiv.appendChild(qContainer);
      body.appendChild(secDiv);
    });

    // Reveal All
    var revealSec = document.createElement('div');
    revealSec.className = 'tr-panel-section';
    var revealAllBtn = document.createElement('button');
    revealAllBtn.className = 'tr-btn tr-btn-danger';
    revealAllBtn.textContent = 'Reveal All Answers';
    revealAllBtn.onclick = function() {
      examRef.update({ revealAll: true }).catch(function(e) { showToast('Error: ' + e.message); });
      container.querySelectorAll('.tr-btn-q, .tr-btn-section').forEach(function(b) {
        b.classList.add('revealed');
      });
      examIndex.sections.forEach(function(sec) {
        sec.questions.forEach(function(q) {
          state.revealed[getQKey(sec.index, q.index)] = true;
          openAllCollapsibles(getQEl(sec.index, q.index));
        });
      });
      showToast('\u5168\u89E3\u7B54\u3092\u516C\u958B\u3057\u307E\u3057\u305F');
    };
    revealSec.appendChild(revealAllBtn);
    body.appendChild(revealSec);

    // ── Analytics section ──
    var analyticsSec = document.createElement('div');
    analyticsSec.className = 'tr-panel-section tr-analytics-section';

    var analyticsTitle = document.createElement('div');
    analyticsTitle.className = 'tr-section-title';
    analyticsTitle.textContent = 'Analytics';
    analyticsSec.appendChild(analyticsTitle);

    // Item analysis container (populated when responses exist)
    var analysisDiv = document.createElement('div');
    analysisDiv.className = 'tr-item-analysis';
    analysisDiv.id = 'trItemAnalysis';
    analyticsSec.appendChild(analysisDiv);

    // CSV Export button
    var exportBtn = document.createElement('button');
    exportBtn.className = 'tr-btn tr-btn-export';
    exportBtn.textContent = 'Export CSV';
    exportBtn.onclick = function() { exportResponsesCSV(); };
    analyticsSec.appendChild(exportBtn);

    // Refresh analytics button
    var refreshBtn = document.createElement('button');
    refreshBtn.className = 'tr-btn tr-btn-secondary';
    refreshBtn.textContent = 'Refresh Analysis';
    refreshBtn.style.marginTop = '6px';
    refreshBtn.onclick = function() { computeItemAnalysis(); };
    analyticsSec.appendChild(refreshBtn);

    body.appendChild(analyticsSec);

    // ── Leaderboard toggle (only if leaderboard.js is loaded) ──
    if (window.Leaderboard) {
      var lbSec = document.createElement('div');
      lbSec.className = 'tr-panel-section';

      var lbTitle = document.createElement('div');
      lbTitle.className = 'tr-section-title';
      lbTitle.textContent = 'Leaderboard';
      lbSec.appendChild(lbTitle);

      var lbBtn = document.createElement('button');
      lbBtn.className = 'tr-btn tr-btn-primary';
      lbBtn.dataset.action = 'toggle-leaderboard';
      lbBtn.textContent = window.Leaderboard.isActive() ? 'Stop Leaderboard' : 'Start Leaderboard';
      lbBtn.onclick = function() {
        if (window.Leaderboard.isActive()) {
          window.Leaderboard.stop();
          lbBtn.textContent = 'Start Leaderboard';
          lbBtn.classList.remove('tr-btn-danger');
          lbBtn.classList.add('tr-btn-primary');
          showToast('\u30EA\u30FC\u30C0\u30FC\u30DC\u30FC\u30C9\u3092\u505C\u6B62\u3057\u307E\u3057\u305F');
        } else {
          window.Leaderboard.start();
          lbBtn.textContent = 'Stop Leaderboard';
          lbBtn.classList.remove('tr-btn-primary');
          lbBtn.classList.add('tr-btn-danger');
          showToast('\u30EA\u30FC\u30C0\u30FC\u30DC\u30FC\u30C9\u3092\u958B\u59CB\u3057\u307E\u3057\u305F');
        }
      };
      lbSec.appendChild(lbBtn);
      body.appendChild(lbSec);
    }

    // Logout (bottom of panel, clearly labeled)
    var logoutSec = document.createElement('div');
    logoutSec.className = 'tr-panel-section tr-panel-logout';
    var logoutBtn = document.createElement('button');
    logoutBtn.className = 'tr-btn tr-btn-logout';
    logoutBtn.textContent = 'Logout';
    logoutBtn.onclick = function() {
      auth.signOut().then(function() {
        // Clean up Firebase listeners before reload
        examRef.child('activeSession').off();
        examRef.child('sections').off();
        examRef.child('revealAll').off();
        state.isTeacher = false;
        state.teacherUid = null;
        initialized = false;
        container.remove();
        panelEl = null;
        if (collapsedTabEl) { collapsedTabEl.remove(); collapsedTabEl = null; }
        if (reopenBtn) { reopenBtn.remove(); reopenBtn = null; }
        shiftContent(false);
        var loginBtn = document.querySelector('.tr-login-btn');
        if (loginBtn) loginBtn.style.display = '';
        showToast('\u30ED\u30B0\u30A2\u30A6\u30C8\u3057\u307E\u3057\u305F');
        location.reload();
      }).catch(function(e) { showToast('Error: ' + e.message); });
    };
    logoutSec.appendChild(logoutBtn);
    body.appendChild(logoutSec);

    container.appendChild(body);
  }

  function updateSessionButton(isActive) {
    if (!panelEl) return;
    var btn = panelEl.querySelector('[data-action="toggle-session"]');
    if (!btn) return;
    if (isActive) {
      btn.textContent = 'End Session';
      btn.classList.remove('tr-btn-primary');
      btn.classList.add('tr-btn-danger');
    } else {
      btn.textContent = 'Start Session';
      btn.classList.remove('tr-btn-danger');
      btn.classList.add('tr-btn-primary');
    }
  }

  // ── Reopen button ──
  var reopenBtn = null;

  function showReopenButton() {
    if (!reopenBtn) {
      reopenBtn = document.createElement('button');
      reopenBtn.className = 'tr-login-btn';
      reopenBtn.textContent = 'Panel';
      reopenBtn.onclick = function() {
        reopenBtn.style.display = 'none';
        if (panelEl) panelEl.style.display = '';
        shiftContent(true);
      };
      var topNavRight = document.querySelector('.top-nav-right');
      if (topNavRight) {
        reopenBtn.classList.add('tr-login-btn--nav');
        topNavRight.appendChild(reopenBtn);
      } else {
        reopenBtn.style.bottom = '24px';
        reopenBtn.style.top = 'auto';
        document.body.appendChild(reopenBtn);
      }
    }
    reopenBtn.style.display = '';
  }

  function resetPanelVisuals() {
    if (!panelEl) return;
    panelEl.querySelectorAll('.tr-btn-q').forEach(function(b) { b.classList.remove('revealed'); });
    panelEl.querySelectorAll('.tr-btn-section').forEach(function(b) { b.classList.remove('revealed'); });
  }

  // ── Start session ──
  // ── Item Analysis & CSV Export ──
  function computeItemAnalysis() {
    var analysisDiv = document.getElementById('trItemAnalysis');
    if (!analysisDiv) return;
    analysisDiv.textContent = '';

    var responsesRef = db.ref('responses/' + examId);
    responsesRef.once('value').then(function(snap) {
      var allResponses = snap.val();
      if (!allResponses) {
        analysisDiv.textContent = 'No responses yet.';
        return;
      }

      Object.keys(allResponses).sort().forEach(function(key) {
        var parts = key.split('-');
        var si = parseInt(parts[0]);
        var qi = parseInt(parts[1]);
        var responses = allResponses[key];
        if (!responses) return;

        var correctAnswer = null;
        if (typeof grammarData !== 'undefined' && grammarData.sections[si]) {
          correctAnswer = grammarData.sections[si].questions[qi].correctAnswer;
        }

        var total = 0;
        var correctCount = 0;
        var counts = {};
        Object.keys(responses).forEach(function(devId) {
          var answer = responses[devId].answer;
          total++;
          if (!counts[answer]) counts[answer] = 0;
          counts[answer]++;
          if (correctAnswer && answer.toLowerCase() === correctAnswer.toLowerCase()) {
            correctCount++;
          }
        });

        // Item difficulty (% correct)
        var difficulty = total > 0 ? Math.round((correctCount / total) * 100) : 0;

        // Most common wrong distractor
        var wrongDistractor = null;
        var wrongMax = 0;
        Object.keys(counts).forEach(function(answer) {
          if (correctAnswer && answer.toLowerCase() === correctAnswer.toLowerCase()) return;
          if (counts[answer] > wrongMax) {
            wrongMax = counts[answer];
            wrongDistractor = answer;
          }
        });

        var row = document.createElement('div');
        row.className = 'tr-analysis-row';

        var label = document.createElement('span');
        label.className = 'tr-analysis-label';
        label.textContent = 'S' + (si + 1) + ' Q' + (qi + 1);

        var diffEl = document.createElement('span');
        diffEl.className = 'tr-analysis-difficulty';
        diffEl.classList.add(difficulty >= 70 ? 'easy' : difficulty >= 40 ? 'medium' : 'hard');
        diffEl.textContent = difficulty + '% correct';
        diffEl.title = correctCount + '/' + total + ' correct';

        row.appendChild(label);
        row.appendChild(diffEl);

        if (wrongDistractor) {
          var distractorEl = document.createElement('span');
          distractorEl.className = 'tr-analysis-distractor';
          distractorEl.textContent = wrongDistractor.toUpperCase() + ' (' + wrongMax + ')';
          distractorEl.title = 'Most common wrong answer';
          row.appendChild(distractorEl);
        }

        analysisDiv.appendChild(row);
      });
    });
  }

  function exportResponsesCSV() {
    var responsesRef = db.ref('responses/' + examId);
    responsesRef.once('value').then(function(snap) {
      var allResponses = snap.val();
      if (!allResponses) {
        showToast('No data to export');
        return;
      }

      var rows = [['Section', 'Question', 'DeviceID', 'Answer', 'Type', 'Timestamp', 'Correct']];

      Object.keys(allResponses).sort().forEach(function(key) {
        var parts = key.split('-');
        var si = parseInt(parts[0]);
        var qi = parseInt(parts[1]);
        var responses = allResponses[key];

        var correctAnswer = null;
        if (typeof grammarData !== 'undefined' && grammarData.sections[si]) {
          correctAnswer = grammarData.sections[si].questions[qi].correctAnswer;
        }

        Object.keys(responses).forEach(function(devId) {
          var r = responses[devId];
          var isCorrect = correctAnswer ? (r.answer.toLowerCase() === correctAnswer.toLowerCase() ? 'Y' : 'N') : '';
          rows.push([
            si + 1,
            qi + 1,
            devId,
            '"' + (r.answer || '').replace(/"/g, '""') + '"',
            r.type || '',
            r.timestamp ? new Date(r.timestamp).toISOString() : '',
            isCorrect
          ]);
        });
      });

      var csv = rows.map(function(r) { return r.join(','); }).join('\n');
      var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = examId + '-responses-' + new Date().toISOString().slice(0, 10) + '.csv';
      a.click();
      URL.revokeObjectURL(url);
      showToast('CSV exported');
    });
  }

  var sessionActionPending = false;

  function startSession() {
    if (sessionActionPending) return;
    sessionActionPending = true;
    var sessionData = {
      activeSession: new Date().toISOString(),
      revealAll: false,
      sections: {}
    };
    examIndex.sections.forEach(function(sec) {
      var secData = { revealAll: false, questions: {} };
      sec.questions.forEach(function(q) {
        secData.questions[q.index] = { revealed: false };
      });
      sessionData.sections[sec.index] = secData;
    });

    examRef.set(sessionData).then(function() {
      state.sessionActive = true;
      state.revealed = {};
      state.sectionRevealed = {};
      lockAllQuestions();
      document.dispatchEvent(new CustomEvent('tr:session-start'));
      showToast('セッションを開始しました');
      resetPanelVisuals();
      sessionActionPending = false;
    }).catch(function(e) { showToast('Error: ' + e.message); sessionActionPending = false; });
  }

  // ── End session ──
  function endSession() {
    if (sessionActionPending) return;
    sessionActionPending = true;
    examRef.update({ activeSession: null }).then(function() {
      state.sessionActive = false;
      state.revealed = {};
      state.sectionRevealed = {};
      unlockAll();
      document.dispatchEvent(new CustomEvent('tr:session-end'));
      showToast('セッション終了');
      resetPanelVisuals();
      sessionActionPending = false;
    }).catch(function(e) { showToast('Error: ' + e.message); sessionActionPending = false; });
  }

  // ── Presence ──
  function trackPresence() {
    if (state.isTeacher) return;
    var connRef = examRef.child('connectedStudents').push();
    connRef.onDisconnect().remove();
    connRef.set(true).catch(function() {});
  }

  // ── Restore state on refresh ──
  function restoreState() {
    examRef.once('value', function(snap) {
      var data = snap.val();
      if (!data || !data.activeSession) return;

      // Auto-expire sessions older than 4 hours
      var sessionTime = new Date(data.activeSession).getTime();
      if (Date.now() - sessionTime > SESSION_EXPIRY_MS) {
        examRef.update({ activeSession: null }).catch(function() {});
        return;
      }

      state.sessionActive = true;
      if (!state.isTeacher) {
        lockAllQuestions();
        showSessionBadge();
        document.dispatchEvent(new CustomEvent('tr:session-start'));
      }

      if (data.revealAll) {
        examIndex.sections.forEach(function(sec) {
          sec.questions.forEach(function(q) {
            var key = getQKey(sec.index, q.index);
            state.revealed[key] = true;
            if (!state.isTeacher) {
              revealQuestion(getQEl(sec.index, q.index));
              document.dispatchEvent(new CustomEvent('tr:question-revealed', { detail: { si: sec.index, qi: q.index } }));
            }
          });
        });
        return;
      }

      if (data.sections) {
        Object.keys(data.sections).forEach(function(si) {
          var sec = data.sections[si];
          if (!sec) return;
          var secIdx = parseInt(si);

          if (sec.revealAll) {
            state.sectionRevealed[si] = true;
            if (examIndex.sections[secIdx]) {
              examIndex.sections[secIdx].questions.forEach(function(q) {
                var key = getQKey(secIdx, q.index);
                state.revealed[key] = true;
                if (!state.isTeacher) {
                  revealQuestion(getQEl(secIdx, q.index));
                  document.dispatchEvent(new CustomEvent('tr:question-revealed', { detail: { si: secIdx, qi: q.index } }));
                }
              });
            }
          } else if (sec.questions) {
            Object.keys(sec.questions).forEach(function(qi) {
              if (sec.questions[qi] && sec.questions[qi].revealed) {
                var qIdx = parseInt(qi);
                var key = getQKey(secIdx, qIdx);
                state.revealed[key] = true;
                if (!state.isTeacher) {
                  revealQuestion(getQEl(secIdx, qIdx));
                  document.dispatchEvent(new CustomEvent('tr:question-revealed', { detail: { si: secIdx, qi: qIdx } }));
                }
              }
            });
          }
        });
      }

      // Restore panel Q button visuals + open all collapsibles for teacher
      if (state.isTeacher) {
        Object.keys(state.revealed).forEach(function(key) {
          if (!state.revealed[key]) return;
          var parts = key.split('-');
          if (panelEl) {
            var panelQBtn = panelEl.querySelector('.tr-btn-q[data-section="' + parts[0] + '"][data-question="' + parts[1] + '"]');
            if (panelQBtn) panelQBtn.classList.add('revealed');
          }
          openAllCollapsibles(getQEl(parseInt(parts[0]), parseInt(parts[1])));
        });
      }
    });
  }

  // ── MutationObserver for dynamic question rendering (dualscope SPA) ──
  var trObserver = null;
  function setupDynamicObserver() {
    if (pattern.name !== 'dualscope' || !pattern.isDynamic) return;
    if (trObserver) { trObserver.disconnect(); trObserver = null; }
    var qListEl = document.getElementById('questionsList');
    if (!qListEl) return;
    var rafPending = false;
    trObserver = new MutationObserver(function() {
      try {
        if (!state.sessionActive || state.isTeacher || rafPending) return;
        rafPending = true;
        requestAnimationFrame(function() {
          rafPending = false;
          applyLocksToVisibleDOM(false);
        });
      } catch (e) {
        console.error('[teacher-reveal] observer error:', e);
      }
    });
    trObserver.observe(qListEl, { childList: true });
  }

  // ── Init ──
  function init() {
    createLoginButton();

    // Check redirect result (user just returned from Google auth)
    auth.getRedirectResult().then(function(result) {
      if (result && result.user) {
        handleAuthResult(result.user);
      }
    }).catch(function(err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        showToast('\u30ED\u30B0\u30A4\u30F3\u30A8\u30E9\u30FC: ' + err.message);
      }
    });

    // Persistent session: auto-detect returning teacher
    auth.onAuthStateChanged(function(user) {
      if (user && user.email === 'harashima@komagome.ed.jp') {
        handleAuthResult(user);
      } else if (!initialized) {
        initialized = true;
        startStudentListener();
        restoreState();
        trackPresence();
        setupDynamicObserver();
      }
    });

    // Cleanup Firebase listeners and observer on page unload
    window.addEventListener('beforeunload', function() {
      if (trObserver) { trObserver.disconnect(); trObserver = null; }
      if (examRef) {
        examRef.child('activeSession').off();
        examRef.child('sections').off();
        examRef.child('revealAll').off();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
