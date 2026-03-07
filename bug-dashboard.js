(function() {
  'use strict';

  firebase.initializeApp({
    apiKey: "AIzaSyD-U-cS30gdz1D-p4KqoYRni9nQdnJZ_L0",
    authDomain: "english-resources-reveal.firebaseapp.com",
    databaseURL: "https://english-resources-reveal-default-rtdb.firebaseio.com",
    projectId: "english-resources-reveal",
    storageBucket: "english-resources-reveal.firebasestorage.app",
    messagingSenderId: "141460166135",
    appId: "1:141460166135:web:fae3691002f92c89ec0af2"
  });

  var ALLOWED_EMAIL = 'harashima@komagome.ed.jp';
  var auth = firebase.auth();
  var db = firebase.database();
  var allReports = [];
  var allErrors = [];
  var activeTab = 'bugs';
  var selectedKeys = {};
  var searchTerm = '';
  var searchTimer = null;
  var trendChart = null;
  var doughnutChart = null;
  var reportsListener = null;
  var errorsListener = null;

  var TRACE_COLORS = {
    state: '#2196F3', anim: '#FF9800', event: '#9C27B0',
    timer: '#607D8B', error: '#F44336', ui: '#E91E63', heal: '#4CAF50'
  };

  var TYPE_COLORS = {
    anim_conflict: '#E65100', stuck_animating: '#C62828',
    rapid_interaction: '#283593', state_race: '#6A1B9A',
    silent_error: '#B71C1C', blank_card: '#F57F17',
    invisible_focus_card: '#E65100', cdn_fallback: '#F9A825',
    quiz_load_failure: '#C62828', connectivity_loss: '#E65100',
    dom_missing: '#B71C1C',
    rage_click: '#E91E63', dead_click: '#78909C',
    slow_interaction: '#7B1FA2', layout_shift: '#3949AB',
    resource_load_fail: '#FF8F00'
  };

  var KNOWN_TYPES = [
    'anim_conflict', 'stuck_animating', 'rapid_interaction', 'state_race',
    'silent_error', 'blank_card', 'invisible_focus_card',
    'cdn_fallback', 'quiz_load_failure', 'connectivity_loss', 'dom_missing',
    'rage_click', 'dead_click', 'slow_interaction', 'layout_shift', 'resource_load_fail'
  ];

  var DETECTORS = [
    { name: 'Rapid Interaction', type: 'rapid_interaction', threshold: '8 taps / 800ms' },
    { name: 'Stuck Animating', type: 'stuck_animating', threshold: '>5s stuck true' },
    { name: 'State Race', type: 'state_race', threshold: '<50ms rewrite' },
    { name: 'Silent Error', type: 'silent_error', threshold: 'any error log' },
    { name: 'GSAP CDN Fallback', type: 'cdn_fallback', threshold: 'CDN load fail' },
    { name: 'Quiz Load Failure', type: 'quiz_load_failure', threshold: 'no grammarData' },
    { name: 'Connectivity Loss', type: 'connectivity_loss', threshold: '>30s disconnected' },
    { name: 'Critical DOM Missing', type: 'dom_missing', threshold: '#questionsList absent' },
    { name: 'Rage Click', type: 'rage_click', threshold: '3x same element / 1s' },
    { name: 'Dead Click', type: 'dead_click', threshold: 'non-interactive element' },
    { name: 'Slow Interaction', type: 'slow_interaction', threshold: '>300ms LoAF' },
    { name: 'Layout Shift', type: 'layout_shift', threshold: 'CLS > 0.25' },
    { name: 'Resource Load Fail', type: 'resource_load_fail', threshold: 'CSS/img/audio 404' }
  ];

  // ── Helpers ──
  function $(id) { return document.getElementById(id); }

  function esc(s) {
    var d = document.createElement('span');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function formatTime(ts) {
    if (!ts) return '?';
    var d = new Date(ts);
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function dayKey(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function parseBrowser(ua) {
    if (!ua) return 'Unknown';
    if (/CriOS/i.test(ua)) return 'Chrome iOS';
    if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) return 'Chrome';
    if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
    if (/Firefox/i.test(ua)) return 'Firefox';
    if (/Edg/i.test(ua)) return 'Edge';
    return 'Other';
  }

  // ── Theme ──
  function initTheme() {
    var saved = localStorage.getItem('dashboard-theme');
    if (saved === 'light') document.body.classList.add('light-mode');
    updateThemeIcon();
  }

  function toggleTheme() {
    document.body.classList.toggle('light-mode');
    var isLight = document.body.classList.contains('light-mode');
    localStorage.setItem('dashboard-theme', isLight ? 'light' : 'dark');
    updateThemeIcon();
    if (trendChart || doughnutChart) renderCharts();
  }

  function updateThemeIcon() {
    var btn = $('themeToggle');
    if (btn) btn.textContent = document.body.classList.contains('light-mode') ? '\u263E' : '\u2600';
  }

  // ── Auth ──
  $('loginBtn').onclick = function() {
    this.disabled = true;
    var self = this;
    var provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).then(function(result) {
      if (result.user.email !== ALLOWED_EMAIL) {
        auth.signOut();
        $('loginError').textContent = 'Permission denied. Use your school account.';
        self.disabled = false;
        return;
      }
      showDashboard(result.user);
    }).catch(function(err) {
      if (err.code === 'auth/popup-blocked') {
        auth.signInWithRedirect(provider);
      } else {
        $('loginError').textContent = err.message;
        self.disabled = false;
      }
    });
  };

  $('logoutBtn').onclick = function() {
    if (reportsListener) db.ref('bug-reports').off('value', reportsListener);
    if (errorsListener) db.ref('errors').off('value', errorsListener);
    auth.signOut();
    $('dashboard').style.display = 'none';
    $('loginScreen').style.display = 'flex';
  };

  $('pruneBtn').onclick = pruneOld;
  $('purgeAnimBtn').onclick = purgeAnimConflict;
  $('themeToggle').onclick = toggleTheme;

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.onclick = function() {
      document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      $(activeTab + 'Panel').classList.add('active');
    };
  });

  // Filters
  $('filterType').onchange = applyFilters;
  $('filterExam').onchange = applyFilters;
  $('filterFrom').onchange = applyFilters;
  $('filterTo').onchange = applyFilters;

  // Search (debounced)
  $('searchInput').oninput = function() {
    clearTimeout(searchTimer);
    var val = this.value;
    searchTimer = setTimeout(function() {
      searchTerm = val.toLowerCase().trim();
      applyFilters();
    }, 300);
  };

  // Bulk actions
  $('bulkCopy').onclick = bulkCopy;
  $('bulkDelete').onclick = bulkDelete;
  $('selectAll').onchange = function() {
    var checked = this.checked;
    document.querySelectorAll('.row-cb').forEach(function(cb) {
      cb.checked = checked;
      var key = cb.dataset.key;
      if (checked) selectedKeys[key] = true;
      else delete selectedKeys[key];
    });
    updateBulkBar();
  };

  auth.onAuthStateChanged(function(user) {
    if (user && user.email === ALLOWED_EMAIL) showDashboard(user);
  });

  function showDashboard(user) {
    $('loginScreen').style.display = 'none';
    $('dashboard').style.display = 'block';
    $('userEmail').textContent = user.email;
    initTheme();
    listenReports();
    listenErrors();
  }

  // ── Real-time Data ──
  function listenReports() {
    reportsListener = db.ref('bug-reports').orderByChild('ts').limitToLast(500).on('value', function(snap) {
      allReports = [];
      snap.forEach(function(child) {
        var r = child.val();
        r._key = child.key;
        allReports.push(r);
      });
      allReports.sort(function(a, b) { return (b.ts || 0) - (a.ts || 0); });
      populateFilters();
      renderStats();
      renderCharts();
      renderBrowserBreakdown();
      applyFilters();
      renderDetectionHealth();
      pulseCards();
    });
  }

  function listenErrors() {
    errorsListener = db.ref('errors').orderByChild('ts').limitToLast(500).on('value', function(snap) {
      allErrors = [];
      snap.forEach(function(child) {
        var e = child.val();
        e._key = child.key;
        allErrors.push(e);
      });
      allErrors.sort(function(a, b) { return (b.ts || 0) - (a.ts || 0); });
      $('errorCount').textContent = allErrors.length;
      renderErrorsGrouped();
    });
  }

  function pulseCards() {
    document.querySelectorAll('.stat-card').forEach(function(card) {
      card.classList.add('pulse');
      setTimeout(function() { card.classList.remove('pulse'); }, 1000);
    });
  }

  // ── Stats ──
  function renderStats() {
    var total = allReports.length;
    var now = Date.now();
    var last24h = 0;
    var prev24h = 0;
    var uniqueDevices = {};

    allReports.forEach(function(r) {
      var age = now - (r.ts || 0);
      if (age < 86400000) last24h++;
      else if (age < 172800000) prev24h++;
      if (r.deviceId) uniqueDevices[r.deviceId] = true;
    });

    var delta = last24h - prev24h;
    var deltaClass = delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : 'delta-zero';
    var deltaText = delta > 0 ? '+' + delta : delta < 0 ? String(delta) : '0';

    $('bugCount').textContent = total;

    var statsEl = $('statsRow');
    statsEl.textContent = '';

    var stats = [
      { label: 'Total Reports', value: total },
      { label: 'Last 24h', value: last24h, delta: deltaText, deltaClass: deltaClass },
      { label: 'Unique Devices', value: Object.keys(uniqueDevices).length },
      { label: 'JS Errors', value: allErrors.length }
    ];

    stats.forEach(function(s) {
      var card = document.createElement('div');
      card.className = 'stat-card';
      var lbl = document.createElement('div');
      lbl.className = 'label';
      lbl.textContent = s.label;
      var val = document.createElement('div');
      val.className = 'value';
      val.textContent = s.value;
      if (s.delta !== undefined) {
        var span = document.createElement('span');
        span.className = 'delta ' + s.deltaClass;
        span.textContent = s.delta;
        val.appendChild(span);
      }
      card.appendChild(lbl);
      card.appendChild(val);
      statsEl.appendChild(card);
    });
  }

  // ── Charts (Chart.js) ──
  function renderCharts() {
    renderDoughnut();
    renderTrend();
  }

  function chartTextColor() {
    return document.body.classList.contains('light-mode') ? '#6b7280' : '#8a8f9a';
  }

  function chartGridColor() {
    return document.body.classList.contains('light-mode') ? '#e5e7eb' : '#2a2e36';
  }

  function renderDoughnut() {
    var typeCounts = {};
    allReports.forEach(function(r) {
      var t = r.type || 'unknown';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    });

    var labels = Object.keys(typeCounts).sort(function(a, b) { return typeCounts[b] - typeCounts[a]; });
    var data = labels.map(function(l) { return typeCounts[l]; });
    var colors = labels.map(function(l) { return TYPE_COLORS[l] || '#7A9BA8'; });

    var ctx = $('doughnutChart').getContext('2d');
    if (doughnutChart) doughnutChart.destroy();

    doughnutChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{ data: data, backgroundColor: colors, borderWidth: 0 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: chartTextColor(), font: { size: 11 }, padding: 8, boxWidth: 12 }
          }
        },
        cutout: '60%'
      }
    });
  }

  function renderTrend() {
    var now = Date.now();
    var thirtyDaysAgo = now - 30 * 86400000;

    // Build day buckets per type
    var typesByDay = {};
    var allTypes = {};

    allReports.forEach(function(r) {
      if ((r.ts || 0) < thirtyDaysAgo) return;
      var dk = dayKey(r.ts);
      var t = r.type || 'unknown';
      allTypes[t] = true;
      if (!typesByDay[dk]) typesByDay[dk] = {};
      typesByDay[dk][t] = (typesByDay[dk][t] || 0) + 1;
    });

    // Generate last 30 day labels
    var labels = [];
    for (var i = 29; i >= 0; i--) {
      var d = new Date(now - i * 86400000);
      labels.push(dayKey(d.getTime()));
    }

    var sortedTypes = Object.keys(allTypes).sort();
    var datasets = sortedTypes.map(function(t) {
      return {
        label: t,
        data: labels.map(function(dk) { return (typesByDay[dk] && typesByDay[dk][t]) || 0; }),
        borderColor: TYPE_COLORS[t] || '#7A9BA8',
        backgroundColor: 'transparent',
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 5
      };
    });

    var shortLabels = labels.map(function(dk) {
      var parts = dk.split('-');
      return parseInt(parts[1]) + '/' + parseInt(parts[2]);
    });

    var ctx = $('trendChart').getContext('2d');
    if (trendChart) trendChart.destroy();

    trendChart = new Chart(ctx, {
      type: 'line',
      data: { labels: shortLabels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            labels: { color: chartTextColor(), font: { size: 11 }, boxWidth: 12 }
          },
          tooltip: {
            callbacks: {
              title: function(items) { return labels[items[0].dataIndex]; }
            }
          }
        },
        scales: {
          x: {
            ticks: { color: chartTextColor(), font: { size: 10 }, maxTicksLimit: 10 },
            grid: { color: chartGridColor() }
          },
          y: {
            beginAtZero: true,
            ticks: { color: chartTextColor(), font: { size: 10 }, precision: 0 },
            grid: { color: chartGridColor() }
          }
        }
      }
    });
  }

  // ── Browser Breakdown ──
  function renderBrowserBreakdown() {
    var browsers = {};
    var touchCount = 0;
    var mouseCount = 0;

    allReports.forEach(function(r) {
      var b = parseBrowser(r.ua);
      browsers[b] = (browsers[b] || 0) + 1;
      if (r.screen && r.screen.touch) touchCount++;
      else mouseCount++;
    });

    var sorted = Object.keys(browsers).sort(function(a, b) { return browsers[b] - browsers[a]; }).slice(0, 5);
    var max = sorted.length > 0 ? browsers[sorted[0]] : 1;

    var container = $('browserBreakdown');
    container.textContent = '';

    var h3 = document.createElement('h3');
    h3.textContent = 'Top Browsers';
    if (touchCount + mouseCount > 0) {
      var badge = document.createElement('span');
      badge.className = 'touch-badge';
      badge.textContent = 'Touch ' + Math.round(touchCount / (touchCount + mouseCount) * 100) + '%';
      h3.appendChild(badge);
    }
    container.appendChild(h3);

    sorted.forEach(function(b) {
      var pct = Math.round(browsers[b] / max * 100);
      var row = document.createElement('div');
      row.className = 'browser-row';
      var label = document.createElement('div');
      label.className = 'browser-label';
      label.textContent = b;
      var track = document.createElement('div');
      track.className = 'browser-track';
      var fill = document.createElement('div');
      fill.className = 'browser-fill';
      fill.style.width = Math.max(pct, 5) + '%';
      fill.textContent = browsers[b];
      track.appendChild(fill);
      row.appendChild(label);
      row.appendChild(track);
      container.appendChild(row);
    });
  }

  // ── Filters ──
  function populateFilters() {
    var types = {};
    var exams = {};
    allReports.forEach(function(r) {
      if (r.type) types[r.type] = true;
      if (r.examId) exams[r.examId] = true;
    });
    rebuildSelect($('filterType'), types, 'All types');
    rebuildSelect($('filterExam'), exams, 'All lessons');
  }

  function rebuildSelect(sel, map, placeholder) {
    var prev = sel.value;
    sel.textContent = '';
    var opt = document.createElement('option');
    opt.value = '';
    opt.textContent = placeholder;
    sel.appendChild(opt);
    Object.keys(map).sort().forEach(function(k) {
      var o = document.createElement('option');
      o.value = k;
      o.textContent = k;
      sel.appendChild(o);
    });
    sel.value = prev;
  }

  function applyFilters() {
    var typeF = $('filterType').value;
    var examF = $('filterExam').value;
    var fromF = $('filterFrom').value;
    var toF = $('filterTo').value;
    var fromTs = fromF ? new Date(fromF).getTime() : 0;
    var toTs = toF ? new Date(toF + 'T23:59:59').getTime() : Infinity;

    var filtered = allReports.filter(function(r) {
      if (typeF && r.type !== typeF) return false;
      if (examF && r.examId !== examF) return false;
      var ts = r.ts || 0;
      if (ts < fromTs || ts > toTs) return false;
      if (searchTerm) {
        var hay = [r.type, r.examId, r.errorMsg, r.deviceId, r.url, r.sessionId].join(' ').toLowerCase();
        if (hay.indexOf(searchTerm) === -1) return false;
      }
      return true;
    });

    renderTable(filtered);
  }

  // ── Bug Reports Table ──
  function renderTable(reports) {
    var body = $('reportBody');
    body.textContent = '';
    $('emptyState').style.display = reports.length === 0 ? '' : 'none';
    selectedKeys = {};
    updateBulkBar();
    if ($('selectAll')) $('selectAll').checked = false;

    reports.forEach(function(r) {
      var tr = document.createElement('tr');
      tr.className = 'clickable';

      // Checkbox
      var tdCb = document.createElement('td');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'row-cb';
      cb.dataset.key = r._key;
      tdCb.onclick = function(e) {
        e.stopPropagation();
        if (e.target !== cb) cb.checked = !cb.checked;
        if (cb.checked) selectedKeys[r._key] = true;
        else delete selectedKeys[r._key];
        updateBulkBar();
      };
      tdCb.appendChild(cb);

      var tdType = document.createElement('td');
      var badge = document.createElement('span');
      var badgeType = r.type || 'unknown';
      badge.className = 'type-badge badge-' + (KNOWN_TYPES.indexOf(badgeType) !== -1 ? badgeType : 'unknown');
      badge.textContent = badgeType;
      tdType.appendChild(badge);

      var tdExam = document.createElement('td');
      tdExam.textContent = r.examId || '?';

      var tdDevice = document.createElement('td');
      tdDevice.textContent = (r.deviceId || '').substring(0, 12);
      tdDevice.title = r.deviceId || '';

      var tdTime = document.createElement('td');
      tdTime.textContent = formatTime(r.ts);

      // Delete button
      var tdDel = document.createElement('td');
      var delBtn = document.createElement('button');
      delBtn.className = 'delete-btn';
      delBtn.textContent = '\u{1F5D1}';
      delBtn.title = 'Delete this report';
      delBtn.onclick = function(e) {
        e.stopPropagation();
        if (confirm('Delete this report?')) {
          db.ref('bug-reports/' + r._key).remove();
        }
      };
      tdDel.appendChild(delBtn);

      tr.appendChild(tdCb);
      tr.appendChild(tdType);
      tr.appendChild(tdExam);
      tr.appendChild(tdDevice);
      tr.appendChild(tdTime);
      tr.appendChild(tdDel);

      // Detail row
      var detailTr = document.createElement('tr');
      detailTr.className = 'detail-row';
      var detailTd = document.createElement('td');
      detailTd.colSpan = 6;
      buildDetail(r, detailTd);
      detailTr.appendChild(detailTd);

      tr.onclick = function() {
        var isOpen = detailTr.style.display === 'table-row';
        detailTr.style.display = isOpen ? 'none' : 'table-row';
        tr.classList.toggle('expanded', !isOpen);
      };

      body.appendChild(tr);
      body.appendChild(detailTr);
    });
  }

  function updateBulkBar() {
    var count = Object.keys(selectedKeys).length;
    var bar = $('bulkBar');
    if (count > 0) {
      bar.classList.add('visible');
      $('bulkCount').textContent = count + ' selected';
    } else {
      bar.classList.remove('visible');
    }
  }

  function bulkCopy() {
    var keys = Object.keys(selectedKeys);
    if (keys.length === 0) return;
    var reports = allReports.filter(function(r) { return selectedKeys[r._key]; });
    var text = reports.map(formatCopyReport).join('\n\n---\n\n');
    navigator.clipboard.writeText(text).then(function() {
      var btn = $('bulkCopy');
      btn.textContent = 'Copied ' + reports.length + '!';
      btn.classList.add('copied');
      setTimeout(function() { btn.textContent = 'Copy selected'; btn.classList.remove('copied'); }, 2000);
    });
  }

  function bulkDelete() {
    var keys = Object.keys(selectedKeys);
    if (keys.length === 0) return;
    if (!confirm('Delete ' + keys.length + ' selected reports?')) return;
    var updates = {};
    keys.forEach(function(k) { updates[k] = null; });
    db.ref('bug-reports').update(updates);
    selectedKeys = {};
    updateBulkBar();
  }

  // ── JS Errors (Grouped) ──
  function renderErrorsGrouped() {
    var body = $('errorsBody');
    body.textContent = '';
    $('errorsEmpty').style.display = allErrors.length === 0 ? '' : 'none';

    // Group by message
    var groups = {};
    var groupOrder = [];
    allErrors.forEach(function(e) {
      var msg = (e.msg || '?').substring(0, 120);
      if (!groups[msg]) {
        groups[msg] = { msg: msg, count: 0, lastTs: 0, devices: {}, items: [], keys: [] };
        groupOrder.push(msg);
      }
      var g = groups[msg];
      g.count++;
      if ((e.ts || 0) > g.lastTs) g.lastTs = e.ts;
      if (e.ua) g.devices[parseBrowser(e.ua)] = true;
      g.items.push(e);
      g.keys.push(e._key);
    });

    groupOrder.sort(function(a, b) { return groups[b].count - groups[a].count; });

    groupOrder.forEach(function(msg) {
      var g = groups[msg];

      // Group header row
      var tr = document.createElement('tr');
      tr.className = 'error-group-row';

      var tdMsg = document.createElement('td');
      tdMsg.textContent = g.msg;
      tdMsg.title = g.msg;

      var tdCount = document.createElement('td');
      tdCount.className = 'error-group-count';
      tdCount.textContent = g.count;

      var tdLast = document.createElement('td');
      tdLast.textContent = formatTime(g.lastTs);

      var tdDevices = document.createElement('td');
      tdDevices.textContent = Object.keys(g.devices).length;

      var tdAction = document.createElement('td');
      var purgeBtn = document.createElement('button');
      purgeBtn.className = 'purge-group-btn';
      purgeBtn.textContent = 'Purge';
      purgeBtn.onclick = function(e) {
        e.stopPropagation();
        if (!confirm('Delete all ' + g.count + ' errors matching this message?')) return;
        var updates = {};
        g.keys.forEach(function(k) { updates[k] = null; });
        db.ref('errors').update(updates);
      };
      tdAction.appendChild(purgeBtn);

      tr.appendChild(tdMsg);
      tr.appendChild(tdCount);
      tr.appendChild(tdLast);
      tr.appendChild(tdDevices);
      tr.appendChild(tdAction);

      // Child rows (hidden by default)
      var childBody = document.createElement('tbody');
      childBody.className = 'error-children';

      g.items.forEach(function(e) {
        var childTr = document.createElement('tr');
        childTr.className = 'error-child-row';

        var c1 = document.createElement('td');
        c1.textContent = e.url || '?';
        var c2 = document.createElement('td');
        c2.textContent = (e.ua || '?').substring(0, 50);
        var c3 = document.createElement('td');
        c3.textContent = formatTime(e.ts);
        var c4 = document.createElement('td');
        c4.colSpan = 2;

        childTr.appendChild(c1);
        childTr.appendChild(c2);
        childTr.appendChild(c3);
        childTr.appendChild(c4);
        childBody.appendChild(childTr);
      });

      tr.onclick = function() {
        childBody.classList.toggle('open');
      };

      body.appendChild(tr);
      body.appendChild(childBody);
    });
  }

  // ── Detection Health ──
  function renderDetectionHealth() {
    var body = $('healthBody');
    body.textContent = '';

    var now = Date.now();
    var thirtyDaysAgo = now - 30 * 86400000;

    // Count reports by type in last 30 days + find last fired
    var typeMeta = {};
    allReports.forEach(function(r) {
      var t = r.type || 'unknown';
      if (!typeMeta[t]) typeMeta[t] = { count30d: 0, lastTs: 0 };
      if ((r.ts || 0) > thirtyDaysAgo) typeMeta[t].count30d++;
      if ((r.ts || 0) > typeMeta[t].lastTs) typeMeta[t].lastTs = r.ts;
    });

    DETECTORS.forEach(function(det) {
      var meta = typeMeta[det.type] || { count30d: 0, lastTs: 0 };
      var tr = document.createElement('tr');

      var tdName = document.createElement('td');
      tdName.textContent = det.name;
      tdName.style.fontWeight = '600';

      var tdStatus = document.createElement('td');
      var statusBadge = document.createElement('span');
      statusBadge.className = 'health-status health-active';
      statusBadge.textContent = 'Active';
      tdStatus.appendChild(statusBadge);

      var tdLast = document.createElement('td');
      tdLast.textContent = meta.lastTs ? formatTime(meta.lastTs) : 'never';

      var tdCount = document.createElement('td');
      tdCount.textContent = meta.count30d;
      tdCount.style.fontVariantNumeric = 'tabular-nums';

      var tdThreshold = document.createElement('td');
      tdThreshold.textContent = det.threshold;
      tdThreshold.style.color = 'var(--text-dim)';
      tdThreshold.style.fontSize = '12px';

      tr.appendChild(tdName);
      tr.appendChild(tdStatus);
      tr.appendChild(tdLast);
      tr.appendChild(tdCount);
      tr.appendChild(tdThreshold);
      body.appendChild(tr);
    });
  }

  // ── Detail Builder (preserved from original) ──
  function buildDetail(r, container) {
    var wrap = document.createElement('div');
    wrap.className = 'detail-content';

    var copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.onclick = function(e) {
      e.stopPropagation();
      navigator.clipboard.writeText(formatCopyReport(r)).then(function() {
        copyBtn.textContent = 'Copied';
        copyBtn.classList.add('copied');
        setTimeout(function() { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 2000);
      });
    };
    wrap.appendChild(copyBtn);

    if (r.sessionId) {
      var viewSessionBtn = document.createElement('button');
      viewSessionBtn.className = 'copy-btn view-session-btn';
      viewSessionBtn.textContent = 'View Session';
      viewSessionBtn.onclick = function(e) {
        e.stopPropagation();
        if (window._bugDashboardAI && window._bugDashboardAI.viewSession) {
          window._bugDashboardAI.viewSession(r.sessionId, r.deviceId);
        }
      };
      wrap.appendChild(viewSessionBtn);
    }

    if (r.errorMsg) {
      var banner = document.createElement('div');
      banner.className = 'error-banner';
      banner.textContent = r.errorMsg;
      wrap.appendChild(banner);
    }

    if (r.quiz && (r.quiz.si !== undefined || r.quiz.mode)) {
      var sec = makeSection('Quiz Context');
      var info = document.createElement('div');
      info.className = 'quiz-info';
      var parts = [];
      if (r.quiz.si !== undefined) parts.push('Section ' + r.quiz.si);
      if (r.quiz.qi !== undefined) parts.push('Question ' + r.quiz.qi);
      if (r.quiz.mode) parts.push('Mode: ' + r.quiz.mode);
      if (r.quiz.focusAnimating) parts.push('(animating)');
      if (r.quiz.session === false) parts.push('No active session');
      info.textContent = parts.join(' / ');
      sec.appendChild(info);
      wrap.appendChild(sec);
    }

    if (r.cardVisibility) {
      var sec = makeSection('Card Visibility');
      var cv = r.cardVisibility;
      var isInvisible = cv.opacity <= 0 || cv.display === 'none' || cv.visibility === 'hidden' || cv.height <= 0;
      var statusBadge = document.createElement('span');
      statusBadge.style.cssText = 'display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;margin-right:8px;';
      if (isInvisible) {
        statusBadge.style.background = 'var(--danger-dim)';
        statusBadge.style.color = 'var(--danger)';
        statusBadge.textContent = 'INVISIBLE';
      } else {
        statusBadge.style.background = 'var(--success-dim)';
        statusBadge.style.color = 'var(--success)';
        statusBadge.textContent = 'VISIBLE';
      }
      sec.appendChild(statusBadge);
      if (r.healApplied) {
        var healBadge = document.createElement('span');
        healBadge.style.cssText = 'display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:var(--success-dim);color:var(--success);';
        healBadge.textContent = 'AUTO-HEALED';
        sec.appendChild(healBadge);
      }
      if (r.cardId) {
        var idInfo = document.createElement('div');
        idInfo.className = 'quiz-info';
        idInfo.style.marginTop = '6px';
        var idParts = [];
        if (r.cardId.si !== null) idParts.push('Section ' + r.cardId.si);
        if (r.cardId.qi !== null) idParts.push('Question ' + r.cardId.qi);
        idParts.push('Focus ' + r.cardId.focusIndex + '/' + r.cardId.focusTotal);
        idInfo.textContent = idParts.join(' / ');
        sec.appendChild(idInfo);
      }
      var tbl = document.createElement('table');
      tbl.style.cssText = 'width:100%;margin-top:8px;font-size:12px;border-collapse:collapse;';
      var props = [
        ['opacity', cv.opacity, cv.opacity <= 0],
        ['display', cv.display, cv.display === 'none'],
        ['visibility', cv.visibility, cv.visibility === 'hidden'],
        ['transform', cv.transform || 'none', false],
        ['offsetWidth', cv.width, cv.width <= 0],
        ['offsetHeight', cv.height, cv.height <= 0]
      ];
      props.forEach(function(p) {
        var row = document.createElement('tr');
        var tdK = document.createElement('td');
        tdK.style.cssText = 'padding:2px 8px;font-weight:600;color:var(--text-muted);';
        tdK.textContent = p[0];
        var tdV = document.createElement('td');
        tdV.style.cssText = 'padding:2px 8px;font-family:var(--font-mono);' + (p[2] ? 'color:var(--danger);font-weight:700;' : '');
        tdV.textContent = String(p[1]);
        row.appendChild(tdK);
        row.appendChild(tdV);
        tbl.appendChild(row);
      });
      if (cv.classList) {
        var row = document.createElement('tr');
        var tdK = document.createElement('td');
        tdK.style.cssText = 'padding:2px 8px;font-weight:600;color:var(--text-muted);';
        tdK.textContent = 'classList';
        var tdV = document.createElement('td');
        tdV.style.cssText = 'padding:2px 8px;font-family:var(--font-mono);font-size:11px;';
        tdV.textContent = cv.classList;
        row.appendChild(tdK);
        row.appendChild(tdV);
        tbl.appendChild(row);
      }
      sec.appendChild(tbl);
      wrap.appendChild(sec);
    }

    if (r.screen && r.screen.w) {
      var sec = makeSection('Screen');
      var info = document.createElement('div');
      info.className = 'screen-info';
      var parts = [r.screen.w + '\u00D7' + r.screen.h];
      if (r.screen.dpr && r.screen.dpr !== 1) parts.push('@' + r.screen.dpr + 'x');
      if (r.screen.orientation && r.screen.orientation !== 'unknown') {
        parts.push(r.screen.orientation.replace('-primary', ''));
      }
      parts.push(r.screen.touch ? 'touch' : 'mouse');
      info.textContent = parts.join(', ');
      sec.appendChild(info);
      wrap.appendChild(sec);
    }

    if (r.state && Object.keys(r.state).length > 0) {
      var sec = makeSection('State Snapshot');
      var table = document.createElement('table');
      table.className = 'state-table';
      Object.keys(r.state).forEach(function(k) {
        var tr = document.createElement('tr');
        var tdKey = document.createElement('td');
        tdKey.textContent = k;
        var tdVal = document.createElement('td');
        var val = r.state[k];
        tdVal.textContent = typeof val === 'object' ? JSON.stringify(val) : String(val);
        tr.appendChild(tdKey);
        tr.appendChild(tdVal);
        table.appendChild(tr);
      });
      sec.appendChild(table);
      wrap.appendChild(sec);
    }

    if (r.trace && r.trace.length > 0) {
      var sec = makeSection('Trace Timeline');
      var pre = document.createElement('pre');
      pre.className = 'detail-pre';
      r.trace.forEach(function(e) {
        var line = document.createElement('span');
        line.className = 'trace-line';
        var ch = document.createElement('span');
        ch.style.color = TRACE_COLORS[e.ch] || '#666';
        ch.style.fontWeight = 'bold';
        ch.textContent = '[' + (e.ch || '?') + '] ';
        var tag = document.createElement('b');
        tag.textContent = (e.tag || '') + ' ';
        var msg = document.createTextNode((e.msg || '') + ' ');
        var time = document.createElement('span');
        time.style.color = 'var(--text-dim)';
        time.textContent = '+' + (e.t || 0) + 'ms';
        line.appendChild(ch);
        line.appendChild(tag);
        line.appendChild(msg);
        line.appendChild(time);
        pre.appendChild(line);
        pre.appendChild(document.createTextNode('\n'));
      });
      sec.appendChild(pre);
      wrap.appendChild(sec);
    }

    if (r.steps && r.steps.length > 0) {
      var sec = makeSection('Reproduction Steps');
      var ol = document.createElement('ol');
      r.steps.forEach(function(s) {
        var li = document.createElement('li');
        li.textContent = String(s).replace(/^\d+\.\s*/, '');
        ol.appendChild(li);
      });
      sec.appendChild(ol);
      wrap.appendChild(sec);
    }

    if (r.perf) {
      var sec = makeSection('Performance');
      var pre = document.createElement('pre');
      pre.className = 'detail-pre';
      pre.textContent = 'DOM Nodes: ' + (r.perf.domNodes || '?') + '    ' +
        'Memory: ' + (r.perf.memory ? r.perf.memory + 'MB' : 'N/A') + '    ' +
        'FPS: ' + (r.perf.fps || 'N/A');
      sec.appendChild(pre);
      wrap.appendChild(sec);
    }

    var ctxSec = makeSection('Context');
    var ctxPre = document.createElement('pre');
    ctxPre.className = 'detail-pre';
    ctxPre.textContent = 'URL: ' + (r.url || '?') + '\nUA: ' + (r.ua || '?');
    ctxSec.appendChild(ctxPre);
    wrap.appendChild(ctxSec);

    container.appendChild(wrap);
  }

  function formatCopyReport(r) {
    var lines = [];
    lines.push('Bug: ' + (r.type || '?'));
    lines.push('Lesson: ' + (r.examId || '?'));
    lines.push('Time: ' + formatTime(r.ts));
    if (r.errorMsg) lines.push('Error: ' + r.errorMsg);
    if (r.quiz && (r.quiz.si !== undefined || r.quiz.mode)) {
      var parts = [];
      if (r.quiz.si !== undefined) parts.push('S' + r.quiz.si);
      if (r.quiz.qi !== undefined) parts.push('Q' + r.quiz.qi);
      if (r.quiz.mode) parts.push('mode: ' + r.quiz.mode);
      lines.push('Quiz: ' + parts.join(', '));
    }
    if (r.screen && r.screen.w) {
      var s = r.screen;
      lines.push('Screen: ' + s.w + '\u00D7' + s.h + (s.dpr !== 1 ? ' @' + s.dpr + 'x' : '') + ', ' + (s.touch ? 'touch' : 'mouse'));
    }
    if (r.cardVisibility) {
      lines.push('Card Visibility: opacity=' + r.cardVisibility.opacity + ', display=' + r.cardVisibility.display + ', h=' + r.cardVisibility.height);
      if (r.healApplied) lines.push('(auto-healed)');
    }
    if (r.cardId) {
      lines.push('Card: S' + r.cardId.si + '/Q' + r.cardId.qi + ' (focus ' + r.cardId.focusIndex + '/' + r.cardId.focusTotal + ')');
    }
    if (r.state && Object.keys(r.state).length > 0) {
      lines.push('State: ' + JSON.stringify(r.state));
    }
    lines.push('URL: ' + (r.url || '?'));
    return lines.join('\n');
  }

  function makeSection(title) {
    var div = document.createElement('div');
    div.className = 'detail-section';
    var h4 = document.createElement('h4');
    h4.textContent = title;
    div.appendChild(h4);
    return div;
  }

  // ── Prune / Purge ──
  function pruneOld() {
    if (!confirm('Delete bug reports older than 30 days? This cannot be undone.')) return;
    var cutoff = Date.now() - 30 * 86400000;
    var toDelete = allReports.filter(function(r) { return (r.ts || 0) < cutoff; });
    if (toDelete.length === 0) { alert('No reports older than 30 days.'); return; }
    var updates = {};
    toDelete.forEach(function(r) { updates[r._key] = null; });
    db.ref('bug-reports').update(updates).then(function() {
      alert('Deleted ' + toDelete.length + ' old reports.');
    }).catch(function(err) { alert('Error: ' + err.message); });
  }

  function purgeAnimConflict() {
    var toDelete = allReports.filter(function(r) { return r.type === 'anim_conflict'; });
    if (toDelete.length === 0) { alert('No anim_conflict reports found.'); return; }
    if (!confirm('Delete all ' + toDelete.length + ' anim_conflict reports?')) return;
    var updates = {};
    toDelete.forEach(function(r) { updates[r._key] = null; });
    db.ref('bug-reports').update(updates).then(function() {
      alert('Deleted ' + toDelete.length + ' anim_conflict reports.');
    }).catch(function(err) { alert('Error: ' + err.message); });
  }

  // ── Bridge for AI Module ──
  window._bugDashboard = {
    getReports: function() { return allReports; },
    getErrors: function() { return allErrors; },
    isAuthenticated: function() { return !!auth.currentUser; },
    writeTriageResult: function(data) {
      return db.ref('triage').push(data);
    },
    loadTriageHistory: function(callback) {
      db.ref('triage').orderByChild('timestamp').limitToLast(1).once('value', callback);
    },
    applyFilterValues: function(filters) {
      if (filters.type !== undefined) $('filterType').value = filters.type || '';
      if (filters.exam !== undefined) $('filterExam').value = filters.exam || '';
      if (filters.dateFrom !== undefined) $('filterFrom').value = filters.dateFrom || '';
      if (filters.dateTo !== undefined) $('filterTo').value = filters.dateTo || '';
      if (filters.search !== undefined) {
        $('searchInput').value = filters.search || '';
        searchTerm = (filters.search || '').toLowerCase().trim();
      }
      applyFilters();
    },
    switchTab: function(tabName) {
      document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
      var btn = document.querySelector('.tab-btn[data-tab="' + tabName + '"]');
      if (btn) btn.classList.add('active');
      var panel = $(tabName + 'Panel');
      if (panel) panel.classList.add('active');
      activeTab = tabName;
    },
    loadTriageForDelta: function() {
      return db.ref('triage').orderByChild('timestamp').limitToLast(2).once('value').then(function(snap) {
        var val = snap.val();
        if (!val) return null;
        var keys = Object.keys(val);
        if (keys.length < 1) return null;
        // If 2 entries exist, return the older one (previous); if only 1, return it
        if (keys.length === 1) return val[keys[0]];
        // Keys are ordered by push ID (chronological), so first is older
        return val[keys[0]];
      });
    }
  };
})();
