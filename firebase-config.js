var firebaseConfig = {
  apiKey: "AIzaSyD-U-cS30gdz1D-p4KqoYRni9nQdnJZ_L0",
  authDomain: "english-resources-reveal.firebaseapp.com",
  databaseURL: "https://english-resources-reveal-default-rtdb.firebaseio.com",
  projectId: "english-resources-reveal",
  storageBucket: "english-resources-reveal.firebasestorage.app",
  messagingSenderId: "141460166135",
  appId: "1:141460166135:web:fae3691002f92c89ec0af2"
};

if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);

  // ── Offline / Online connection monitor ──
  (function() {
    var bannerEl = null;

    function createBanner() {
      bannerEl = document.createElement('div');
      bannerEl.className = 'iq-offline-banner';
      bannerEl.setAttribute('role', 'alert');
      bannerEl.setAttribute('aria-live', 'assertive');
      bannerEl.textContent = 'Offline — answers will sync when reconnected';
      bannerEl.style.display = 'none';
      document.body.appendChild(bannerEl);
    }

    function showOfflineBanner() {
      if (!bannerEl) createBanner();
      bannerEl.style.display = '';
    }

    function hideOfflineBanner() {
      if (bannerEl) bannerEl.style.display = 'none';
    }

    firebase.database().ref('.info/connected').on('value', function(snap) {
      if (snap.val() === true) {
        hideOfflineBanner();
      } else {
        showOfflineBanner();
      }
      if (window.IQDebug) window.IQDebug.log('event', 'firebase', snap.val() ? 'connected' : 'disconnected');
    });
  })();

  // ── Reconnect on visibility change (phone lock/unlock) ──
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
      firebase.database().goOnline();
    }
  });
}

// ── Client-side error monitoring → Firebase ──
(function() {
  if (typeof firebase === 'undefined' || !firebase.apps.length) return;
  var errRef = firebase.database().ref('errors');
  var lastErr = '';
  function reportError(msg) {
    if (!msg || msg === lastErr) return;
    lastErr = msg;
    errRef.push({
      msg: String(msg).substring(0, 499),
      ts: firebase.database.ServerValue.TIMESTAMP,
      url: location.pathname,
      ua: navigator.userAgent.substring(0, 100)
    }).catch(function() {});
  }
  window.onerror = function(msg) { reportError(msg); };
  window.addEventListener('unhandledrejection', function(e) {
    reportError(e.reason ? (e.reason.message || String(e.reason)) : 'unhandled rejection');
  });
})();

// ── Structured bug reports → Firebase ──
(function() {
  if (typeof firebase === 'undefined' || !firebase.apps.length) return;
  var ref = firebase.database().ref('bug-reports');
  var lastReportTime = 0;
  var THROTTLE = 300000; // 5 minutes between reports per device
  var deviceId = localStorage.getItem('iq-device-id') || 'unknown';
  var sessionId = Math.random().toString(36).slice(2, 10);

  window.BugReport = function(type, data) {
    var now = Date.now();
    if (now - lastReportTime < THROTTLE) return;
    lastReportTime = now;
    var report = {
      type: String(type).substring(0, 50),
      sessionId: sessionId,
      examId: (document.body && document.body.dataset.examId) || 'unknown',
      deviceId: deviceId.substring(0, 30),
      url: location.pathname,
      ua: navigator.userAgent.substring(0, 100),
      ts: firebase.database.ServerValue.TIMESTAMP,
      state: data.state || {},
      trace: (data.trace || []).slice(-30),
      steps: (window.IQDebug && window.IQDebug.reproSteps ? window.IQDebug.reproSteps() : []),
      perf: {
        domNodes: document.querySelectorAll('*').length,
        memory: (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null),
        fps: (window.IQDebug && window.IQDebug.getFps ? window.IQDebug.getFps() : null)
      }
    };
    ref.push(report).catch(function() {});
  };
})();

// ── PWA install prompt ──
(function() {
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
    // Don't show if already dismissed this session
    if (sessionStorage.getItem('pwa-install-dismissed')) return;
    var banner = document.createElement('div');
    banner.className = 'iq-install-banner';
    banner.setAttribute('role', 'alert');
    var text = document.createElement('span');
    text.textContent = 'Install as app for offline access';
    var installBtn = document.createElement('button');
    installBtn.className = 'iq-update-btn';
    installBtn.textContent = 'Install';
    installBtn.onclick = function() {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function() {
        deferredPrompt = null;
        banner.remove();
      });
    };
    var dismissBtn = document.createElement('button');
    dismissBtn.className = 'iq-install-dismiss';
    dismissBtn.textContent = '\u2715';
    dismissBtn.setAttribute('aria-label', 'Dismiss');
    dismissBtn.onclick = function() {
      banner.remove();
      sessionStorage.setItem('pwa-install-dismissed', '1');
    };
    banner.appendChild(text);
    banner.appendChild(installBtn);
    banner.appendChild(dismissBtn);
    document.body.appendChild(banner);
  });
})();

// ── Service Worker update notification ──
(function() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'SW_UPDATED') {
      var existing = document.querySelector('.iq-update-banner');
      if (existing) return;
      var banner = document.createElement('div');
      banner.className = 'iq-update-banner';
      banner.setAttribute('role', 'alert');
      var text = document.createElement('span');
      text.textContent = 'New version available';
      var btn = document.createElement('button');
      btn.className = 'iq-update-btn';
      btn.textContent = 'Refresh';
      btn.onclick = function() { location.reload(); };
      banner.appendChild(text);
      banner.appendChild(btn);
      document.body.appendChild(banner);
    }
  });
})();
