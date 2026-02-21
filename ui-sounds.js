/* UI Sounds Module — SND.dev (SND01 "sine" kit)
   Professional UI sound effects by Dentsu.
   https://snd.dev/

   Usage: UISound.play('click')
   Auto-plays 'reveal' on .toggle-btn clicks via event delegation. */

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

  // Event delegation for toggle buttons (all lessons)
  document.addEventListener('click', function(e) {
    if (ready && e.target.closest('.toggle-btn')) {
      snd.play(Snd.SOUNDS.TOGGLE_ON);
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
