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
    if (box) { box.classList.add('show'); box.classList.add('open'); }
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
      } else if (!state.sessionActive && wasActive) {
        unlockAll();
        state.revealed = {};
        state.sectionRevealed = {};
        hideSessionBadge();
        showToast('練習セッション終了 — 自習モードに戻りました');
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

  // ── Teacher login ──
  function teacherLogin() {
    var provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).then(function(result) {
      state.isTeacher = true;
      state.teacherUid = result.user.uid;
      var loginBtn = document.querySelector('.tr-login-btn');
      if (loginBtn) loginBtn.style.display = 'none';
      showTeacherPanel();
      showToast('ログインしました: ' + result.user.displayName);
    }).catch(function(err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        showToast('ログインエラー: ' + err.message);
      }
    });
  }

  // ── Teacher panel ──
  var panelEl = null;

  function showTeacherPanel() {
    if (panelEl) { panelEl.style.display = ''; return; }

    panelEl = document.createElement('div');
    panelEl.className = 'tr-panel';
    buildPanelDOM(panelEl);
    document.body.appendChild(panelEl);

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
    var closeBtn = document.createElement('button');
    closeBtn.className = 'tr-panel-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.onclick = function() {
      container.style.display = 'none';
      showReopenButton();
    };
    header.appendChild(title);
    header.appendChild(closeBtn);
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

    // Section controls
    examIndex.sections.forEach(function(sec, si) {
      var secDiv = document.createElement('div');
      secDiv.className = 'tr-panel-section tr-section-group';

      // Section header row: title + ALL button inline
      var headerRow = document.createElement('div');
      headerRow.className = 'tr-section-header-row';

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
        qGrid.querySelectorAll('.tr-btn-q').forEach(function(qb) {
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
          });
        }
        examRef.update(updates);
        showToast('セクション ' + (si + 1) + ' を公開しました');
      };
      headerRow.appendChild(allBtn);
      secDiv.appendChild(headerRow);

      // Q buttons in equal grid
      var qGrid = document.createElement('div');
      qGrid.className = 'tr-q-grid';

      sec.questions.forEach(function(q, qi) {
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
            showAnswerBox(getQEl(si, qi));
          }
        };
        qGrid.appendChild(qBtn);
      });

      secDiv.appendChild(qGrid);
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
          revealQuestion(getQEl(sec.index, q.index));
        });
      });
      showToast('全解答を公開しました');
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

      state.sessionActive = true;
      if (!state.isTeacher) {
        lockAllQuestions();
        showSessionBadge();
      }

      if (data.revealAll) {
        examIndex.sections.forEach(function(sec) {
          sec.questions.forEach(function(q) {
            var key = getQKey(sec.index, q.index);
            state.revealed[key] = true;
            revealQuestion(getQEl(sec.index, q.index));
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
              });
            }
          } else if (sec.questions) {
            Object.keys(sec.questions).forEach(function(qi) {
              if (sec.questions[qi] && sec.questions[qi].revealed) {
                var key = getQKey(secIdx, parseInt(qi));
                state.revealed[key] = true;
                revealQuestion(getQEl(secIdx, parseInt(qi)));
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
    startStudentListener();
    restoreState();
    trackPresence();
    setupDynamicObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
