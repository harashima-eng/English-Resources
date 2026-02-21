/* UI Sounds Module — SND.dev (SND01 "sine" kit)
   Professional UI sound effects by Dentsu.
   https://snd.dev/

   Usage: UISound.play('click')
   Auto-plays sounds on toggles, nav, and UI clicks via event delegation. */

(function() {
  'use strict';

  if (typeof Snd === 'undefined') return;

  var snd = new Snd();
  var ready = false;

  snd.load(Snd.KITS.SND01).then(function() {
    ready = true;
  });

  var soundMap = {
    click:   'TAP',
    correct: 'CELEBRATION',
    wrong:   'CAUTION',
    reveal:  'TOGGLE_ON'
  };

  // Event delegation for all UI interactions
  document.addEventListener('click', function(e) {
    if (!ready) return;
    var t = e.target;
    if (t.closest('.toggle-btn') || t.closest('.top-nav-theme')) {
      snd.play(Snd.SOUNDS.TOGGLE_ON);
    } else if (t.closest('.top-nav-link') || t.closest('.view-btn-nav') ||
               t.closest('.sub-nav-cat') || t.closest('.sub-nav-section') ||
               t.closest('.mobile-nav-btn')) {
      snd.play(Snd.SOUNDS.TAP);
    }
  });

  // Public API
  window.UISound = {
    play: function(name) {
      if (!ready) return;
      var key = soundMap[name];
      if (key && Snd.SOUNDS[key]) snd.play(Snd.SOUNDS[key]);
    }
  };
})();
