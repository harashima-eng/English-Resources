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
    } catch (e) { return []; }
  }

  function saveQueue(queue) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch (e) { /* private browsing or quota exceeded */ }
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
    } else {
      queue.push({
        examId: item.examId,
        si: item.si,
        qi: item.qi,
        questionText: item.questionText,
        wrongAnswer: item.wrongAnswer,
        correctAnswer: item.correctAnswer,
        choices: item.choices || '',
        type: item.type,
        box: 0,
        nextReview: nextReviewDate(0),
        addedAt: Date.now()
      });
    }

    saveQueue(queue);
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

      // Question text
      var qDiv = document.createElement('div');
      qDiv.className = 'sr-modal-question';
      qDiv.textContent = item.questionText || ('Q: ' + item.examId + ' S' + item.si + ' Q' + item.qi);
      body.appendChild(qDiv);

      // Choices (if available)
      if (item.choices) {
        var choicesDiv = document.createElement('div');
        choicesDiv.className = 'sr-modal-choices';
        var parts = item.choices.split(/[\u3000\t]+/);
        parts.forEach(function(part) {
          if (!part.trim()) return;
          var choiceEl = document.createElement('div');
          choiceEl.className = 'sr-modal-choice-item';
          choiceEl.textContent = part.trim();
          choicesDiv.appendChild(choiceEl);
        });
        body.appendChild(choicesDiv);
      }

      // Box level indicator
      var boxDiv = document.createElement('div');
      boxDiv.className = 'sr-modal-box';
      boxDiv.textContent = 'Box ' + (item.box + 1) + ' / ' + BOX_INTERVALS.length;
      body.appendChild(boxDiv);

      // Previous wrong answer
      var wrongDiv = document.createElement('div');
      wrongDiv.className = 'sr-modal-wrong';
      wrongDiv.textContent = 'Your answer: ' + (item.wrongAnswer || '—');
      body.appendChild(wrongDiv);

      // Reveal button
      var revealBtn = document.createElement('button');
      revealBtn.className = 'sr-modal-reveal-btn';
      revealBtn.textContent = 'Show Answer';
      revealBtn.onclick = function() {
        revealBtn.style.display = 'none';
        var ansDiv = document.createElement('div');
        ansDiv.className = 'sr-modal-answer';
        ansDiv.textContent = 'Correct: ' + (item.correctAnswer || '—');
        body.appendChild(ansDiv);

        // Self-eval buttons
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
        var focusable = modal.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])');
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
