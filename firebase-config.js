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
    });
  })();

  // ── Reconnect on visibility change (phone lock/unlock) ──
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
      firebase.database().goOnline();
    }
  });
}
