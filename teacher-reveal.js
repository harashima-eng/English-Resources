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

  // ── Exam ID check ──
  var examId = document.body && document.body.dataset.examId;
  if (!examId) return;

  // ── Firebase init ──
  if (typeof firebase === 'undefined' || !window.firebaseConfig) return;
  if (!firebase.apps.length) firebase.initializeApp(window.firebaseConfig);
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

  // Open ALL toggles (answer + hint + words) on teacher reveal
  function showAllToggles(qEl) {
    if (!qEl) return;
    showAnswerBox(qEl);
    var hintBox = getHintBox(qEl);
    if (hintBox) { hintBox.classList.add('show'); hintBox.classList.add('open'); }
    var wordsBox = qEl.querySelector('.collapsible[data-type="words"]');
    if (wordsBox) { wordsBox.classList.add('show'); wordsBox.classList.add('open'); }
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
    if (!state.sessionActive || state.isTeacher) return;
    var t = e.target;
    var isAnswerBtn = t.classList.contains('answer-btn') || t.classList.contains('ans-btn') ||
      (t.classList.contains('toggle-btn') && t.classList.contains('answer'));
    if (!isAnswerBtn) return;

    var qEl = t.closest(pattern.questionSel);
    if (!qEl) return;

    var revealed = false;

    if (pattern.name === 'dualscope') {
      var si = -1, qi = -1;
      if (pattern.isDynamic) {
        si = typeof NavState !== 'undefined' ? NavState.section : -1;
        var container = document.getElementById('questionsList');
        if (container) {
          var cards = container.querySelectorAll('.qcard');
          for (var i = 0; i < cards.length; i++) {
            if (cards[i] === qEl) { qi = i; break; }
          }
        }
      } else {
        var secEl = qEl.closest('.section');
        if (secEl) {
          var secs = document.querySelectorAll('.section');
          for (var i = 0; i < secs.length; i++) if (secs[i] === secEl) { si = i; break; }
          var sCards = secEl.querySelectorAll('.qcard');
          for (var j = 0; j < sCards.length; j++) if (sCards[j] === qEl) { qi = j; break; }
        }
      }
      if (si >= 0 && qi >= 0) revealed = !!state.revealed[getQKey(si, qi)];
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
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    clearTimeout(toastTimer);
    toastEl.classList.remove('show');
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    toastTimer = setTimeout(function() { toastEl.classList.remove('show'); }, 2500);
  }

  // ── Firebase listeners (student) ──
  function startStudentListener() {
    examRef.child('activeSession').on('value', function(snap) {
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
    });

    examRef.child('sections').on('value', function(snap) {
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
    });

    examRef.child('revealAll').on('value', function(snap) {
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
    document.body.appendChild(btn);
    return btn;
  }

  // ── Teacher login (redirect-based, avoids COOP popup block) ──
  function teacherLogin() {
    var provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithRedirect(provider);
  }

  function handleAuthResult(user) {
    if (user.email !== 'harashima@komagome.ed.jp') {
      auth.signOut();
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
    if (show && window.innerWidth >= 900) {
      el.style.transition = 'padding-right 0.3s ease';
      var w = panelEl ? panelEl.offsetWidth : 420;
      el.style.paddingRight = (w + 40) + 'px';
    } else {
      el.style.paddingRight = '';
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
    var isResizing = false, resizeStartX, resizeStartW;
    resizeHandle.addEventListener('mousedown', function(e) {
      isResizing = true;
      resizeStartX = e.clientX;
      resizeStartW = panelEl.offsetWidth;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) {
      if (!isResizing) return;
      var newW = Math.min(600, Math.max(300, resizeStartW + (resizeStartX - e.clientX)));
      panelEl.style.width = newW + 'px';
    });
    document.addEventListener('mouseup', function() {
      if (!isResizing) return;
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      shiftContent(true);
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
            var qEl = getQEl(si, q.index);
            revealQuestion(qEl);
            showAllToggles(qEl);
          });
        }
        examRef.update(updates);
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
            state.revealed[key] = false;
            qBtn.classList.remove('revealed');
            updates['sections/' + si + '/questions/' + qi + '/revealed'] = false;
            examRef.update(updates);
            lockQuestion(getQEl(si, qi));
          } else {
            state.revealed[key] = true;
            qBtn.classList.add('revealed');
            updates['sections/' + si + '/questions/' + qi + '/revealed'] = true;
            examRef.update(updates);
            revealQuestion(getQEl(si, qi));
            showAllToggles(getQEl(si, qi));
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
      examRef.update({ revealAll: true });
      container.querySelectorAll('.tr-btn-q, .tr-btn-section').forEach(function(b) {
        b.classList.add('revealed');
      });
      examIndex.sections.forEach(function(sec) {
        sec.questions.forEach(function(q) {
          state.revealed[getQKey(sec.index, q.index)] = true;
          var qEl = getQEl(sec.index, q.index);
          revealQuestion(qEl);
          showAllToggles(qEl);
        });
      });
      showToast('\u5168\u89E3\u7B54\u3092\u516C\u958B\u3057\u307E\u3057\u305F');
    };
    revealSec.appendChild(revealAllBtn);
    body.appendChild(revealSec);

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
      reopenBtn.style.bottom = '24px';
      reopenBtn.style.top = 'auto';
      reopenBtn.onclick = function() {
        reopenBtn.style.display = 'none';
        if (panelEl) panelEl.style.display = '';
        shiftContent(true);
      };
      document.body.appendChild(reopenBtn);
    }
    reopenBtn.style.display = '';
  }

  // ── Start session ──
  function startSession() {
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
      if (panelEl) {
        panelEl.querySelectorAll('.tr-btn-q, .tr-btn-section').forEach(function(b) {
          b.classList.remove('revealed');
        });
      }
    });
  }

  // ── End session ──
  function endSession() {
    examRef.update({ activeSession: null }).then(function() {
      state.sessionActive = false;
      state.revealed = {};
      state.sectionRevealed = {};
      unlockAll();
      document.dispatchEvent(new CustomEvent('tr:session-end'));
      showToast('セッション終了');
      if (panelEl) {
        panelEl.querySelectorAll('.tr-btn-q, .tr-btn-section').forEach(function(b) {
          b.classList.remove('revealed');
        });
      }
    });
  }

  // ── Presence ──
  function trackPresence() {
    var connRef = examRef.child('connectedStudents').push();
    connRef.onDisconnect().remove();
    connRef.set(true);
  }

  // ── Restore state on refresh ──
  function restoreState() {
    examRef.once('value', function(snap) {
      var data = snap.val();
      if (!data || !data.activeSession) return;

      // Auto-expire sessions older than 4 hours
      var sessionTime = new Date(data.activeSession).getTime();
      if (Date.now() - sessionTime > 4 * 60 * 60 * 1000) {
        examRef.update({ activeSession: null });
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
            revealQuestion(getQEl(sec.index, q.index));
            document.dispatchEvent(new CustomEvent('tr:question-revealed', { detail: { si: sec.index, qi: q.index } }));
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
                revealQuestion(getQEl(secIdx, q.index));
                document.dispatchEvent(new CustomEvent('tr:question-revealed', { detail: { si: secIdx, qi: q.index } }));
              });
            }
          } else if (sec.questions) {
            Object.keys(sec.questions).forEach(function(qi) {
              if (sec.questions[qi] && sec.questions[qi].revealed) {
                var qIdx = parseInt(qi);
                var key = getQKey(secIdx, qIdx);
                state.revealed[key] = true;
                revealQuestion(getQEl(secIdx, qIdx));
                document.dispatchEvent(new CustomEvent('tr:question-revealed', { detail: { si: secIdx, qi: qIdx } }));
              }
            });
          }
        });
      }
    });
  }

  // ── MutationObserver for dynamic question rendering (dualscope SPA) ──
  function setupDynamicObserver() {
    if (pattern.name !== 'dualscope' || !pattern.isDynamic) return;
    var qListEl = document.getElementById('questionsList');
    if (!qListEl) return;
    new MutationObserver(function() {
      if (!state.sessionActive || state.isTeacher) return;
      applyLocksToVisibleDOM(false);
    }).observe(qListEl, { childList: true });
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
