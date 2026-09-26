Powers **[dupfind.com](https://dupfind.com/)**: find duplicate and near-duplicate photos in the browser, nothing uploaded.

# dupfind-phash

`hash.js` computes two 64-bit perceptual hashes from a greyscale image. **dHash** shrinks the image to 9x8 pixels, compares each pixel with its right-hand neighbour and records the 64 gradients; these survive resizing and re-compression. **pHash** shrinks to 32x32, runs a separable DCT-II, keeps the low-frequency 8x8 corner minus the DC term, thresholds at the median and pads to 64 bits; this additionally survives brightness shifts and mild edits. The Hamming distance between two hashes says how alike two photos are, and `group()` clusters photos whose dHash and pHash are both within a threshold, since either hash alone is too forgiving or too strict.

`worker.js` is the Web Worker that feeds it. It decodes each photo with `createImageBitmap`, draws it to an `OffscreenCanvas` at up to 512 px on the long side, converts to greyscale, computes both hashes plus an exact-bytes fingerprint and a 160 px JPEG thumbnail, and posts the result back to the page. The photo bytes never leave the worker, and nothing is sent over the network.

## Usage

`hash.js` works on a flat greyscale array (one number per pixel, 0-255, row-major) together with its width and height.

```js
var PHASH = require("./hash.js");   // Node; in a browser include <script src="hash.js"> and use the PHASH global

// gray: Float64Array or plain array of length w*h
var da = PHASH.dHash(grayA, wA, hA);   // array of 64 bits (0/1)
var db = PHASH.dHash(grayB, wB, hB);
var pa = PHASH.pHash(grayA, wA, hA);
var pb = PHASH.pHash(grayB, wB, hB);

PHASH.hamming(da, db);   // 0..64; small means alike
PHASH.toHex(pa);         // 16 hex characters

// cluster photos whose dHash AND pHash both differ by at most `threshold` bits
var groups = PHASH.group([
  { id: 1, dhash: da, phash: pa },
  { id: 2, dhash: db, phash: pb }
], 10);
// groups: array of arrays; only groups with two or more members are returned
```

In the browser, start `worker.js` with `new Worker("worker.js")` and post messages of the shape `{id, name, size, lastModified, buf}`, where `buf` is an `ArrayBuffer` of the image file. It replies with `{ok: true, id, name, size, lastModified, width, height, exact, dhash, phash, thumb}` (where `thumb` is a JPEG `Blob`) or `{ok: false, id, name, reason}` if decoding failed.

## Exports

`dHash(gray, w, h)`, `pHash(gray, w, h)`, `hamming(a, b)`, `toHex(bits)`, `group(photos, threshold)` and the internal `_resize(gray, w, h, nw, nh)`.

## Browser and Node support

- `hash.js` is pure arithmetic and runs in both the browser (as the `PHASH` global) and Node (via `module.exports`).
- `worker.js` is browser only: it relies on `importScripts`, `createImageBitmap` and `OffscreenCanvas`, so it needs a recent browser with Web Worker support.

## Limits

- The resize is a box filter, chosen for speed rather than quality.
- pHash produces 63 bits from the DCT and pads to 64 with a zero.
- The exact-bytes fingerprint in `worker.js` is a pair of 32-bit FNV-style hashes plus the byte length, not a cryptographic hash; the function is named `sha1Hex` but does not compute SHA-1. Collisions are re-checked by the perceptual hashes.
- Rotated, mirrored or heavily cropped copies are not detected as duplicates by either hash.
- No automated tests are included; the code is untested in this repository.

Built by Saurav Kumar Sharma (https://editmp3tags.com/about/)

MIT licence
