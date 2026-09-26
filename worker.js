/* DupFind worker.js — the hashing crew. Each worker decodes photos with
   createImageBitmap (off the main thread, so the page stays alive through
   ten thousand files), reduces them to grayscale, and hands back two 64-bit
   perceptual hashes plus an exact-bytes fingerprint. The photo itself never
   goes anywhere — not even to the main thread. */
importScripts("hash.js");

function sha1Hex(buf) {
  // exact-duplicate detection wants a cheap content fingerprint; the browser's
  // SubtleCrypto isn't sync-friendly here, so FNV-1a over the bytes does fine
  // (collisions are astronomically unlikely and are re-checked by the hashes)
  var view = new Uint8Array(buf);
  var h1 = 0x811c9dc5, h2 = 0x01000193;
  for (var i = 0; i < view.length; i++) {
    h1 ^= view[i]; h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (h2 + view[i]) >>> 0; h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16) + "-" + view.length;
}

self.onmessage = function (e) {
  var job = e.data;                 // {id, name, size, lastModified, buf}
  var blob = new Blob([job.buf]);
  var exact = sha1Hex(job.buf);

  createImageBitmap(blob).then(function (bm) {
    var W = 64, H = 64;             // hashing works on tiny images; decode small
    var scale = Math.min(1, 512 / Math.max(bm.width, bm.height));
    var cw = Math.max(8, Math.round(bm.width * scale));
    var ch = Math.max(8, Math.round(bm.height * scale));
    var c = new OffscreenCanvas(cw, ch);
    var x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(bm, 0, 0, cw, ch);
    var px = x.getImageData(0, 0, cw, ch).data;
    var gray = new Float64Array(cw * ch);
    for (var i = 0, j = 0; i < px.length; i += 4, j++) {
      gray[j] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    }
    // a small thumbnail for the review wall, made here so the main thread
    // never has to decode the full photo
    var tw = 160, th = Math.max(1, Math.round(160 * ch / cw));
    var tc = new OffscreenCanvas(tw, th);
    tc.getContext("2d").drawImage(bm, 0, 0, tw, th);
    bm.close();

    return tc.convertToBlob({ type: "image/jpeg", quality: 0.7 }).then(function (thumb) {
      self.postMessage({
        ok: true, id: job.id, name: job.name, size: job.size,
        lastModified: job.lastModified,
        width: cw, height: ch, exact: exact,
        dhash: PHASH.dHash(gray, cw, ch),
        phash: PHASH.pHash(gray, cw, ch),
        thumb: thumb
      });
    });
  }).catch(function (err) {
    self.postMessage({ ok: false, id: job.id, name: job.name, reason: "" + (err && err.message || err) });
  });
};
