/**
 * Dependency-free browser fingerprint.
 *
 * Exposes window.surveypollFingerprint() -> Promise<string>, a 32-hex-character
 * ID derived from stable-ish device and browser traits. Nothing is stored on
 * the client, so clearing cookies or changing network does not reset it.
 *
 * Deliberately written in ES5 with no build step: survey traffic arrives from
 * panel redirects on whatever browser the respondent happens to use, including
 * old Android WebViews.
 *
 * Accuracy is not absolute. Two identical phones on the same OS and browser
 * build produce the same ID, and a browser update can change it. Treat a match
 * as strong evidence, not proof.
 */
(function () {
  'use strict';

  function attempt(fn, fallback) {
    try {
      var value = fn();
      return value == null ? fallback : String(value);
    } catch (err) {
      return fallback;
    }
  }

  /* Rendering differences between GPU, driver and font stack. The single
   * highest-entropy signal available without permissions. */
  function canvasTrait() {
    var canvas = document.createElement('canvas');
    canvas.width = 280;
    canvas.height = 60;
    var ctx = canvas.getContext('2d');
    if (!ctx) {
      return 'none';
    }
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(100, 5, 80, 30);
    ctx.fillStyle = '#069';
    ctx.font = '15px Arial';
    ctx.fillText('Surveypoll 😃 1.0', 4, 25);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.font = '17px "Times New Roman"';
    ctx.fillText('Surveypoll 😃 1.0', 6, 44);
    ctx.globalCompositeOperation = 'multiply';
    ctx.beginPath();
    ctx.arc(60, 30, 22, 0, Math.PI * 2, true);
    ctx.fill();
    return canvas.toDataURL();
  }

  /* GPU vendor/renderer strings plus the supported-extension set. */
  function webglTrait() {
    var canvas = document.createElement('canvas');
    var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
      return 'none';
    }
    var debug = gl.getExtension('WEBGL_debug_renderer_info');
    return [
      debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      gl.getParameter(gl.MAX_TEXTURE_SIZE),
      (gl.getSupportedExtensions() || []).join(',')
    ].join('~');
  }

  var PROBE_FONTS = [
    'Arial', 'Arial Black', 'Arial Narrow', 'Bookman Old Style', 'Calibri',
    'Cambria', 'Candara', 'Century Gothic', 'Comic Sans MS', 'Consolas',
    'Courier New', 'Franklin Gothic Medium', 'Garamond', 'Georgia', 'Helvetica',
    'Impact', 'Lucida Console', 'Lucida Sans Unicode', 'Menlo', 'Monaco',
    'MS Gothic', 'Palatino Linotype', 'Roboto', 'Segoe UI', 'Tahoma',
    'Times New Roman', 'Trebuchet MS', 'Verdana'
  ];

  /* Which of the probe fonts are installed, inferred from text metrics: a font
   * that is present renders the sample at a different size than the fallback. */
  function fontsTrait() {
    var bases = ['monospace', 'sans-serif', 'serif'];
    var span = document.createElement('span');
    span.style.cssText = 'position:absolute;left:-9999px;top:-9999px;'
      + 'font-size:72px;line-height:normal;visibility:hidden;';
    span.textContent = 'mmmmmmmmmmlli';
    document.body.appendChild(span);

    var baseline = {};
    var i;
    for (i = 0; i < bases.length; i++) {
      span.style.fontFamily = bases[i];
      baseline[bases[i]] = [span.offsetWidth, span.offsetHeight];
    }

    var found = [];
    for (i = 0; i < PROBE_FONTS.length; i++) {
      for (var j = 0; j < bases.length; j++) {
        span.style.fontFamily = '"' + PROBE_FONTS[i] + '",' + bases[j];
        if (span.offsetWidth !== baseline[bases[j]][0]
            || span.offsetHeight !== baseline[bases[j]][1]) {
          found.push(PROBE_FONTS[i]);
          break;
        }
      }
    }

    document.body.removeChild(span);
    return found.join(',');
  }

  function collect() {
    var nav = window.navigator || {};
    var scr = window.screen || {};
    return [
      attempt(function () { return nav.platform; }, '?'),
      attempt(function () { return (nav.languages || [nav.language]).join(','); }, '?'),
      attempt(function () { return nav.hardwareConcurrency; }, '?'),
      attempt(function () { return nav.deviceMemory; }, '?'),
      attempt(function () { return nav.maxTouchPoints; }, '?'),
      attempt(function () { return scr.width + 'x' + scr.height; }, '?'),
      attempt(function () { return scr.availWidth + 'x' + scr.availHeight; }, '?'),
      attempt(function () { return scr.colorDepth; }, '?'),
      attempt(function () { return window.devicePixelRatio; }, '?'),
      attempt(function () { return new Date().getTimezoneOffset(); }, '?'),
      attempt(function () { return Intl.DateTimeFormat().resolvedOptions().timeZone; }, '?'),
      attempt(function () { return !!window.indexedDB; }, '?'),
      attempt(canvasTrait, 'canvas-error'),
      attempt(webglTrait, 'webgl-error'),
      attempt(fontsTrait, 'fonts-error')
    ].join('|');
  }

  /* Four seeded FNV-1a lanes -> 32 hex chars. Used where SubtleCrypto is
   * unavailable, which includes any page served over plain http. */
  function fallbackHash(input) {
    var seeds = [0x811c9dc5, 0x01000193, 0x7fffffff, 0x12345678];
    var out = '';
    for (var lane = 0; lane < seeds.length; lane++) {
      var h = seeds[lane] >>> 0;
      for (var i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
      }
      var hex = h.toString(16);
      out += '00000000'.slice(hex.length) + hex;
    }
    return out;
  }

  function sha256Prefix(input) {
    var subtle = window.crypto && (window.crypto.subtle || window.crypto.webkitSubtle);
    if (!subtle || typeof TextEncoder === 'undefined') {
      return Promise.resolve(fallbackHash(input));
    }
    var digest;
    try {
      digest = subtle.digest('SHA-256', new TextEncoder().encode(input));
    } catch (err) {
      return Promise.resolve(fallbackHash(input));
    }
    // Safari's older webkitSubtle resolves a CryptoOperation, not a Promise.
    if (!digest || typeof digest.then !== 'function') {
      return Promise.resolve(fallbackHash(input));
    }
    return digest.then(function (buffer) {
      var bytes = new Uint8Array(buffer);
      var hex = '';
      for (var i = 0; i < 16; i++) {
        hex += ('0' + bytes[i].toString(16)).slice(-2);
      }
      return hex;
    }, function () {
      return fallbackHash(input);
    });
  }

  window.surveypollFingerprint = function () {
    try {
      return sha256Prefix(collect());
    } catch (err) {
      return Promise.resolve('');
    }
  };
}());
