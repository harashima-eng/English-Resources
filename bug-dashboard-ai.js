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
      // Show the buttons once bridge is ready
      if (btn) btn.style.display = '';
      if (compareBtn) compareBtn.style.display = '';
      loadTriageHistory();
    }
  }, 1000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
