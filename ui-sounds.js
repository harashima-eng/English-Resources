/* UI Sounds Module — SND.dev (SND01 "sine" kit)
   Professional UI sound effects by Dentsu.
   https://snd.dev/

   Usage: UISound.play('click')
   UISound.play('select')     — choice selection
   UISound.play('toggleOff')  — toggle close
   UISound.play('button')     — check popup
   UISound.play('notify')     — streak milestone
   UISound.play('disabled')   — locked/disabled click
   UISound.play('transUp')    — focus mode enter, view transitions
   UISound.play('transDown')  — focus mode exit
   UISound.muted              — read/write mute state
   Auto-plays sounds on toggles, nav, and UI clicks via event delegation. */

(function() {
  'use strict';

  if (typeof Snd === 'undefined') return;

  var snd = new Snd();
  var ready = false;
  var muted = false;

  // Restore mute preference
  try { muted = localStorage.getItem('iq-sound-muted') === '1'; } catch (e) {}

  snd.load(Snd.KITS.SND01).then(function() {
    ready = true;
  });

  var soundMap = {
    click:     'TAP',
    select:    'SELECT',
    correct:   'CELEBRATION',
    wrong:     'CAUTION',
    reveal:    'TOGGLE_ON',
    toggleOff: 'TOGGLE_OFF',
    button:    'BUTTON',
    notify:    'NOTIFICATION',
    disabled:  'DISABLED',
    transUp:   'TRANSITION_UP',
    transDown: 'TRANSITION_DOWN'
  };

  function playSound(key) {
    if (!ready || muted) return;
    if (key && Snd.SOUNDS[key]) snd.play(Snd.SOUNDS[key]);
  }

  // Event delegation for all UI interactions
  document.addEventListener('click', function(e) {
    if (!ready || muted) return;
    var t = e.target;

    // Toggle buttons: detect open/close state from sibling collapsible
    if (t.closest('.toggle-btn')) {
      var btn = t.closest('.toggle-btn');
      var row = btn.closest('.toggle-btn-row');
      if (row) {
        var collapsible = row.nextElementSibling;
        // If collapsible is about to close (currently open), play toggleOff
        if (collapsible && collapsible.classList.contains('open')) {
          playSound('TOGGLE_OFF');
        } else {
          playSound('TOGGLE_ON');
        }
      } else {
        playSound('TOGGLE_ON');
      }
      return;
    }

    if (t.closest('.top-nav-theme') || t.closest('.iq-kbd-toggle') || t.closest('.iq-focus-toggle')) {
      playSound('TOGGLE_ON');
    } else if (t.closest('.top-nav-link') || t.closest('.view-btn-nav') ||
               t.closest('.sub-nav-cat') || t.closest('.sub-nav-section') ||
               t.closest('.mobile-nav-btn')) {
      playSound('TRANSITION_UP');
    } else if (t.closest('.iq-zone.locked')) {
      playSound('DISABLED');
    }
  });

  // Public API
  window.UISound = {
    play: function(name) {
      var key = soundMap[name];
      playSound(key);
    },
    get muted() { return muted; },
    set muted(val) {
      muted = !!val;
      try { localStorage.setItem('iq-sound-muted', muted ? '1' : '0'); } catch (e) {}
    },
    toggleMute: function() {
      this.muted = !muted;
      return muted;
    }
  };
})();
