/* Spaced Repetition Review Queue
   Leitner box system for wrong-answer review.
   Wrong answers are saved to localStorage with increasing review intervals.
   Box 1: review after 1 day
   Box 2: review after 3 days
   Box 3: review after 7 days
   Box 4: review after 14 days
   Box 5: review after 30 days (mastered after correct at box 5)

   Listens for 'iq:wrong-answer' events from interactive-quiz.js.
   Provides a review UI on home pages. */

(function() {
  'use strict';

  var STORAGE_KEY = 'iq-spaced-review';
  var BOX_INTERVALS = [1, 3, 7, 14, 30]; // days per box level (0-indexed)

  // ── Data management ──
  function loadQueue() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) { if (window.IQDebug) window.IQDebug.log('error', 'loadQueue', e.message); return []; }
  }

  function saveQueue(queue) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch (e) { if (window.IQDebug) window.IQDebug.log('error', 'saveQueue', e.message); }
  }

  function addToQueue(item) {
    var queue = loadQueue();
    // Check if already exists (same examId + si + qi)
    var existing = queue.findIndex(function(q) {
      return q.examId === item.examId && q.si === item.si && q.qi === item.qi;
    });

    if (existing !== -1) {
      // Reset to box 0 (got it wrong again)
      queue[existing].box = 0;
      queue[existing].nextReview = nextReviewDate(0);
      queue[existing].wrongAnswer = item.wrongAnswer;
      queue[existing].choices = item.choices || queue[existing].choices || '';
      if (item.correctText) queue[existing].correctText = item.correctText;
    } else {
      queue.push({
        examId: item.examId,
        si: item.si,
        qi: item.qi,
        questionText: item.questionText,
        wrongAnswer: item.wrongAnswer,
        correctAnswer: item.correctAnswer,
        correctText: item.correctText || '',
        choices: item.choices || '',
        type: item.type,
        box: 0,
        nextReview: nextReviewDate(0),
        addedAt: Date.now()
      });
    }

    saveQueue(queue);
    if (window.IQDebug) window.IQDebug.log('state', 'reviewQueue', 'add ' + item.examId + ' s' + item.si + 'q' + item.qi);
    updateBadge();
  }

  function nextReviewDate(box) {
    var days = BOX_INTERVALS[Math.min(box, BOX_INTERVALS.length - 1)];
    return Date.now() + days * 24 * 60 * 60 * 1000;
  }

  function getDueItems() {
    var queue = loadQueue();
    var now = Date.now();
    return queue.filter(function(item) {
      return item.nextReview <= now;
    });
  }

  function promoteItem(examId, si, qi) {
    var queue = loadQueue();
    var item = queue.find(function(q) {
      return q.examId === examId && q.si === si && q.qi === qi;
    });
    if (!item) return;

    if (item.box >= BOX_INTERVALS.length - 1) {
      // Mastered — remove from queue
      queue = queue.filter(function(q) {
        return !(q.examId === examId && q.si === si && q.qi === qi);
      });
    } else {
      item.box++;
      item.nextReview = nextReviewDate(item.box);
    }

    saveQueue(queue);
    if (window.IQDebug) window.IQDebug.log('state', 'reviewQueue', 'promote ' + examId + ' box=' + (item.box !== undefined ? item.box : 'mastered'));
    updateBadge();
  }

  function demoteItem(examId, si, qi) {
    var queue = loadQueue();
    var item = queue.find(function(q) {
      return q.examId === examId && q.si === si && q.qi === qi;
    });
    if (!item) return;

    item.box = 0;
    item.nextReview = nextReviewDate(0);

    saveQueue(queue);
    updateBadge();
  }

  // ── Listen for wrong answers from interactive-quiz ──
  document.addEventListener('iq:wrong-answer', function(e) {
    var d = e.detail;
    if (!d || !d.examId) return;
    if (window.IQDebug) window.IQDebug.log('event', 'spaced-review', 'iq:wrong-answer ' + d.examId);
    addToQueue(d);
  });

  // ── Badge: show due item count ──
  var badgeEl = null;

  function updateBadge() {
    var dueCount = getDueItems().length;
    if (!badgeEl) return;
    if (dueCount > 0) {
      badgeEl.textContent = dueCount;
      badgeEl.style.display = '';
    } else {
      badgeEl.style.display = 'none';
    }
  }

  // ── Review button on home view ──
  function createReviewButton() {
    var homeView = document.querySelector('.view-home');
    if (!homeView) return;

    var due = getDueItems();
    var totalQueue = loadQueue().length;

    if (totalQueue === 0) return;

    var container = document.createElement('div');
    container.className = 'sr-review-container';

    var btn = document.createElement('button');
    btn.className = 'sr-review-btn';
    btn.setAttribute('aria-live', 'polite');

    if (due.length > 0) {
      btn.textContent = 'Review ' + due.length + ' item' + (due.length > 1 ? 's' : '') + ' due today';
      btn.classList.add('sr-review-btn--due');
    } else {
      btn.textContent = totalQueue + ' item' + (totalQueue > 1 ? 's' : '') + ' in review queue';
      btn.classList.add('sr-review-btn--none');
      btn.disabled = true;
    }

    btn.onclick = function() {
      showReviewModal(getDueItems());
    };

    // Badge
    badgeEl = document.createElement('span');
    badgeEl.className = 'sr-review-badge';
    if (due.length > 0) {
      badgeEl.textContent = due.length;
    } else {
      badgeEl.style.display = 'none';
    }
    btn.appendChild(badgeEl);

    container.appendChild(btn);
    var cta = homeView.querySelector('.home-cta');
    if (cta) {
      cta.parentNode.insertBefore(container, cta.nextSibling);
    } else {
      homeView.appendChild(container);
    }
  }

  // ── Review Modal ──
  function showReviewModal(items) {
    if (items.length === 0) return;

    var currentIdx = 0;

    var previousFocus = document.activeElement;

    var overlay = document.createElement('div');
    overlay.className = 'sr-modal-overlay';

    var modal = document.createElement('div');
    modal.className = 'sr-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Spaced review');

    var header = document.createElement('div');
    header.className = 'sr-modal-header';

    var title = document.createElement('span');
    title.className = 'sr-modal-title';
    title.textContent = 'Review';

    var counter = document.createElement('span');
    counter.className = 'sr-modal-counter';
    counter.setAttribute('aria-live', 'polite');

    var closeBtn = document.createElement('button');
    closeBtn.className = 'sr-modal-close';
    closeBtn.textContent = '\u2715';
    closeBtn.setAttribute('aria-label', 'Close review');
    closeBtn.onclick = function() {
      overlay.remove();
      updateBadge();
      if (previousFocus) previousFocus.focus();
    };

    header.appendChild(title);
    header.appendChild(counter);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    var body = document.createElement('div');
    body.className = 'sr-modal-body';
    modal.appendChild(body);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function renderItem() {
      if (currentIdx >= items.length) {
        // All done
        body.textContent = '';
        var done = document.createElement('div');
        done.className = 'sr-modal-done';
        done.textContent = 'All items reviewed!';
        body.appendChild(done);
        counter.textContent = '';
        return;
      }

      var item = items[currentIdx];
      counter.textContent = (currentIdx + 1) + ' / ' + items.length;
      body.textContent = '';

      // Choices — fallback to grammarData if item was saved before choices were added
      var choices = item.choices;
      if (!choices && typeof grammarData !== 'undefined') {
        var sec = grammarData.sections[item.si];
        var q = sec && sec.questions[item.qi];
        if (q) {
          choices = q.choices || '';
          if (!choices && item.type === 'error' && q.text) {
            var um = q.text.match(/<u[^>]*>([^<]+)<\/u>/g);
            if (um) choices = um.map(function(s) { return s.replace(/<\/?u[^>]*>/g, ''); }).join('\u3000');
          }
        }
      }

      // Safe HTML parser for <u> and <br> tags
      function appendSafe(src, dest) {
        src.childNodes.forEach(function(node) {
          if (node.nodeType === 3) { dest.appendChild(document.createTextNode(node.textContent)); }
          else if (node.nodeType === 1 && (node.tagName === 'U' || node.tagName === 'BR')) {
            var el = document.createElement(node.tagName.toLowerCase());
            appendSafe(node, el);
            dest.appendChild(el);
          } else { appendSafe(node, dest); }
        });
      }
      var rawText = item.questionText || ('Q: ' + item.examId + ' S' + item.si + ' Q' + item.qi);
      var tempDoc = new DOMParser().parseFromString(rawText, 'text/html');

      if (item.type === 'choice' && choices) {
        // ── Interactive card (matches normal .qcard layout) ──

        var card = document.createElement('div');
        card.className = 'qcard sr-review-card';

        var questionArea = document.createElement('div');
        questionArea.className = 'qcard-question';

        var qnum = document.createElement('span');
        qnum.className = 'qnum';
        qnum.textContent = (currentIdx + 1);
        questionArea.appendChild(qnum);

        var qtext = document.createElement('div');
        qtext.className = 'qtext';
        appendSafe(tempDoc.body, qtext);
        questionArea.appendChild(qtext);

        var zone = document.createElement('div');
        zone.className = 'iq-zone';

        var choicesDiv = document.createElement('div');
        choicesDiv.className = 'iq-choices';
        var selectedLetter = null;

        var parts = choices.split(/\u3000|\t/);
        parts.forEach(function(part) {
          part = part.trim();
          if (!part) return;
          var match = part.match(/^([a-z])\.\s*(.+)/);
          if (!match) return;

          var btn = document.createElement('button');
          btn.className = 'iq-choice';
          btn.textContent = match[1] + '. ' + match[2];
          btn.dataset.letter = match[1];
          if (match[1] === item.wrongAnswer) {
            btn.classList.add('sr-prev-wrong');
          }
          btn.onclick = function() {
            if (zone.classList.contains('locked')) return;
            choicesDiv.querySelectorAll('.iq-choice').forEach(function(b) {
              b.classList.remove('selected');
            });
            btn.classList.add('selected');
            selectedLetter = match[1];
            if (window.UISound) UISound.play('select');
          };
          choicesDiv.appendChild(btn);
        });

        zone.appendChild(choicesDiv);
        questionArea.appendChild(zone);
        card.appendChild(questionArea);
        body.appendChild(card);

        // Previous wrong answer (below card)
        var metaDiv = document.createElement('div');
        metaDiv.className = 'sr-review-meta';

        var wrongDiv = document.createElement('div');
        wrongDiv.className = 'sr-modal-wrong';
        wrongDiv.textContent = 'Your answer: ' + (item.wrongAnswer || '—');
        metaDiv.appendChild(wrongDiv);

        body.appendChild(metaDiv);

        // Check button
        var checkBtn = document.createElement('button');
        checkBtn.className = 'sr-modal-reveal-btn';
        checkBtn.textContent = 'Check';
        checkBtn.onclick = function() {
          if (!selectedLetter || zone.classList.contains('locked')) return;
          zone.classList.add('locked');

          var isCorrect = selectedLetter === item.correctAnswer;

          choicesDiv.querySelectorAll('.iq-choice').forEach(function(b) {
            if (b.dataset.letter === item.correctAnswer) {
              b.classList.remove('selected');
              b.classList.add('correct');
            } else if (b.classList.contains('selected')) {
              b.classList.add('wrong');
            } else {
              b.classList.add('dimmed');
            }
          });

          if (window.UISound) UISound.play(isCorrect ? 'correct' : 'wrong');

          if (isCorrect) {
            promoteItem(item.examId, item.si, item.qi);
          } else {
            demoteItem(item.examId, item.si, item.qi);
          }

          checkBtn.style.display = 'none';

          var resultDiv = document.createElement('div');
          resultDiv.className = 'sr-modal-answer';
          resultDiv.textContent = isCorrect ? 'Correct!' : 'Incorrect. Answer: ' + (item.correctAnswer || '—');
          resultDiv.style.color = isCorrect ? '#16A34A' : '#DC2626';
          body.appendChild(resultDiv);

          var nextBtn = document.createElement('button');
          nextBtn.className = 'sr-modal-reveal-btn';
          nextBtn.textContent = currentIdx < items.length - 1 ? 'Next' : 'Done';
          nextBtn.onclick = function() {
            currentIdx++;
            renderItem();
          };
          body.appendChild(nextBtn);
        };
        body.appendChild(checkBtn);

      } else if (item.type === 'error' && choices) {
        // ── Error: select error part + type correction ──

        var card = document.createElement('div');
        card.className = 'qcard sr-review-card';

        var questionArea = document.createElement('div');
        questionArea.className = 'qcard-question';

        var qnum = document.createElement('span');
        qnum.className = 'qnum';
        qnum.textContent = (currentIdx + 1);
        questionArea.appendChild(qnum);

        var qtext = document.createElement('div');
        qtext.className = 'qtext';
        appendSafe(tempDoc.body, qtext);
        questionArea.appendChild(qtext);

        var zone = document.createElement('div');
        zone.className = 'iq-zone';

        // Choice buttons for selecting error part
        var choicesDiv = document.createElement('div');
        choicesDiv.className = 'iq-choices';
        var selectedLabel = null;
        var prevWrongLabel = null;
        try { var pw = JSON.parse(item.wrongAnswer); prevWrongLabel = pw && pw.label; } catch(e) {}

        var parts = choices.split(/\u3000|\t/);
        parts.forEach(function(part) {
          part = part.trim();
          if (!part) return;
          var match = part.match(/^([a-z])\.\s*(.+)/);
          if (!match) return;

          var btn = document.createElement('button');
          btn.className = 'iq-choice';
          if (match[1] === prevWrongLabel) {
            btn.classList.add('sr-prev-wrong');
          }
          btn.textContent = match[1] + '. ' + match[2];
          btn.dataset.letter = match[1];
          btn.onclick = function() {
            if (zone.classList.contains('locked')) return;
            choicesDiv.querySelectorAll('.iq-choice').forEach(function(b) {
              b.classList.remove('selected');
            });
            btn.classList.add('selected');
            selectedLabel = match[1];
            if (window.UISound) UISound.play('select');
          };
          choicesDiv.appendChild(btn);
        });
        zone.appendChild(choicesDiv);

        // Correction text input (if correctText is available)
        var hasTextReq = !!item.correctText;
        var corrInput = null;
        if (hasTextReq) {
          var hintLabel = document.createElement('div');
          hintLabel.className = 'iq-scramble-label';
          hintLabel.textContent = 'Type the correct form';
          zone.appendChild(hintLabel);

          corrInput = document.createElement('input');
          corrInput.type = 'text';
          corrInput.className = 'iq-correction-input';
          var uMatch = rawText.match(/<u>([^<]+)<\/u>/);
          corrInput.placeholder = uMatch ? uMatch[1] + ' → ...' : 'Your answer...';
          zone.appendChild(corrInput);
        }

        questionArea.appendChild(zone);
        card.appendChild(questionArea);
        body.appendChild(card);

        // Previous wrong answer (parse JSON if needed)
        var metaDiv = document.createElement('div');
        metaDiv.className = 'sr-review-meta';
        var wrongDiv = document.createElement('div');
        wrongDiv.className = 'sr-modal-wrong';
        var wrongDisplay = '—';
        try {
          var parsed = JSON.parse(item.wrongAnswer);
          if (parsed && parsed.label) {
            wrongDisplay = 'Selected: ' + parsed.label;
            if (parsed.correctionText) wrongDisplay += ', typed: ' + parsed.correctionText;
          } else {
            wrongDisplay = item.wrongAnswer || '—';
          }
        } catch(e) {
          wrongDisplay = item.wrongAnswer || '—';
        }
        wrongDiv.textContent = 'Your answer: ' + wrongDisplay;
        metaDiv.appendChild(wrongDiv);
        body.appendChild(metaDiv);

        var checkBtn = document.createElement('button');
        checkBtn.className = 'sr-modal-reveal-btn';
        checkBtn.textContent = 'Check';
        checkBtn.onclick = function() {
          if (!selectedLabel || zone.classList.contains('locked')) return;
          if (hasTextReq && corrInput && !corrInput.value.trim()) return;
          zone.classList.add('locked');

          var labelCorrect = selectedLabel === item.correctAnswer;
          var textCorrect = true;
          if (hasTextReq && corrInput) {
            var typed = corrInput.value.trim();
            var alts = item.correctText.split('/').map(function(s) { return s.trim().toLowerCase(); });
            textCorrect = alts.indexOf(typed.toLowerCase()) !== -1;
            corrInput.disabled = true;
          }
          var isCorrect = labelCorrect && textCorrect;

          choicesDiv.querySelectorAll('.iq-choice').forEach(function(b) {
            if (b.dataset.letter === item.correctAnswer) {
              b.classList.remove('selected');
              b.classList.add('correct');
            } else if (b.classList.contains('selected')) {
              b.classList.add('wrong');
            } else {
              b.classList.add('dimmed');
            }
          });

          if (window.UISound) UISound.play(isCorrect ? 'correct' : 'wrong');

          if (isCorrect) {
            promoteItem(item.examId, item.si, item.qi);
          } else {
            demoteItem(item.examId, item.si, item.qi);
          }

          checkBtn.style.display = 'none';

          var msg = isCorrect ? 'Correct!' : 'Incorrect. Answer: ' + item.correctAnswer;
          if (!isCorrect && hasTextReq) msg += ' → ' + item.correctText;
          var resultDiv = document.createElement('div');
          resultDiv.className = 'sr-modal-answer';
          resultDiv.textContent = msg;
          resultDiv.style.color = isCorrect ? '#16A34A' : '#DC2626';
          body.appendChild(resultDiv);

          var nextBtn = document.createElement('button');
          nextBtn.className = 'sr-modal-reveal-btn';
          nextBtn.textContent = currentIdx < items.length - 1 ? 'Next' : 'Done';
          nextBtn.onclick = function() { currentIdx++; renderItem(); };
          body.appendChild(nextBtn);
        };
        body.appendChild(checkBtn);

        if (corrInput) setTimeout(function() { corrInput.focus(); }, 50);

      } else if (item.type === 'correction' || item.type === 'fillin' || (item.type === 'error' && !choices)) {
        // ── Correction / Fillin (+ error fallback without choices): text input + auto-check ──

        var card = document.createElement('div');
        card.className = 'qcard sr-review-card';

        var questionArea = document.createElement('div');
        questionArea.className = 'qcard-question';

        var qnum = document.createElement('span');
        qnum.className = 'qnum';
        qnum.textContent = (currentIdx + 1);
        questionArea.appendChild(qnum);

        var qtext = document.createElement('div');
        qtext.className = 'qtext';
        appendSafe(tempDoc.body, qtext);
        questionArea.appendChild(qtext);

        var zone = document.createElement('div');
        zone.className = 'iq-zone';

        var hintLabel = document.createElement('div');
        hintLabel.className = 'iq-scramble-label';
        hintLabel.textContent = 'Type the correct form';
        zone.appendChild(hintLabel);

        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'iq-correction-input';
        // Extract <u> word for placeholder hint
        var uMatch = rawText.match(/<u>([^<]+)<\/u>/);
        input.placeholder = uMatch ? uMatch[1] + ' → ...' : 'Your answer...';
        zone.appendChild(input);

        questionArea.appendChild(zone);
        card.appendChild(questionArea);
        body.appendChild(card);

        // Previous wrong answer
        var metaDiv = document.createElement('div');
        metaDiv.className = 'sr-review-meta';
        var wrongDiv = document.createElement('div');
        wrongDiv.className = 'sr-modal-wrong';
        var wrongDisplay = item.wrongAnswer || '—';
        if (item.type === 'error') {
          try {
            var pw = JSON.parse(item.wrongAnswer);
            if (pw && pw.label) {
              wrongDisplay = pw.label;
              if (pw.correctionText) wrongDisplay += ' → ' + pw.correctionText;
            }
          } catch(e) {}
        }
        wrongDiv.textContent = 'Your answer: ' + wrongDisplay;
        metaDiv.appendChild(wrongDiv);
        body.appendChild(metaDiv);

        var checkBtn = document.createElement('button');
        checkBtn.className = 'sr-modal-reveal-btn';
        checkBtn.textContent = 'Check';

        var correctionAnswered = false;
        function checkCorrectionAnswer() {
          if (correctionAnswered) return;
          var typed = input.value.trim();
          if (!typed) return;
          correctionAnswered = true;
          input.disabled = true;

          // Support alternatives separated by /
          var correct = String(item.type === 'error' && item.correctText ? item.correctText : (item.correctAnswer || ''));
          var alternatives = correct.split('/').map(function(s) { return s.trim().toLowerCase(); });
          var isCorrect = alternatives.indexOf(typed.toLowerCase()) !== -1;

          if (window.UISound) UISound.play(isCorrect ? 'correct' : 'wrong');

          if (isCorrect) {
            promoteItem(item.examId, item.si, item.qi);
          } else {
            demoteItem(item.examId, item.si, item.qi);
          }

          checkBtn.style.display = 'none';

          var resultDiv = document.createElement('div');
          resultDiv.className = 'sr-modal-answer';
          var answerDisplay = item.type === 'error' && item.correctText
            ? item.correctAnswer + ' → ' + item.correctText
            : (item.correctAnswer || '—');
          resultDiv.textContent = isCorrect ? 'Correct!' : 'Incorrect. Answer: ' + answerDisplay;
          resultDiv.style.color = isCorrect ? '#16A34A' : '#DC2626';
          body.appendChild(resultDiv);

          var nextBtn = document.createElement('button');
          nextBtn.className = 'sr-modal-reveal-btn';
          nextBtn.textContent = currentIdx < items.length - 1 ? 'Next' : 'Done';
          nextBtn.onclick = function() { currentIdx++; renderItem(); };
          body.appendChild(nextBtn);
        }

        checkBtn.onclick = checkCorrectionAnswer;
        input.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') checkCorrectionAnswer();
        });
        body.appendChild(checkBtn);

        setTimeout(function() { input.focus(); }, 50);

      } else if (item.type === 'scramble') {
        // ── Scramble: word chips + auto-check ──

        var card = document.createElement('div');
        card.className = 'qcard sr-review-card';

        var questionArea = document.createElement('div');
        questionArea.className = 'qcard-question';

        var qnum = document.createElement('span');
        qnum.className = 'qnum';
        qnum.textContent = (currentIdx + 1);
        questionArea.appendChild(qnum);

        var qtext = document.createElement('div');
        qtext.className = 'qtext';
        appendSafe(tempDoc.body, qtext);
        questionArea.appendChild(qtext);

        var zone = document.createElement('div');
        zone.className = 'iq-zone';

        // Answer drop zone
        var answerZone = document.createElement('div');
        answerZone.className = 'sr-scramble-answer';
        zone.appendChild(answerZone);

        // Word pool (shuffled)
        var correctWords = String(item.correctAnswer || '').split(/\s+/);
        var shuffled = correctWords.slice();
        for (var i = shuffled.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
        }

        var placed = [];
        var chipButtons = [];

        var pool = document.createElement('div');
        pool.className = 'sr-scramble-pool';

        shuffled.forEach(function(word, idx) {
          var chip = document.createElement('button');
          chip.className = 'sr-scramble-chip';
          chip.textContent = word;
          chip.dataset.idx = idx;
          chip.onclick = function() {
            if (chip.classList.contains('used') || zone.classList.contains('locked')) return;
            chip.classList.add('used');
            placed.push({ word: word, chipIdx: idx });
            renderPlaced();
            if (window.UISound) UISound.play('select');
          };
          chipButtons.push(chip);
          pool.appendChild(chip);
        });

        zone.appendChild(pool);
        questionArea.appendChild(zone);
        card.appendChild(questionArea);
        body.appendChild(card);

        function renderPlaced() {
          answerZone.textContent = '';
          placed.forEach(function(p, pIdx) {
            var el = document.createElement('span');
            el.className = 'sr-scramble-placed';
            el.textContent = p.word;
            el.onclick = function() {
              if (zone.classList.contains('locked')) return;
              chipButtons[p.chipIdx].classList.remove('used');
              placed.splice(pIdx, 1);
              renderPlaced();
            };
            answerZone.appendChild(el);
          });
        }

        // Previous wrong answer
        var metaDiv = document.createElement('div');
        metaDiv.className = 'sr-review-meta';
        var wrongDiv = document.createElement('div');
        wrongDiv.className = 'sr-modal-wrong';
        wrongDiv.textContent = 'Your answer: ' + (item.wrongAnswer || '—');
        metaDiv.appendChild(wrongDiv);
        body.appendChild(metaDiv);

        var checkBtn = document.createElement('button');
        checkBtn.className = 'sr-modal-reveal-btn';
        checkBtn.textContent = 'Check';
        checkBtn.onclick = function() {
          if (placed.length === 0 || zone.classList.contains('locked')) return;
          zone.classList.add('locked');

          var answer = placed.map(function(p) { return p.word; }).join(' ');
          var isCorrect = answer.toLowerCase() === String(item.correctAnswer || '').toLowerCase();

          if (window.UISound) UISound.play(isCorrect ? 'correct' : 'wrong');

          if (isCorrect) {
            promoteItem(item.examId, item.si, item.qi);
          } else {
            demoteItem(item.examId, item.si, item.qi);
          }

          checkBtn.style.display = 'none';

          var resultDiv = document.createElement('div');
          resultDiv.className = 'sr-modal-answer';
          resultDiv.textContent = isCorrect ? 'Correct!' : 'Correct order: ' + (item.correctAnswer || '—');
          resultDiv.style.color = isCorrect ? '#16A34A' : '#DC2626';
          body.appendChild(resultDiv);

          var nextBtn = document.createElement('button');
          nextBtn.className = 'sr-modal-reveal-btn';
          nextBtn.textContent = currentIdx < items.length - 1 ? 'Next' : 'Done';
          nextBtn.onclick = function() { currentIdx++; renderItem(); };
          body.appendChild(nextBtn);
        };
        body.appendChild(checkBtn);

      } else if (item.type === 'compose') {
        // ── Compose: text area + self-eval (can't auto-grade free text) ──

        var card = document.createElement('div');
        card.className = 'qcard sr-review-card';

        var questionArea = document.createElement('div');
        questionArea.className = 'qcard-question';

        var qnum = document.createElement('span');
        qnum.className = 'qnum';
        qnum.textContent = (currentIdx + 1);
        questionArea.appendChild(qnum);

        var qtext = document.createElement('div');
        qtext.className = 'qtext';
        appendSafe(tempDoc.body, qtext);
        questionArea.appendChild(qtext);

        var zone = document.createElement('div');
        zone.className = 'iq-zone';

        var textarea = document.createElement('textarea');
        textarea.className = 'iq-correction-input';
        textarea.rows = 3;
        textarea.placeholder = 'Write your answer...';
        textarea.style.maxWidth = '100%';
        textarea.style.resize = 'vertical';
        zone.appendChild(textarea);

        questionArea.appendChild(zone);
        card.appendChild(questionArea);
        body.appendChild(card);

        // Previous wrong answer
        var metaDiv = document.createElement('div');
        metaDiv.className = 'sr-review-meta';
        var wrongDiv = document.createElement('div');
        wrongDiv.className = 'sr-modal-wrong';
        wrongDiv.textContent = 'Your answer: ' + (item.wrongAnswer || '—');
        metaDiv.appendChild(wrongDiv);
        body.appendChild(metaDiv);

        var revealBtn = document.createElement('button');
        revealBtn.className = 'sr-modal-reveal-btn';
        revealBtn.textContent = 'Show Answer';
        revealBtn.onclick = function() {
          revealBtn.style.display = 'none';
          textarea.disabled = true;

          var ansDiv = document.createElement('div');
          ansDiv.className = 'sr-modal-answer';
          ansDiv.textContent = 'Correct: ' + (item.correctAnswer || '—');
          body.appendChild(ansDiv);

          var evalDiv = document.createElement('div');
          evalDiv.className = 'sr-modal-eval';

          var gotIt = document.createElement('button');
          gotIt.className = 'sr-modal-eval-btn sr-correct';
          gotIt.textContent = 'Got it right';
          gotIt.onclick = function() {
            promoteItem(item.examId, item.si, item.qi);
            currentIdx++;
            renderItem();
          };

          var missed = document.createElement('button');
          missed.className = 'sr-modal-eval-btn sr-wrong';
          missed.textContent = 'Got it wrong';
          missed.onclick = function() {
            demoteItem(item.examId, item.si, item.qi);
            currentIdx++;
            renderItem();
          };

          evalDiv.appendChild(gotIt);
          evalDiv.appendChild(missed);
          body.appendChild(evalDiv);
        };
        body.appendChild(revealBtn);

        setTimeout(function() { textarea.focus(); }, 50);

      } else {
        // ── Fallback: passive Show Answer + self-eval ──

        var qDiv = document.createElement('div');
        qDiv.className = 'sr-modal-question';
        appendSafe(tempDoc.body, qDiv);
        body.appendChild(qDiv);

        var wrongDiv = document.createElement('div');
        wrongDiv.className = 'sr-modal-wrong';
        wrongDiv.textContent = 'Your answer: ' + (item.wrongAnswer || '—');
        body.appendChild(wrongDiv);

        var revealBtn = document.createElement('button');
        revealBtn.className = 'sr-modal-reveal-btn';
        revealBtn.textContent = 'Show Answer';
        revealBtn.onclick = function() {
          revealBtn.style.display = 'none';
          var ansDiv = document.createElement('div');
          ansDiv.className = 'sr-modal-answer';
          ansDiv.textContent = 'Correct: ' + (item.correctAnswer || '—');
          body.appendChild(ansDiv);

          var evalDiv = document.createElement('div');
          evalDiv.className = 'sr-modal-eval';

          var gotIt = document.createElement('button');
          gotIt.className = 'sr-modal-eval-btn sr-correct';
          gotIt.textContent = 'Got it right';
          gotIt.onclick = function() {
            promoteItem(item.examId, item.si, item.qi);
            currentIdx++;
            renderItem();
          };

          var missed = document.createElement('button');
          missed.className = 'sr-modal-eval-btn sr-wrong';
          missed.textContent = 'Got it wrong';
          missed.onclick = function() {
            demoteItem(item.examId, item.si, item.qi);
            currentIdx++;
            renderItem();
          };

          evalDiv.appendChild(gotIt);
          evalDiv.appendChild(missed);
          body.appendChild(evalDiv);
        };
        body.appendChild(revealBtn);
      }
    }

    renderItem();

    // Keyboard support: Escape + focus trap
    overlay.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        overlay.remove();
        updateBadge();
        if (previousFocus) previousFocus.focus();
        return;
      }
      if (e.key === 'Tab') {
        var focusable = modal.querySelectorAll('button, input, textarea, [tabindex]:not([tabindex="-1"])');
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
    overlay.setAttribute('tabindex', '-1');
    overlay.focus();
  }

  // ── Expose for interactive-quiz.js to dispatch events ──
  window.SpacedReview = {
    getDueCount: function() { return getDueItems().length; },
    getQueueSize: function() { return loadQueue().length; }
  };

  // ── Prune old items (older than 90 days) ──
  function pruneQueue() {
    var queue = loadQueue();
    var cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    var pruned = queue.filter(function(item) {
      return (item.addedAt || item.nextReview || 0) > cutoff;
    });
    if (pruned.length < queue.length) {
      saveQueue(pruned);
    }
  }

  // ── Init ──
  function init() {
    pruneQueue();
    createReviewButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 200);
  }
})();
