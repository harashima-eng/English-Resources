// Bug Triage AI — Gemini REST API integration (direct fetch, no Firebase AI SDK)
// Uses personal API key stored in localStorage to bypass school domain restrictions

var GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
var MODEL_CHAIN = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
var activeModelName = MODEL_CHAIN[0];
var _apiKey = null;

function getApiKey() {
  if (_apiKey) return _apiKey;
  _apiKey = localStorage.getItem('gemini-api-key');
  return _apiKey;
}

function setApiKey(key) {
  _apiKey = key;
  localStorage.setItem('gemini-api-key', key);
}

async function initAI() {
  var key = getApiKey();
  if (key) return true;

  key = prompt(
    'Enter your personal Gemini API key.\n\n' +
    'Get one free at: https://aistudio.google.com/apikeys\n' +
    '(Use a personal Gmail, not school account)'
  );
  if (!key || !key.trim()) return false;
  setApiKey(key.trim());
  return true;
}

async function callGemini(promptText) {
  var key = getApiKey();
  for (var i = MODEL_CHAIN.indexOf(activeModelName); i < MODEL_CHAIN.length; i++) {
    activeModelName = MODEL_CHAIN[i];
    var url = GEMINI_API + '/models/' + activeModelName + ':generateContent?key=' + key;
    var resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });

    if (resp.ok) {
      var data = await resp.json();
      return data.candidates[0].content.parts[0].text;
    }

    if (resp.status === 429 && i < MODEL_CHAIN.length - 1) {
      console.warn(activeModelName + ' returned 429, trying next model...');
      continue;
    }

    var errBody = await resp.json().catch(function() { return {}; });
    var errMsg = (errBody.error && errBody.error.message) || 'HTTP ' + resp.status;
    if (resp.status === 403) {
      errMsg = 'API key invalid or Generative Language API not enabled: ' + errMsg;
    } else if (resp.status === 429) {
      errMsg = 'All models quota exceeded. Wait a few minutes.';
    } else if (resp.status === 401) {
      localStorage.removeItem('gemini-api-key');
      _apiKey = null;
      errMsg = 'Invalid API key. Click AI Analyze again to enter a new one.';
    }
    throw new Error(errMsg);
  }
  throw new Error('All models exhausted');
}

// ── Data Preparation ──

function parseBrowser(ua) {
  if (!ua) return 'Unknown';
  if (/CriOS/i.test(ua)) return 'Chrome iOS';
  if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) return 'Chrome';
  if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
  if (/Firefox/i.test(ua)) return 'Firefox';
  if (/Edg/i.test(ua)) return 'Edge';
  return 'Other';
}

function prepareBugSummary(reports, errors) {
  var byType = {};
  var recentByType = {};
  var devices = {};
  var browsers = {};
  var exams = {};

  reports.forEach(function(r) {
    var t = r.type || 'unknown';
    byType[t] = (byType[t] || 0) + 1;

    if (!recentByType[t]) recentByType[t] = [];
    if (recentByType[t].length < 3) {
      recentByType[t].push({
        errorMsg: r.errorMsg || null,
        examId: r.examId || null,
        url: r.url || null,
        state: r.state || null
      });
    }

    if (r.deviceId) devices[r.deviceId] = true;
    browsers[parseBrowser(r.ua)] = (browsers[parseBrowser(r.ua)] || 0) + 1;
    if (r.examId) exams[r.examId] = (exams[r.examId] || 0) + 1;
  });

  var errorGroups = {};
  errors.forEach(function(e) {
    var msg = (e.msg || '?').substring(0, 100);
    if (!errorGroups[msg]) errorGroups[msg] = { count: 0 };
    errorGroups[msg].count++;
  });

  return {
    totalReports: reports.length,
    totalErrors: errors.length,
    uniqueDevices: Object.keys(devices).length,
    reportsByType: byType,
    recentExamplesByType: recentByType,
    browserDistribution: browsers,
    examDistribution: exams,
    errorGroups: errorGroups
  };
}

function buildPrompt(summary) {
  var typeList = Object.keys(summary.reportsByType)
    .sort(function(a, b) { return summary.reportsByType[b] - summary.reportsByType[a]; })
    .map(function(t) { return '  - ' + t + ': ' + summary.reportsByType[t]; })
    .join('\n');

  var errorList = Object.keys(summary.errorGroups)
    .sort(function(a, b) { return summary.errorGroups[b].count - summary.errorGroups[a].count; })
    .slice(0, 10)
    .map(function(msg) { return '  - "' + msg + '" (' + summary.errorGroups[msg].count + 'x)'; })
    .join('\n');

  var browserList = Object.keys(summary.browserDistribution)
    .sort(function(a, b) { return summary.browserDistribution[b] - summary.browserDistribution[a]; })
    .map(function(b) { return '  - ' + b + ': ' + summary.browserDistribution[b]; })
    .join('\n');

  var examList = Object.keys(summary.examDistribution)
    .sort(function(a, b) { return summary.examDistribution[b] - summary.examDistribution[a]; })
    .slice(0, 10)
    .map(function(e) { return '  - ' + e + ': ' + summary.examDistribution[e]; })
    .join('\n');

  var topTypes = Object.keys(summary.reportsByType)
    .sort(function(a, b) { return summary.reportsByType[b] - summary.reportsByType[a]; })
    .slice(0, 8);

  var examples = topTypes.map(function(type) {
    var items = summary.recentExamplesByType[type] || [];
    var itemStr = items.map(function(i) {
      var parts = [];
      if (i.errorMsg) parts.push('error: "' + i.errorMsg + '"');
      if (i.examId) parts.push('exam: ' + i.examId);
      if (i.url) parts.push('url: ' + i.url);
      if (i.state) parts.push('state: ' + JSON.stringify(i.state));
      return '    - ' + (parts.join(', ') || 'no details');
    }).join('\n');
    return '  ' + type + ' (' + summary.reportsByType[type] + 'x):\n' + itemStr;
  }).join('\n');

  return 'You are a bug triage agent analyzing bug reports from a web-based English exam platform (interactive quizzes with GSAP animations, Firebase RTDB, used by Japanese high school students on school iPads and personal devices).\n\n' +
    '## Bug Report Summary\n' +
    '- Total reports: ' + summary.totalReports + '\n' +
    '- Total JS errors: ' + summary.totalErrors + '\n' +
    '- Unique devices: ' + summary.uniqueDevices + '\n\n' +
    '## Reports by Type:\n' + typeList + '\n\n' +
    '## Top JS Error Messages:\n' + (errorList || '  (none)') + '\n\n' +
    '## Browser Distribution:\n' + browserList + '\n\n' +
    '## Top Affected Lessons:\n' + (examList || '  (none)') + '\n\n' +
    '## Recent Examples (top types):\n' + examples + '\n\n' +
    '## Instructions\n' +
    'Analyze this data and return a JSON object with:\n\n' +
    '1. **priority_groups**: Group related bug types by priority (critical/high/medium/low). Each group has:\n' +
    '   - priority, title, count, affected_devices (estimate), root_cause_hypothesis, suggested_fix, related_bug_types\n\n' +
    '2. **patterns**: Array of strings describing correlations between bug types\n\n' +
    '3. **quick_wins**: Array of strings — bugs fixable in <10 lines with specific suggestions\n\n' +
    '4. **needs_investigation**: Array of strings — issues needing more data\n\n' +
    'JSON schema:\n' +
    '{\n' +
    '  "analysis_date": "YYYY-MM-DD",\n' +
    '  "total_reports": number,\n' +
    '  "priority_groups": [{ "priority": "critical|high|medium|low", "title": "string", "count": number, "affected_devices": number, "root_cause_hypothesis": "string", "suggested_fix": "string", "related_bug_types": ["string"] }],\n' +
    '  "patterns": ["string"],\n' +
    '  "quick_wins": ["string"],\n' +
    '  "needs_investigation": ["string"]\n' +
    '}';
}

// ── Text Export ──

function triageToText(triage) {
  var lines = [];
  lines.push('AI Triage Analysis — ' + (triage.analysis_date || new Date().toISOString().split('T')[0]));
  lines.push((triage.total_reports || '?') + ' reports · ' + (triage.model || 'gemini'));
  lines.push('');

  if (triage.priority_groups && triage.priority_groups.length) {
    lines.push('## Priority Groups');
    triage.priority_groups.forEach(function(g) {
      lines.push('');
      lines.push('[' + (g.priority || 'low').toUpperCase() + '] ' + (g.title || 'Unknown'));
      lines.push('  ' + (g.count || 0) + ' reports · ~' + (g.affected_devices || '?') + ' devices');
      if (g.root_cause_hypothesis) lines.push('  Root cause: ' + g.root_cause_hypothesis);
      if (g.suggested_fix) lines.push('  Fix: ' + g.suggested_fix);
      if (g.related_bug_types && g.related_bug_types.length)
        lines.push('  Types: ' + g.related_bug_types.join(', '));
    });
    lines.push('');
  }

  ['patterns', 'quick_wins', 'needs_investigation'].forEach(function(key) {
    if (triage[key] && triage[key].length) {
      var title = key === 'quick_wins' ? 'Quick Wins'
        : key === 'needs_investigation' ? 'Needs Investigation' : 'Patterns';
      lines.push('## ' + title);
      triage[key].forEach(function(item) { lines.push('- ' + item); });
      lines.push('');
    }
  });

  return lines.join('\n');
}

// ── UI Rendering ──

function esc(s) {
  var d = document.createElement('span');
  d.textContent = String(s);
  return d.innerHTML;
}

function renderTriageResults(triage, container) {
  container.innerHTML = '';

  // Header
  var header = document.createElement('div');
  header.className = 'triage-result-header';
  var dateSpan = document.createElement('span');
  dateSpan.textContent = 'Analysis: ' + (triage.analysis_date || new Date().toISOString().split('T')[0]);
  var metaSpan = document.createElement('span');
  metaSpan.className = 'triage-meta';
  metaSpan.textContent = (triage.total_reports || '?') + ' reports \u00B7 ' + (triage.model || 'gemini');
  header.appendChild(dateSpan);
  header.appendChild(metaSpan);
  var copyBtn = document.createElement('button');
  copyBtn.textContent = 'Copy';
  copyBtn.className = 'triage-toggle-btn';
  copyBtn.addEventListener('click', function() {
    navigator.clipboard.writeText(triageToText(triage)).then(function() {
      copyBtn.textContent = 'Copied!';
      setTimeout(function() { copyBtn.textContent = 'Copy'; }, 1500);
    });
  });
  header.appendChild(copyBtn);
  container.appendChild(header);

  // Priority groups
  if (triage.priority_groups && triage.priority_groups.length > 0) {
    var sec = makeSection('Priority Groups');
    triage.priority_groups.forEach(function(g) {
      var card = document.createElement('div');
      card.className = 'triage-group triage-' + (g.priority || 'low');

      var titleRow = document.createElement('div');
      titleRow.className = 'triage-group-title';

      var badge = document.createElement('span');
      badge.className = 'triage-priority-badge';
      badge.textContent = (g.priority || 'low').toUpperCase();
      titleRow.appendChild(badge);

      var title = document.createElement('span');
      title.textContent = g.title || 'Unknown';
      titleRow.appendChild(title);

      var count = document.createElement('span');
      count.className = 'triage-count';
      count.textContent = (g.count || 0) + ' reports \u00B7 ~' + (g.affected_devices || '?') + ' devices';
      titleRow.appendChild(count);
      card.appendChild(titleRow);

      if (g.root_cause_hypothesis) {
        var rc = document.createElement('div');
        rc.className = 'triage-detail';
        rc.innerHTML = '<strong>Root cause:</strong> ' + esc(g.root_cause_hypothesis);
        card.appendChild(rc);
      }

      if (g.suggested_fix) {
        var fix = document.createElement('div');
        fix.className = 'triage-detail triage-fix';
        fix.innerHTML = '<strong>Fix:</strong> ' + esc(g.suggested_fix);
        card.appendChild(fix);
      }

      if (g.related_bug_types && g.related_bug_types.length > 0) {
        var types = document.createElement('div');
        types.className = 'triage-types';
        g.related_bug_types.forEach(function(t) {
          var span = document.createElement('span');
          span.className = 'triage-type-tag';
          span.textContent = t;
          types.appendChild(span);
        });
        card.appendChild(types);
      }

      sec.appendChild(card);
    });
    container.appendChild(sec);
  }

  // Patterns
  renderList(container, 'Patterns Detected', triage.patterns, 'triage-list');

  // Quick wins
  renderList(container, 'Quick Wins', triage.quick_wins, 'triage-list triage-quick-wins');

  // Needs investigation
  renderList(container, 'Needs Investigation', triage.needs_investigation, 'triage-list triage-investigate');
}

function makeSection(title) {
  var sec = document.createElement('div');
  sec.className = 'triage-section';
  var h3 = document.createElement('h3');
  h3.textContent = title;
  sec.appendChild(h3);
  return sec;
}

function renderList(container, title, items, className) {
  if (!items || items.length === 0) return;
  var sec = makeSection(title);
  var ul = document.createElement('ul');
  ul.className = className;
  items.forEach(function(item) {
    var li = document.createElement('li');
    li.textContent = item;
    ul.appendChild(li);
  });
  sec.appendChild(ul);
  container.appendChild(sec);
}

// ── Analysis Runner ──

async function runAnalysis() {
  var btn = document.getElementById('aiAnalyzeBtn');
  var panel = document.getElementById('triagePanel');
  var content = document.getElementById('triageContent');
  var status = document.getElementById('triageStatus');
  if (!btn || !panel) return;

  panel.style.display = 'block';
  btn.disabled = true;
  btn.textContent = 'Analyzing\u2026';
  status.textContent = 'Initializing Gemini\u2026';
  status.className = 'triage-status';
  status.style.display = 'block';
  content.innerHTML = '';

  var ready = await initAI();
  if (!ready) {
    status.textContent = 'No API key provided. Click AI Analyze to try again.';
    status.className = 'triage-status triage-error';
    btn.disabled = false;
    btn.textContent = 'AI Analyze';
    return;
  }

  var bridge = window._bugDashboard;
  if (!bridge || !bridge.isAuthenticated()) {
    status.textContent = 'Not authenticated. Sign in first.';
    status.className = 'triage-status triage-error';
    btn.disabled = false;
    btn.textContent = 'AI Analyze';
    return;
  }

  var reports = bridge.getReports();
  var errors = bridge.getErrors();

  if (reports.length === 0 && errors.length === 0) {
    status.textContent = 'No bug reports to analyze.';
    status.className = 'triage-status triage-error';
    btn.disabled = false;
    btn.textContent = 'AI Analyze';
    return;
  }

  status.textContent = 'Analyzing ' + reports.length + ' reports + ' + errors.length + ' errors with Gemini\u2026';

  try {
    var summary = prepareBugSummary(reports, errors);
    var prompt = buildPrompt(summary);

    var text = await callGemini(prompt);
    var triage = JSON.parse(text);

    triage.timestamp = Date.now();
    triage.model = activeModelName;
    triage.input_reports = reports.length;
    triage.input_errors = errors.length;

    renderTriageResults(triage, content);
    status.style.display = 'none';
    bridge.writeTriageResult(triage);
  } catch (err) {
    console.error('AI analysis failed:', err);
    status.textContent = 'Analysis failed: ' + (err.message || String(err));
    status.className = 'triage-status triage-error';
  }

  btn.disabled = false;
  btn.textContent = 'AI Analyze';
}

// ── Trend Delta Analysis (Feature C) ──

function buildDeltaPrompt(currentSummary, previousTriage) {
  var prevDate = previousTriage.analysis_date || 'unknown';
  var prevReports = previousTriage.total_reports || previousTriage.input_reports || '?';

  var prevGroups = (previousTriage.priority_groups || []).map(function(g) {
    return '  - [' + g.priority + '] ' + g.title + ' (' + g.count + ' reports)';
  }).join('\n');

  var prevPatterns = (previousTriage.patterns || []).map(function(p) {
    return '  - ' + p;
  }).join('\n');

  var prevQuickWins = (previousTriage.quick_wins || []).map(function(q) {
    return '  - ' + q;
  }).join('\n');

  var typeList = Object.keys(currentSummary.reportsByType)
    .sort(function(a, b) { return currentSummary.reportsByType[b] - currentSummary.reportsByType[a]; })
    .map(function(t) { return '  - ' + t + ': ' + currentSummary.reportsByType[t]; })
    .join('\n');

  var examList = Object.keys(currentSummary.examDistribution)
    .sort(function(a, b) { return currentSummary.examDistribution[b] - currentSummary.examDistribution[a]; })
    .slice(0, 10)
    .map(function(e) { return '  - ' + e + ': ' + currentSummary.examDistribution[e]; })
    .join('\n');

  return 'You are a bug triage agent comparing two snapshots of bug report data from a web-based English exam platform.\n\n' +
    '## Previous Triage (' + prevDate + ', ' + prevReports + ' reports)\n\n' +
    '### Priority Groups:\n' + (prevGroups || '  (none)') + '\n\n' +
    '### Patterns:\n' + (prevPatterns || '  (none)') + '\n\n' +
    '### Quick Wins:\n' + (prevQuickWins || '  (none)') + '\n\n' +
    '## Current Data (today, ' + currentSummary.totalReports + ' reports, ' + currentSummary.totalErrors + ' errors)\n\n' +
    '### Reports by Type:\n' + typeList + '\n\n' +
    '### Top Affected Lessons:\n' + (examList || '  (none)') + '\n\n' +
    '## Instructions\n' +
    'Compare the current data against the previous triage. Identify what improved, what worsened, what is new, and what was resolved.\n\n' +
    'Return a JSON object:\n' +
    '{\n' +
    '  "comparison_date": "YYYY-MM-DD (today)",\n' +
    '  "previous_date": "' + prevDate + '",\n' +
    '  "overall_trend": "improving|stable|degrading",\n' +
    '  "summary": "1-2 sentence overview",\n' +
    '  "improved": [{"title": "string", "detail": "string", "previous_count": number, "current_count": number}],\n' +
    '  "worsened": [{"title": "string", "detail": "string", "previous_count": number, "current_count": number}],\n' +
    '  "new_issues": [{"title": "string", "detail": "string", "count": number}],\n' +
    '  "resolved": [{"title": "string", "detail": "string"}]\n' +
    '}\n\n' +
    'Each array can be empty if nothing applies. Be specific about counts and root causes.';
}

function renderDeltaResults(delta, container) {
  container.innerHTML = '';

  // Header with trend badge
  var header = document.createElement('div');
  header.className = 'triage-result-header';
  var dateSpan = document.createElement('span');
  dateSpan.textContent = 'Comparing: ' + (delta.previous_date || '?') + ' \u2192 ' + (delta.comparison_date || 'today');
  header.appendChild(dateSpan);

  var trendBadge = document.createElement('span');
  trendBadge.className = 'delta-trend-badge delta-trend-' + (delta.overall_trend || 'stable');
  var trendArrow = delta.overall_trend === 'improving' ? '\u2191' : delta.overall_trend === 'degrading' ? '\u2193' : '\u2192';
  trendBadge.textContent = trendArrow + ' ' + (delta.overall_trend || 'stable').toUpperCase();
  header.appendChild(trendBadge);
  container.appendChild(header);

  // Summary
  if (delta.summary) {
    var summaryDiv = document.createElement('div');
    summaryDiv.className = 'delta-summary';
    summaryDiv.textContent = delta.summary;
    container.appendChild(summaryDiv);
  }

  // Improved
  renderDeltaList(container, 'Improved', delta.improved, 'delta-improved', function(item) {
    var text = item.title;
    if (item.previous_count !== undefined && item.current_count !== undefined) {
      text += ' (' + item.previous_count + ' \u2192 ' + item.current_count + ')';
    }
    if (item.detail) text += ' \u2014 ' + item.detail;
    return text;
  });

  // Worsened
  renderDeltaList(container, 'Worsened', delta.worsened, 'delta-worsened', function(item) {
    var text = item.title;
    if (item.previous_count !== undefined && item.current_count !== undefined) {
      text += ' (' + item.previous_count + ' \u2192 ' + item.current_count + ')';
    }
    if (item.detail) text += ' \u2014 ' + item.detail;
    return text;
  });

  // New issues
  renderDeltaList(container, 'New Issues', delta.new_issues, 'delta-new', function(item) {
    var text = item.title;
    if (item.count !== undefined) text += ' (' + item.count + ' reports)';
    if (item.detail) text += ' \u2014 ' + item.detail;
    return text;
  });

  // Resolved
  renderDeltaList(container, 'Resolved', delta.resolved, 'delta-resolved', function(item) {
    var text = item.title;
    if (item.detail) text += ' \u2014 ' + item.detail;
    return text;
  });
}

function renderDeltaList(container, title, items, className, formatter) {
  if (!items || items.length === 0) return;
  var sec = makeSection(title);
  var ul = document.createElement('ul');
  ul.className = 'triage-list ' + className;
  items.forEach(function(item) {
    var li = document.createElement('li');
    li.textContent = formatter(item);
    ul.appendChild(li);
  });
  sec.appendChild(ul);
  container.appendChild(sec);
}

async function runDeltaAnalysis() {
  var btn = document.getElementById('aiCompareBtn');
  var panel = document.getElementById('triagePanel');
  var content = document.getElementById('triageContent');
  var status = document.getElementById('triageStatus');
  if (!btn || !panel) return;

  panel.style.display = 'block';
  btn.disabled = true;
  btn.textContent = 'Comparing\u2026';
  status.textContent = 'Loading previous triage\u2026';
  status.className = 'triage-status';
  status.style.display = 'block';
  content.innerHTML = '';

  var ready = await initAI();
  if (!ready) {
    status.textContent = 'No API key provided.';
    status.className = 'triage-status triage-error';
    btn.disabled = false;
    btn.textContent = 'Compare with Previous';
    return;
  }

  var bridge = window._bugDashboard;
  if (!bridge || !bridge.isAuthenticated()) {
    status.textContent = 'Not authenticated.';
    status.className = 'triage-status triage-error';
    btn.disabled = false;
    btn.textContent = 'Compare with Previous';
    return;
  }

  // Load previous triage
  var previousTriage = null;
  try {
    previousTriage = await bridge.loadTriageForDelta();
  } catch (e) {
    // ignore
  }

  if (!previousTriage) {
    status.textContent = 'No previous triage found. Run "AI Analyze" first to create a baseline.';
    status.className = 'triage-status triage-error';
    btn.disabled = false;
    btn.textContent = 'Compare with Previous';
    return;
  }

  var reports = bridge.getReports();
  var errors = bridge.getErrors();

  if (reports.length === 0 && errors.length === 0) {
    status.textContent = 'No current bug reports to compare.';
    status.className = 'triage-status triage-error';
    btn.disabled = false;
    btn.textContent = 'Compare with Previous';
    return;
  }

  status.textContent = 'Comparing current data against triage from ' + (previousTriage.analysis_date || '?') + '\u2026';

  try {
    var summary = prepareBugSummary(reports, errors);
    var prompt = buildDeltaPrompt(summary, previousTriage);
    var text = await callGemini(prompt);
    var delta = JSON.parse(text);

    renderDeltaResults(delta, content);
    status.style.display = 'none';
  } catch (err) {
    console.error('Delta analysis failed:', err);
    status.textContent = 'Comparison failed: ' + (err.message || String(err));
    status.className = 'triage-status triage-error';
  }

  btn.disabled = false;
  btn.textContent = 'Compare with Previous';
}

// ── Natural Language Query (Feature E) ──

var nlConversation = [];
var nlDataContext = null;

async function callGeminiChat(messages, systemContext) {
  var key = getApiKey();
  var contents = messages.map(function(m) {
    return { role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.text }] };
  });

  for (var i = MODEL_CHAIN.indexOf(activeModelName); i < MODEL_CHAIN.length; i++) {
    activeModelName = MODEL_CHAIN[i];
    var url = GEMINI_API + '/models/' + activeModelName + ':generateContent?key=' + key;
    var body = {
      contents: contents,
      generationConfig: { responseMimeType: 'application/json' }
    };
    if (systemContext) {
      body.systemInstruction = { parts: [{ text: systemContext }] };
    }

    var resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (resp.ok) {
      var data = await resp.json();
      return data.candidates[0].content.parts[0].text;
    }

    if (resp.status === 429 && i < MODEL_CHAIN.length - 1) {
      console.warn(activeModelName + ' returned 429, trying next model...');
      continue;
    }

    var errBody = await resp.json().catch(function() { return {}; });
    var errMsg = (errBody.error && errBody.error.message) || 'HTTP ' + resp.status;
    if (resp.status === 429) errMsg = 'All models quota exceeded. Wait a few minutes.';
    if (resp.status === 401) {
      localStorage.removeItem('gemini-api-key');
      _apiKey = null;
      errMsg = 'Invalid API key.';
    }
    throw new Error(errMsg);
  }
  throw new Error('All models exhausted');
}

function buildNLSystemContext() {
  var bridge = window._bugDashboard;
  if (!bridge) return '';
  var reports = bridge.getReports();
  var errors = bridge.getErrors();
  var summary = prepareBugSummary(reports, errors);

  var typeNames = Object.keys(summary.reportsByType).sort();
  var examIds = Object.keys(summary.examDistribution).sort();

  var typeList = typeNames.map(function(t) { return t + ': ' + summary.reportsByType[t]; }).join(', ');
  var examList = examIds.map(function(e) { return e + ': ' + summary.examDistribution[e]; }).join(', ');
  var browserList = Object.keys(summary.browserDistribution).map(function(b) {
    return b + ': ' + summary.browserDistribution[b];
  }).join(', ');

  // Date range
  var earliest = Infinity, latest = 0;
  reports.forEach(function(r) {
    if (r.ts && r.ts < earliest) earliest = r.ts;
    if (r.ts && r.ts > latest) latest = r.ts;
  });
  var dateRange = earliest < Infinity ?
    new Date(earliest).toISOString().split('T')[0] + ' to ' + new Date(latest).toISOString().split('T')[0] :
    'unknown';

  return 'You are an AI assistant for a bug dashboard of a web-based English exam platform used by Japanese high school students.\n\n' +
    '## Current Data\n' +
    '- Total reports: ' + summary.totalReports + '\n' +
    '- Total JS errors: ' + summary.totalErrors + '\n' +
    '- Unique devices: ' + summary.uniqueDevices + '\n' +
    '- Date range: ' + dateRange + '\n' +
    '- Reports by type: ' + typeList + '\n' +
    '- Reports by exam: ' + examList + '\n' +
    '- Browser distribution: ' + browserList + '\n\n' +
    '## Available Filter Values\n' +
    '- type: ' + typeNames.join(', ') + '\n' +
    '- exam: ' + examIds.join(', ') + '\n\n' +
    '## Response Format\n' +
    'Always return JSON:\n' +
    '{"answer": "your text answer", "filters": {"type": "value_or_null", "exam": "value_or_null", "dateFrom": "YYYY-MM-DD_or_null", "dateTo": "YYYY-MM-DD_or_null", "search": "text_or_null"}}\n\n' +
    'Rules:\n' +
    '- "answer" is a helpful text response to the question\n' +
    '- "filters" should be set when the query implies filtering the table (e.g., "show me dead clicks" -> type: "dead_click")\n' +
    '- Set a filter to null to leave it unchanged, or "" to clear it\n' +
    '- If the question is conversational and does not imply filtering, set all filters to null\n' +
    '- Use exact filter values from the list above (type names and exam IDs must match exactly)';
}

async function sendNLQuery(userText) {
  var bridge = window._bugDashboard;
  var sendBtn = document.getElementById('nlSendBtn');
  var input = document.getElementById('nlInput');
  var messagesDiv = document.getElementById('nlMessages');
  if (!bridge || !sendBtn) return;

  sendBtn.disabled = true;
  input.disabled = true;

  // Render user message
  renderNLMessage('user', userText, messagesDiv);

  var ready = await initAI();
  if (!ready) {
    renderNLMessage('model', 'No API key provided. Click AI Analyze to set one.', messagesDiv);
    sendBtn.disabled = false;
    input.disabled = false;
    return;
  }

  // Build context on first message
  if (!nlDataContext) {
    nlDataContext = buildNLSystemContext();
  }

  nlConversation.push({ role: 'user', text: userText });

  // Trim to last 10 messages
  if (nlConversation.length > 10) {
    nlConversation = nlConversation.slice(-10);
  }

  try {
    var rawResponse = await callGeminiChat(nlConversation, nlDataContext);
    var parsed = JSON.parse(rawResponse);

    nlConversation.push({ role: 'model', text: rawResponse });

    // Render answer
    renderNLMessage('model', parsed.answer || rawResponse, messagesDiv);

    // Apply filters if provided
    if (parsed.filters && bridge.applyFilterValues) {
      var hasFilter = false;
      var f = parsed.filters;
      if (f.type !== null && f.type !== undefined) hasFilter = true;
      if (f.exam !== null && f.exam !== undefined) hasFilter = true;
      if (f.dateFrom !== null && f.dateFrom !== undefined) hasFilter = true;
      if (f.dateTo !== null && f.dateTo !== undefined) hasFilter = true;
      if (f.search !== null && f.search !== undefined) hasFilter = true;

      if (hasFilter) {
        bridge.applyFilterValues(parsed.filters);
        bridge.switchTab('bugs');
        document.getElementById('nlFilterBadge').style.display = 'flex';
      }
    }
  } catch (err) {
    console.error('NL query failed:', err);
    renderNLMessage('model', 'Error: ' + (err.message || String(err)), messagesDiv);
    nlConversation.push({ role: 'model', text: '{"answer":"Error occurred","filters":null}' });
  }

  sendBtn.disabled = false;
  input.disabled = false;
  input.value = '';
  input.focus();
}

function renderNLMessage(role, text, container) {
  var msg = document.createElement('div');
  msg.className = role === 'user' ? 'nl-message nl-message-user' : 'nl-message nl-message-ai';
  msg.textContent = text;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function resetNLConversation() {
  nlConversation = [];
  nlDataContext = null;
  var messagesDiv = document.getElementById('nlMessages');
  if (messagesDiv) messagesDiv.innerHTML = '';
  document.getElementById('nlFilterBadge').style.display = 'none';

  // Reset filters
  var bridge = window._bugDashboard;
  if (bridge && bridge.applyFilterValues) {
    bridge.applyFilterValues({ type: '', exam: '', dateFrom: '', dateTo: '', search: '' });
  }
}

// ── Session Reconstruction (Feature B) ──

var sessionCache = {};

function groupReportsBySession(reports) {
  var bySession = {};
  reports.forEach(function(r) {
    if (!r.sessionId) return;
    if (!bySession[r.sessionId]) {
      bySession[r.sessionId] = {
        sessionId: r.sessionId,
        deviceId: r.deviceId || '?',
        reports: [],
        startTs: Infinity,
        endTs: 0,
        reportCount: 0,
        types: {},
        examIds: {}
      };
    }
    var s = bySession[r.sessionId];
    s.reports.push(r);
    s.reportCount++;
    if ((r.ts || 0) < s.startTs) s.startTs = r.ts || 0;
    if ((r.ts || 0) > s.endTs) s.endTs = r.ts || 0;
    if (r.type) s.types[r.type] = true;
    if (r.examId) s.examIds[r.examId] = true;
  });

  return Object.keys(bySession)
    .map(function(k) {
      var s = bySession[k];
      s.types = Object.keys(s.types);
      s.examIds = Object.keys(s.examIds);
      s.reports.sort(function(a, b) { return (a.ts || 0) - (b.ts || 0); });
      return s;
    })
    .filter(function(s) { return s.reportCount >= 2; })
    .sort(function(a, b) { return b.endTs - a.endTs; });
}

function buildSessionPrompt(session) {
  var events = session.reports.slice(0, 20).map(function(r, i) {
    var time = r.ts ? new Date(r.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '?';
    var parts = ['[' + time + '] ' + (r.type || 'unknown')];
    if (r.examId) parts.push('Exam: ' + r.examId);
    if (r.errorMsg) parts.push('Error: "' + r.errorMsg + '"');
    if (r.quiz && r.quiz.si !== undefined) parts.push('Section ' + r.quiz.si + ', Q' + (r.quiz.qi !== undefined ? r.quiz.qi : '?'));
    if (r.quiz && r.quiz.mode) parts.push('Mode: ' + r.quiz.mode);
    if (r.state) {
      var stateStr = Object.keys(r.state).map(function(k) { return k + '=' + r.state[k]; }).join(', ');
      if (stateStr) parts.push('State: ' + stateStr);
    }
    // Include last 5 trace entries
    if (r.trace && r.trace.length > 0) {
      var traceLines = r.trace.slice(-5).map(function(t) {
        return '    [' + (t.ch || '?') + '] ' + (t.tag || '') + ' ' + (t.msg || '') + ' +' + (t.t || 0) + 'ms';
      });
      parts.push('\n  Trace:\n' + traceLines.join('\n'));
    }
    return parts.join(' | ');
  });

  return 'You are analyzing a single student session on a web-based English exam platform (interactive quizzes with GSAP animations, Firebase RTDB, used by Japanese high school students on school iPads).\n\n' +
    '## Session Info\n' +
    '- Device: ' + session.deviceId + '\n' +
    '- Duration: ' + new Date(session.startTs).toLocaleTimeString() + ' to ' + new Date(session.endTs).toLocaleTimeString() + '\n' +
    '- Reports: ' + session.reportCount + '\n' +
    '- Bug types: ' + session.types.join(', ') + '\n' +
    '- Exams: ' + session.examIds.join(', ') + '\n\n' +
    '## Chronological Events\n' + events.join('\n\n') + '\n\n' +
    '## Instructions\n' +
    'Reconstruct what the student likely experienced. Write a narrative, list timeline events, and assess risk.\n\n' +
    'Return JSON:\n' +
    '{\n' +
    '  "narrative": "2-3 sentence story of what happened",\n' +
    '  "events": [{"time": "HH:MM", "what_happened": "string", "severity": "info|warning|high"}],\n' +
    '  "risk_level": "high|medium|low",\n' +
    '  "risk_reason": "why this risk level",\n' +
    '  "likely_impact": "what the student experienced",\n' +
    '  "suggested_fix": "string or null"\n' +
    '}';
}

function renderSessionsTab(sessions, container) {
  container.innerHTML = '';

  if (sessions.length === 0) {
    document.getElementById('sessionsEmpty').style.display = '';
    return;
  }
  document.getElementById('sessionsEmpty').style.display = 'none';

  var table = document.createElement('table');
  table.className = 'report-table';
  var thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Device</th><th>Date</th><th>Reports</th><th>Types</th><th></th></tr>';
  table.appendChild(thead);

  var tbody = document.createElement('tbody');
  sessions.forEach(function(s) {
    var tr = document.createElement('tr');
    tr.className = 'clickable';

    var tdDevice = document.createElement('td');
    tdDevice.textContent = (s.deviceId || '?').substring(0, 12);
    tdDevice.title = s.deviceId || '';

    var tdDate = document.createElement('td');
    var d = new Date(s.endTs);
    tdDate.textContent = (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');

    var tdCount = document.createElement('td');
    tdCount.textContent = s.reportCount;
    tdCount.style.fontVariantNumeric = 'tabular-nums';

    var tdTypes = document.createElement('td');
    s.types.slice(0, 3).forEach(function(t) {
      var tag = document.createElement('span');
      tag.className = 'triage-type-tag';
      tag.textContent = t;
      tdTypes.appendChild(tag);
    });
    if (s.types.length > 3) {
      var more = document.createElement('span');
      more.className = 'triage-type-tag';
      more.textContent = '+' + (s.types.length - 3);
      tdTypes.appendChild(more);
    }

    var tdAction = document.createElement('td');
    var analyzeBtn = document.createElement('button');
    analyzeBtn.className = 'session-analyze-btn';
    analyzeBtn.textContent = 'Analyze';
    analyzeBtn.onclick = function(e) {
      e.stopPropagation();
      analyzeSession(s, tr);
    };
    tdAction.appendChild(analyzeBtn);

    tr.appendChild(tdDevice);
    tr.appendChild(tdDate);
    tr.appendChild(tdCount);
    tr.appendChild(tdTypes);
    tr.appendChild(tdAction);

    // Detail row for AI result
    var detailTr = document.createElement('tr');
    detailTr.className = 'detail-row session-detail-row';
    detailTr.dataset.sessionId = s.sessionId;
    var detailTd = document.createElement('td');
    detailTd.colSpan = 5;
    detailTr.appendChild(detailTd);

    tr.onclick = function() {
      var isOpen = detailTr.style.display === 'table-row';
      detailTr.style.display = isOpen ? 'none' : 'table-row';
      tr.classList.toggle('expanded', !isOpen);
    };

    tbody.appendChild(tr);
    tbody.appendChild(detailTr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
}

function renderSessionPanel(session, aiResult, detailTd) {
  var wrap = document.createElement('div');
  wrap.className = 'detail-content session-result';

  // Risk badge
  var riskBadge = document.createElement('span');
  riskBadge.className = 'session-risk-badge session-risk-' + (aiResult.risk_level || 'low');
  riskBadge.textContent = (aiResult.risk_level || 'low').toUpperCase() + ' RISK';
  wrap.appendChild(riskBadge);

  // Narrative
  var narrative = document.createElement('div');
  narrative.className = 'session-narrative';
  narrative.textContent = aiResult.narrative || '';
  wrap.appendChild(narrative);

  // Timeline
  if (aiResult.events && aiResult.events.length > 0) {
    var timeline = document.createElement('div');
    timeline.className = 'session-timeline';
    aiResult.events.forEach(function(evt) {
      var item = document.createElement('div');
      item.className = 'session-event session-event-' + (evt.severity || 'info');
      var dot = document.createElement('span');
      dot.className = 'session-event-dot';
      var text = document.createElement('span');
      text.textContent = (evt.time || '?') + ' \u2014 ' + (evt.what_happened || '');
      item.appendChild(dot);
      item.appendChild(text);
      timeline.appendChild(item);
    });
    wrap.appendChild(timeline);
  }

  // Impact
  if (aiResult.likely_impact) {
    var impact = document.createElement('div');
    impact.className = 'session-impact';
    impact.innerHTML = '<strong>Impact:</strong> ' + esc(aiResult.likely_impact);
    wrap.appendChild(impact);
  }

  // Risk reason
  if (aiResult.risk_reason) {
    var reason = document.createElement('div');
    reason.className = 'session-impact';
    reason.innerHTML = '<strong>Risk:</strong> ' + esc(aiResult.risk_reason);
    wrap.appendChild(reason);
  }

  // Suggested fix
  if (aiResult.suggested_fix) {
    var fix = document.createElement('div');
    fix.className = 'triage-detail triage-fix';
    fix.innerHTML = '<strong>Fix:</strong> ' + esc(aiResult.suggested_fix);
    wrap.appendChild(fix);
  }

  detailTd.innerHTML = '';
  detailTd.appendChild(wrap);
}

async function analyzeSession(session, triggerRow) {
  if (sessionCache[session.sessionId]) {
    // Show cached result
    var detailRow = triggerRow.nextElementSibling;
    if (detailRow) {
      renderSessionPanel(session, sessionCache[session.sessionId], detailRow.querySelector('td'));
      detailRow.style.display = 'table-row';
      triggerRow.classList.add('expanded');
    }
    return;
  }

  var btn = triggerRow.querySelector('.session-analyze-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Analyzing\u2026'; }

  var ready = await initAI();
  if (!ready) {
    if (btn) { btn.disabled = false; btn.textContent = 'Analyze'; }
    return;
  }

  try {
    var prompt = buildSessionPrompt(session);
    var text = await callGemini(prompt);
    var result = JSON.parse(text);
    sessionCache[session.sessionId] = result;

    var detailRow = triggerRow.nextElementSibling;
    if (detailRow) {
      renderSessionPanel(session, result, detailRow.querySelector('td'));
      detailRow.style.display = 'table-row';
      triggerRow.classList.add('expanded');
    }
  } catch (err) {
    console.error('Session analysis failed:', err);
    var detailRow = triggerRow.nextElementSibling;
    if (detailRow) {
      detailRow.querySelector('td').innerHTML = '<div class="detail-content"><span class="triage-error">Analysis failed: ' + esc(err.message || String(err)) + '</span></div>';
      detailRow.style.display = 'table-row';
    }
  }

  if (btn) { btn.disabled = false; btn.textContent = 'Analyze'; }
}

function initSessionsTab() {
  var bridge = window._bugDashboard;
  if (!bridge) return;
  var reports = bridge.getReports();
  var sessions = groupReportsBySession(reports);
  document.getElementById('sessionCount').textContent = sessions.length;
  var container = document.getElementById('sessionsContent');
  if (container) renderSessionsTab(sessions, container);
}

// Expose viewSession for the bridge
window._bugDashboardAI = {
  viewSession: function(sessionId, deviceId) {
    var bridge = window._bugDashboard;
    if (bridge && bridge.switchTab) bridge.switchTab('sessions');
    // Ensure tab is populated
    initSessionsTab();
    // Find and auto-analyze the session
    setTimeout(function() {
      var detailRow = document.querySelector('.session-detail-row[data-session-id="' + sessionId + '"]');
      if (detailRow) {
        var triggerRow = detailRow.previousElementSibling;
        if (triggerRow) {
          var reports = bridge.getReports();
          var sessions = groupReportsBySession(reports);
          var session = sessions.find(function(s) { return s.sessionId === sessionId; });
          if (session) analyzeSession(session, triggerRow);
        }
      }
    }, 100);
  }
};

// ── Load Previous Triage ──

function loadTriageHistory() {
  var bridge = window._bugDashboard;
  if (!bridge) return;

  bridge.loadTriageHistory(function(snap) {
    var val = snap.val();
    if (!val) return;

    var keys = Object.keys(val);
    var latest = val[keys[keys.length - 1]];

    var content = document.getElementById('triageContent');
    var panel = document.getElementById('triagePanel');
    var status = document.getElementById('triageStatus');
    if (!content || !panel || content.hasChildNodes()) return;

    panel.style.display = 'block';
    status.style.display = 'none';
    renderTriageResults(latest, content);
  });
}

// ── Init ──

function init() {
  var btn = document.getElementById('aiAnalyzeBtn');
  if (btn) {
    btn.addEventListener('click', runAnalysis);
    var changeKey = document.createElement('a');
    changeKey.href = '#';
    changeKey.textContent = 'Change API Key';
    changeKey.style.cssText = 'font-size:12px;margin-left:10px;color:#7A9BA8';
    changeKey.addEventListener('click', function(e) {
      e.preventDefault();
      var key = prompt('Enter new Gemini API key:');
      if (key && key.trim()) setApiKey(key.trim());
    });
    btn.parentNode.insertBefore(changeKey, btn.nextSibling);
  }

  var compareBtn = document.getElementById('aiCompareBtn');
  if (compareBtn) {
    compareBtn.addEventListener('click', runDeltaAnalysis);
  }

  // NL Query panel
  var nlSendBtn = document.getElementById('nlSendBtn');
  var nlInput = document.getElementById('nlInput');
  var nlClearBtn = document.getElementById('nlClearBtn');
  var nlResetFilters = document.getElementById('nlResetFilters');

  if (nlSendBtn && nlInput) {
    nlSendBtn.addEventListener('click', function() {
      var text = nlInput.value.trim();
      if (text) sendNLQuery(text);
    });
    nlInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        var text = nlInput.value.trim();
        if (text) sendNLQuery(text);
      }
    });
  }
  if (nlClearBtn) nlClearBtn.addEventListener('click', resetNLConversation);
  if (nlResetFilters) nlResetFilters.addEventListener('click', function() {
    document.getElementById('nlFilterBadge').style.display = 'none';
    var bridge = window._bugDashboard;
    if (bridge && bridge.applyFilterValues) {
      bridge.applyFilterValues({ type: '', exam: '', dateFrom: '', dateTo: '', search: '' });
    }
  });

  // Sessions tab: init when activated
  var sessionsTabBtn = document.querySelector('.tab-btn[data-tab="sessions"]');
  if (sessionsTabBtn) {
    sessionsTabBtn.addEventListener('click', function() {
      initSessionsTab();
    });
  }

  var toggle = document.getElementById('triageToggle');
  if (toggle) {
    toggle.addEventListener('click', function() {
      var body = document.getElementById('triageBody');
      if (!body) return;
      var hidden = body.style.display === 'none';
      body.style.display = hidden ? '' : 'none';
      toggle.textContent = hidden ? 'Hide' : 'Show';
    });
  }

  // Wait for auth bridge, then load history
  var attempts = 0;
  var check = setInterval(function() {
    attempts++;
    if (attempts > 30) { clearInterval(check); return; }
    if (window._bugDashboard && window._bugDashboard.isAuthenticated()) {
      clearInterval(check);
      // Show the buttons/panels once bridge is ready
      if (btn) btn.style.display = '';
      if (compareBtn) compareBtn.style.display = '';
      var nlPanel = document.getElementById('nlPanel');
      if (nlPanel) nlPanel.style.display = '';
      loadTriageHistory();
    }
  }, 1000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
