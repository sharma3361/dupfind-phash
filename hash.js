/* DupFind hash.js — perceptual hashing, written by hand.
   dHash: shrink to 9x8 grey, compare each pixel to its right neighbour →
   64 bits describing *gradients*, which survive resizing and re-compression.
   pHash: a 32x32 DCT, keep the low-frequency 8x8 corner, threshold at the
   median → 64 bits describing *structure*, which additionally survives
   brightness shifts and mild edits. Hamming distance = how alike two photos
   are. Pure math on grayscale arrays — node-testable. */
var PHASH = (function () {
  "use strict";

  // ---------- grayscale resize (box filter — good enough and fast) ----------
  function resizeGray(gray, w, h, nw, nh) {
    var out = new Float64Array(nw * nh);
    var xr = w / nw, yr = h / nh;
    for (var y = 0; y < nh; y++) {
      var y0 = Math.floor(y * yr), y1 = Math.max(y0 + 1, Math.floor((y + 1) * yr));
      for (var x = 0; x < nw; x++) {
        var x0 = Math.floor(x * xr), x1 = Math.max(x0 + 1, Math.floor((x + 1) * xr));
        var sum = 0, n = 0;
        for (var yy = y0; yy < y1 && yy < h; yy++) {
          for (var xx = x0; xx < x1 && xx < w; xx++) { sum += gray[yy * w + xx]; n++; }
        }
        out[y * nw + x] = n ? sum / n : 0;
      }
    }
    return out;
  }

  // ---------- dHash (gradient) ----------
  function dHash(gray, w, h) {
    var s = resizeGray(gray, w, h, 9, 8);
    var bits = [];
    for (var y = 0; y < 8; y++) {
      for (var x = 0; x < 8; x++) {
        bits.push(s[y * 9 + x] > s[y * 9 + x + 1] ? 1 : 0);
      }
    }
    return bits;
  }

  // ---------- pHash (structure, via DCT-II) ----------
  var COS = null;
  function cosTable(N) {
    if (COS && COS.N === N) return COS.t;
    var t = new Float64Array(N * N);
    for (var u = 0; u < N; u++) {
      for (var x = 0; x < N; x++) t[u * N + x] = Math.cos((2 * x + 1) * u * Math.PI / (2 * N));
    }
    COS = { N: N, t: t };
    return t;
  }
  function pHash(gray, w, h) {
    var N = 32;
    var s = resizeGray(gray, w, h, N, N);
    var t = cosTable(N);
    // rows then columns (separable DCT)
    var tmp = new Float64Array(N * N), dct = new Float64Array(N * N);
    var u, x, y, v, sum;
    for (y = 0; y < N; y++) {
      for (u = 0; u < N; u++) {
        sum = 0;
        for (x = 0; x < N; x++) sum += s[y * N + x] * t[u * N + x];
        tmp[y * N + u] = sum;
      }
    }
    for (u = 0; u < N; u++) {
      for (v = 0; v < N; v++) {
        sum = 0;
        for (y = 0; y < N; y++) sum += tmp[y * N + u] * t[v * N + y];
        dct[v * N + u] = sum;
      }
    }
    // low-frequency 8x8, skipping the DC term (it's just overall brightness)
    var vals = [];
    for (v = 0; v < 8; v++) {
      for (u = 0; u < 8; u++) {
        if (u === 0 && v === 0) continue;
        vals.push(dct[v * N + u]);
      }
    }
    var sorted = vals.slice().sort(function (a, b) { return a - b; });
    var median = sorted[sorted.length >> 1];
    var bits = vals.map(function (val) { return val > median ? 1 : 0; });
    bits.push(0);                                   // pad to 64
    return bits;
  }

  function hamming(a, b) {
    var d = 0;
    for (var i = 0; i < a.length && i < b.length; i++) if (a[i] !== b[i]) d++;
    return d;
  }
  function toHex(bits) {
    var s = "";
    for (var i = 0; i < bits.length; i += 4) {
      s += ((bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]).toString(16);
    }
    return s;
  }

  // ---------- grouping ----------
  // photos: [{id, dhash, phash, bytes, name, ...}], threshold in bits (0-64)
  function group(photos, threshold) {
    var used = new Array(photos.length).fill(false);
    var groups = [];
    for (var i = 0; i < photos.length; i++) {
      if (used[i]) continue;
      var g = [photos[i]];
      used[i] = true;
      for (var j = i + 1; j < photos.length; j++) {
        if (used[j]) continue;
        // agreement of BOTH hashes is the honest bar — dHash alone flags
        // similar-looking-but-different photos; pHash alone forgives too much
        var dd = hamming(photos[i].dhash, photos[j].dhash);
        var dp = hamming(photos[i].phash, photos[j].phash);
        if (dd <= threshold && dp <= threshold) {
          g.push(photos[j]);
          used[j] = true;
        }
      }
      if (g.length > 1) groups.push(g);
    }
    return groups;
  }

  return { dHash: dHash, pHash: pHash, hamming: hamming, toHex: toHex,
           group: group, _resize: resizeGray };
})();
if (typeof module !== "undefined") module.exports = PHASH;
