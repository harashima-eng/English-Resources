/* Teacher Reveal Module
   Real-time teacher-controlled answer reveal for exam practice sessions.
   When a teacher starts a session, student answer buttons are locked.
   The teacher reveals answers one-by-one via a floating control panel.
   No active session = normal self-study mode (transparent). */

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
    return null;
  }

  var pattern = detectPattern();
  if (!pattern) return;

  // ── Build exam index ──
  var examIndex = { sections: [] };

  function buildIndex() {
    examIndex.sections = [];
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

  // ── Student mode: lock/unlock ──
  function lockQuestion(qEl) {
    var btn = getAnswerBtn(qEl);
    var box = getAnswerBox(qEl);
    if (btn) btn.classList.add('tr-locked');
    if (box) { box.classList.remove('show'); box.classList.add('tr-answer-hidden'); }
  }

  function revealQuestion(qEl) {
    var btn = getAnswerBtn(qEl);
    var box = getAnswerBox(qEl);
    if (btn) btn.classList.remove('tr-locked');
    if (box) box.classList.remove('tr-answer-hidden');
  }

  function unlockAll() {
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
    examIndex.sections.forEach(function(sec) {
      sec.questions.forEach(function(q) {
        var key = getQKey(sec.index, q.index);
        if (!state.revealed[key]) lockQuestion(q.el);
      });
    });
  }

  // ── Capture-phase click interceptor ──
  document.addEventListener('click', function(e) {
    if (!state.sessionActive || state.isTeacher) return;
    var t = e.target;
    var isAnswerBtn = t.classList.contains('answer-btn') || t.classList.contains('ans-btn');
    if (!isAnswerBtn) return;

    var qEl = t.closest(pattern.questionSel);
    if (!qEl) return;

    var revealed = false;
    examIndex.sections.forEach(function(sec) {
      sec.questions.forEach(function(q) {
        if (q.el === qEl && state.revealed[getQKey(sec.index, q.index)]) revealed = true;
      });
    });

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
                revealQuestion(q.el);
              }
            });
          }
        }

        if (sec.questions) {
          Object.keys(sec.questions).forEach(function(qi) {
            var qData = sec.questions[qi];
            if (!qData || !qData.revealed) return;
            var key = getQKey(secIdx, parseInt(qi));
            if (state.revealed[key]) return;
            state.revealed[key] = true;
            if (examIndex.sections[secIdx]) {
              var qInfo = examIndex.sections[secIdx].questions[parseInt(qi)];
              if (qInfo) revealQuestion(qInfo.el);
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
              revealQuestion(q.el);
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

    // Listen for session state to update button
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

      var secTitle = document.createElement('div');
      secTitle.className = 'tr-section-title';
      var label = 'Section ' + (si + 1);
      if (sec.el) {
        var headerText = sec.el.textContent.trim().substring(0, 30);
        if (headerText) label = headerText;
      }
      secTitle.textContent = label;
      secDiv.appendChild(secTitle);

      var btnsDiv = document.createElement('div');
      btnsDiv.className = 'tr-q-btns';

      // Section "All" button
      var allBtn = document.createElement('button');
      allBtn.className = 'tr-btn tr-btn-section';
      allBtn.dataset.section = si;
      allBtn.textContent = 'All';
      allBtn.onclick = function() {
        if (state.sectionRevealed[si]) return;
        state.sectionRevealed[si] = true;
        allBtn.classList.add('revealed');
        btnsDiv.querySelectorAll('.tr-btn-q').forEach(function(qb) {
          qb.classList.add('revealed');
        });

        var updates = {};
        updates['sections/' + si + '/revealAll'] = true;
        if (examIndex.sections[si]) {
          examIndex.sections[si].questions.forEach(function(q) {
            state.revealed[getQKey(si, q.index)] = true;
            updates['sections/' + si + '/questions/' + q.index + '/revealed'] = true;
            revealQuestion(q.el);
          });
        }
        examRef.update(updates);
        showToast('セクション ' + (si + 1) + ' を公開しました');
      };
      btnsDiv.appendChild(allBtn);

      // Per-question buttons
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
            // Un-reveal: re-lock this question
            state.revealed[key] = false;
            qBtn.classList.remove('revealed');
            updates['sections/' + si + '/questions/' + qi + '/revealed'] = false;
            examRef.update(updates);
            if (examIndex.sections[si] && examIndex.sections[si].questions[qi]) {
              lockQuestion(examIndex.sections[si].questions[qi].el);
            }
          } else {
            // Reveal: unlock this question
            state.revealed[key] = true;
            qBtn.classList.add('revealed');
            updates['sections/' + si + '/questions/' + qi + '/revealed'] = true;
            examRef.update(updates);
            if (examIndex.sections[si] && examIndex.sections[si].questions[qi]) {
              revealQuestion(examIndex.sections[si].questions[qi].el);
            }
          }
        };
        btnsDiv.appendChild(qBtn);
      });

      secDiv.appendChild(btnsDiv);
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
          revealQuestion(q.el);
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
            revealQuestion(q.el);
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
                revealQuestion(q.el);
              });
            }
          } else if (sec.questions) {
            Object.keys(sec.questions).forEach(function(qi) {
              if (sec.questions[qi] && sec.questions[qi].revealed) {
                var key = getQKey(secIdx, parseInt(qi));
                state.revealed[key] = true;
                if (examIndex.sections[secIdx]) {
                  var qInfo = examIndex.sections[secIdx].questions[parseInt(qi)];
                  if (qInfo) revealQuestion(qInfo.el);
                }
              }
            });
          }
        });
      }
    });
  }

  // ── Init ──
  function init() {
    createLoginButton();
    startStudentListener();
    restoreState();
    trackPresence();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
