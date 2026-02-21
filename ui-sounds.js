/* UI Sounds Module
   Generates short sound effects as base64 WAV data URIs and plays them
   via Howler.js. No external audio files needed.

   Sounds: click (selection), correct (right answer), wrong (wrong answer),
           reveal (toggle open).

   Usage: UISound.play('click')
   Auto-plays 'reveal' on .toggle-btn clicks via event delegation. */

(function() {
  'use strict';

  if (typeof Howl === 'undefined') return;

  var SAMPLE_RATE = 22050;

  // ── WAV encoding ──

  function floatTo16Bit(samples) {
    var buf = new Int16Array(samples.length);
    for (var i = 0; i < samples.length; i++) {
      var s = Math.max(-1, Math.min(1, samples[i]));
      buf[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return buf;
  }

  function encodeWAV(samples) {
    var pcm = floatTo16Bit(samples);
    var dataLen = pcm.length * 2;
    var buf = new ArrayBuffer(44 + dataLen);
    var v = new DataView(buf);

    function writeStr(offset, str) {
      for (var i = 0; i < str.length; i++) v.setUint8(offset + i, str.charCodeAt(i));
    }

    writeStr(0, 'RIFF');
    v.setUint32(4, 36 + dataLen, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, SAMPLE_RATE, true);
    v.setUint32(28, SAMPLE_RATE * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    writeStr(36, 'data');
    v.setUint32(40, dataLen, true);

    var offset = 44;
    for (var i = 0; i < pcm.length; i++) {
      v.setInt16(offset, pcm[i], true);
      offset += 2;
    }

    return buf;
  }

  function toBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return 'data:audio/wav;base64,' + btoa(binary);
  }

  function makeSound(duration, generator) {
    var len = Math.floor(SAMPLE_RATE * duration);
    var samples = new Float32Array(len);
    generator(samples, SAMPLE_RATE);
    return toBase64(encodeWAV(samples));
  }

  // ── Sound generators ──

  function clickGen(samples, sr) {
    for (var i = 0; i < samples.length; i++) {
      var t = i / sr;
      var env = Math.exp(-t * 60);
      samples[i] = Math.sin(2 * Math.PI * 1000 * t) * env * 0.6;
    }
  }

  function correctGen(samples, sr) {
    var half = Math.floor(samples.length / 2);
    for (var i = 0; i < samples.length; i++) {
      var t = i / sr;
      var freq = i < half ? 523.25 : 659.25;
      var localT = i < half ? t : (i - half) / sr;
      var env = Math.exp(-localT * 4) * 0.7;
      var fadeOut = i > samples.length - sr * 0.05
        ? (samples.length - i) / (sr * 0.05) : 1;
      samples[i] = Math.sin(2 * Math.PI * freq * t) * env * fadeOut;
    }
  }

  function wrongGen(samples, sr) {
    for (var i = 0; i < samples.length; i++) {
      var t = i / sr;
      var freq = 300 - t * 500;
      if (freq < 100) freq = 100;
      var env = Math.exp(-t * 6) * 0.5;
      samples[i] = Math.sin(2 * Math.PI * freq * t) * env;
    }
  }

  function revealGen(samples, sr) {
    for (var i = 0; i < samples.length; i++) {
      var t = i / sr;
      var env = Math.exp(-t * 40) * 0.5;
      samples[i] = Math.sin(2 * Math.PI * 800 * t) * env;
    }
  }

  // ── Create Howl instances ──

  var sounds = {
    click:   new Howl({ src: [makeSound(0.06, clickGen)],   volume: 0.25 }),
    correct: new Howl({ src: [makeSound(0.35, correctGen)], volume: 0.35 }),
    wrong:   new Howl({ src: [makeSound(0.3, wrongGen)],    volume: 0.3 }),
    reveal:  new Howl({ src: [makeSound(0.1, revealGen)],   volume: 0.2 })
  };

  // ── Event delegation for toggle buttons ──

  document.addEventListener('click', function(e) {
    if (e.target.closest('.toggle-btn')) {
      sounds.reveal.play();
    }
  });

  // ── Public API ──

  window.UISound = {
    play: function(name) {
      if (sounds[name]) sounds[name].play();
    }
  };
})();
