// Bug Triage AI — Firebase AI Logic (Gemini) client-side integration
// ES Module loaded via <script type="module">
// Requires: Firebase AI Logic enabled in Firebase Console

var SDK_VER = '12.5.0';
var CDN = 'https://www.gstatic.com/firebasejs/' + SDK_VER;

var FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD-U-cS30gdz1D-p4KqoYRni9nQdnJZ_L0',
  authDomain: 'english-resources-reveal.firebaseapp.com',
  databaseURL: 'https://english-resources-reveal-default-rtdb.firebaseio.com',
  projectId: 'english-resources-reveal',
  storageBucket: 'english-resources-reveal.firebasestorage.app',
  messagingSenderId: '141460166135',
  appId: '1:141460166135:web:fae3691002f92c89ec0af2'
};

var model = null;
var MODEL_CHAIN = ['gemini-2.5-flash-lite', 'gemini-2.0-flash-lite-001'];
var activeModelName = MODEL_CHAIN[0];
var _aiMod = null;
var _ai = null;

async function initAI() {
  if (model) return true;
  try {
    var appMod = await import(CDN + '/firebase-app.js');
    _aiMod = await import(CDN + '/firebase-ai.js');

    var aiApp;
    try { aiApp = appMod.initializeApp(FIREBASE_CONFIG, 'ai-triage'); }
    catch (_) { aiApp = appMod.getApp('ai-triage'); }

    _ai = _aiMod.getAI(aiApp, { backend: new _aiMod.GoogleAIBackend() });
    model = _aiMod.getGenerativeModel(_ai, {
      model: activeModelName,
      generationConfig: { responseMimeType: 'application/json' }
    });
    return true;
  } catch (err) {
    console.error('Firebase AI Logic init failed:', err);
    return false;
  }
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
    status.textContent = 'Failed to initialize Firebase AI Logic. Enable it in your Firebase Console (Project Settings > AI Logic).';
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

    var result = await model.generateContent(prompt);
    var text = result.response.text();
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
    console.error('Full error details:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
    var msg = err.message || String(err);
    if (msg.indexOf('429') !== -1 || msg.indexOf('quota') !== -1) {
      msg = 'Gemini API quota exceeded. Check Google Cloud Console > APIs & Services that "Generative Language API" is enabled for project english-resources-reveal.';
    }
    status.textContent = 'Analysis failed: ' + msg;
    status.className = 'triage-status triage-error';
  }

  btn.disabled = false;
  btn.textContent = 'AI Analyze';
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
  if (btn) btn.addEventListener('click', runAnalysis);

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
      // Show the button once bridge is ready
      if (btn) btn.style.display = '';
      loadTriageHistory();
    }
  }, 1000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
