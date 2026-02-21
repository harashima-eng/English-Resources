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
  var answeredKeys = {};  // "si-qi" → true
  var iqSessionActive = false;

  // ── Score tracker DOM ──
  var scoreEl = null;
  var scoreTextEl = null;
  var scoreFillEl = null;

  function createScoreTracker() {
    scoreEl = document.createElement('div');
    scoreEl.className = 'iq-score';

    scoreTextEl = document.createElement('span');
    scoreTextEl.className = 'iq-score-text';
    updateScoreText();

    var barEl = document.createElement('div');
    barEl.className = 'iq-score-bar';
    scoreFillEl = document.createElement('div');
    scoreFillEl.className = 'iq-score-fill';
    barEl.appendChild(scoreFillEl);

    scoreEl.appendChild(scoreTextEl);
    scoreEl.appendChild(barEl);
    document.body.appendChild(scoreEl);
  }

  function updateScoreText() {
    if (!scoreTextEl) return;
    scoreTextEl.textContent = '';
    var numSpan = document.createElement('span');
    numSpan.className = 'iq-score-num';
    numSpan.textContent = score.correct + ' / ' + score.total;
    scoreTextEl.textContent = 'Score: ';
    scoreTextEl.appendChild(numSpan);
  }

  function updateScoreBar() {
    if (!scoreFillEl) return;
    var pct = score.total > 0 ? (score.correct / score.total) * 100 : 0;
    scoreFillEl.style.width = pct + '%';
  }

  function addScore(isCorrect) {
    score.answered++;
    if (isCorrect) score.correct++;
    updateScoreText();
    updateScoreBar();
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

    if (cardEl.dataset.iqEnhanced || answeredKeys[key]) return;
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
  }

  // ── Pair UI ──
  function buildPairUI(zone, q, si, qi) {
    var options = parsePairOptions(q.text);
    if (!options) return;

    var choicesDiv = document.createElement('div');
    choicesDiv.className = 'iq-choices';
    var selected = null;

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
        if (!iqSessionActive) checkBtn.disabled = false;
      };
      choicesDiv.appendChild(btn);
    });

    zone.appendChild(choicesDiv);

    var checkBtn = document.createElement('button');
    checkBtn.className = 'iq-check-btn';
    checkBtn.textContent = 'Check';
    checkBtn.disabled = true;
    if (iqSessionActive) checkBtn.style.display = 'none';
    checkBtn.onclick = function() {
      if (!selected) return;
      var isCorrect = selected === q.correctAnswer;
      if (window.UISound) UISound.play(isCorrect ? 'correct' : 'wrong');
      zone.classList.add('locked');
      checkBtn.style.display = 'none';

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

      answeredKeys[getQKey(si, qi)] = true;
      addScore(isCorrect);
    };
    zone.appendChild(checkBtn);
  }

  // ── Choice UI ──
  function buildChoiceUI(zone, q, si, qi) {
    if (!q.choices) return;
    var items = parseChoices(q.choices);
    if (items.length === 0) return;

    var choicesDiv = document.createElement('div');
    choicesDiv.className = 'iq-choices';
    var selectedLetter = null;

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
        if (!iqSessionActive) checkBtn.disabled = false;
      };
      choicesDiv.appendChild(btn);
    });

    zone.appendChild(choicesDiv);

    var checkBtn = document.createElement('button');
    checkBtn.className = 'iq-check-btn';
    checkBtn.textContent = 'Check';
    checkBtn.disabled = true;
    if (iqSessionActive) checkBtn.style.display = 'none';
    checkBtn.onclick = function() {
      if (!selectedLetter) return;
      var isCorrect = selectedLetter === q.correctAnswer;
      if (window.UISound) UISound.play(isCorrect ? 'correct' : 'wrong');
      zone.classList.add('locked');
      checkBtn.style.display = 'none';

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

      answeredKeys[getQKey(si, qi)] = true;
      addScore(isCorrect);
    };
    zone.appendChild(checkBtn);
  }

  // ── Error UI ──
  function buildErrorUI(zone, q, si, qi, cardEl) {
    var qtext = cardEl.querySelector('.qtext');
    if (!qtext) return;

    var underlines = qtext.querySelectorAll('u');
    if (underlines.length < 2) return;

    var selectedLabel = null;
    var correctionInput = null;
    var hasTextReq = !!q.correctText;

    function updateCheckState() {
      if (iqSessionActive) return;
      if (hasTextReq) {
        checkBtn.disabled = !(selectedLabel && correctionInput && correctionInput.value.trim());
      } else {
        checkBtn.disabled = !selectedLabel;
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
        if (window.UISound) UISound.play('click');
        updateCheckState();
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
      correctionInput.oninput = function() { updateCheckState(); };
      zone.appendChild(correctionInput);
    }

    var checkBtn = document.createElement('button');
    checkBtn.className = 'iq-check-btn';
    checkBtn.textContent = 'Check';
    checkBtn.disabled = true;
    if (iqSessionActive) checkBtn.style.display = 'none';
    checkBtn.onclick = function() {
      if (!selectedLabel) return;
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
      checkBtn.style.display = 'none';

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

      answeredKeys[getQKey(si, qi)] = true;
      addScore(isCorrect);
    };
    zone.appendChild(checkBtn);
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
    input.oninput = function() {
      if (!iqSessionActive) checkBtn.disabled = !input.value.trim();
    };
    zone.appendChild(input);

    var checkBtn = document.createElement('button');
    checkBtn.className = 'iq-check-btn';
    checkBtn.textContent = 'Check';
    checkBtn.disabled = true;
    if (iqSessionActive) checkBtn.style.display = 'none';
    checkBtn.onclick = function() {
      var typed = input.value.trim();
      if (!typed) return;
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

      answeredKeys[getQKey(si, qi)] = true;
      addScore(isCorrect);
    };
    zone.appendChild(checkBtn);
  }

  // ── Fill-in UI (inline blank inputs in sentence) ──
  function buildFillinUI(zone, q, si, qi, cardEl) {
    var qtext = cardEl.querySelector('.qtext');
    if (!qtext || !q.correctAnswer || !Array.isArray(q.correctAnswer)) return;

    // Replace (   ) / （　　） patterns with inline inputs
    var idx = 0;
    var blankRe = /[（(][\s\u3000]+[)）]/g;
    qtext.innerHTML = qtext.innerHTML.replace(blankRe, function() {
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
    checkBtn.className = 'iq-check-btn';
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
    inputs.forEach(function(inp) {
      inp.addEventListener('input', updateCheckState);
    });

    checkBtn.onclick = function() {
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

      answeredKeys[getQKey(si, qi)] = true;
      addScore(allCorrect);
    };
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
        answeredKeys[getQKey(si, qi)] = true;
        addScore(true);
      };

      var wrongBtn = document.createElement('button');
      wrongBtn.className = 'iq-eval-btn wrong';
      wrongBtn.textContent = 'Got it wrong';
      wrongBtn.onclick = function() {
        if (window.UISound) UISound.play('wrong');
        zone.classList.add('locked');
        evalDiv.remove();
        zone.appendChild(createFeedback(false, 'Answer: ' + q.correctAnswer));
        answeredKeys[getQKey(si, qi)] = true;
        addScore(false);
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

      answeredKeys[getQKey(si, qi)] = true;
      addScore(isCorrect);
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
  function restoreAnsweredState() {
    var cards = document.querySelectorAll('.qcard[data-si][data-qi]');
    cards.forEach(function(card) {
      var key = getQKey(card.dataset.si, card.dataset.qi);
      if (answeredKeys[key] && !card.dataset.iqEnhanced) {
        card.dataset.iqEnhanced = 'true';
        var q = getQuestionData(parseInt(card.dataset.si), parseInt(card.dataset.qi));
        if (!q || !q.type || (!q.correctAnswer && !q.correctText)) return;
        var questionDiv = card.querySelector('.qcard-question');
        if (!questionDiv) return;
        var zone = document.createElement('div');
        zone.className = 'iq-zone locked';
        var displayAnswer = Array.isArray(q.correctAnswer) ? q.correctAnswer.join(', ') : (q.correctAnswer || displayCorrectText(q.correctText));
        zone.appendChild(createFeedback(true, 'Answered. Correct answer: ' + displayAnswer));
        questionDiv.appendChild(zone);
      }
    });
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

  // ── Init ──
  function init() {
    detectExistingSession();
    createScoreTracker();
    setupTeacherRevealListeners();
    enhanceVisibleCards();
    setupObserver();

    window.addEventListener('hashchange', function() {
      setTimeout(function() {
        restoreAnsweredState();
        enhanceVisibleCards();
      }, 50);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 100);
  }
})();
