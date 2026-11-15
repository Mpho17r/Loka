import test from 'node:test';
import assert from 'node:assert/strict';
import { base64ToBytes, checkImage, MAX_IMAGE_BYTES } from '../src/lib/imageCheck';

test('base64 decoding matches Buffer for every padding length', () => {
  for (const text of ['', 'a', 'ab', 'abc', 'abcd', 'Loka promote ✓ 123']) {
    const b64 = Buffer.from(text).toString('base64');
    assert.deepEqual(Array.from(base64ToBytes(b64)), Array.from(Buffer.from(text)));
  }
  const random = Uint8Array.from({ length: 1000 }, (_, i) => (i * 37 + 11) % 256);
  assert.deepEqual(Array.from(base64ToBytes(Buffer.from(random).toString('base64'))), Array.from(random));
});

test('image validation accepts normal images and rejects wrong type or size', () => {
  const ok = { uri: 'file://a.jpg', mime: 'image/jpeg', base64: '', bytes: 1000 };
  assert.equal(checkImage(ok), null);
  assert.match(checkImage({ ...ok, mime: 'application/pdf' }) ?? '', /JPG, PNG or WebP/);
  assert.match(checkImage({ ...ok, bytes: MAX_IMAGE_BYTES + 1 }) ?? '', /5 MB/);
});

import { checkVideo, MAX_VIDEO_BYTES, MAX_VIDEO_MS } from '../src/lib/imageCheck';

test('video validation: type, size and length', () => {
  const ok = { uri: 'file://a.mp4', mime: 'video/mp4', bytes: 1_000_000, durationMs: 12_000 };
  assert.equal(checkVideo(ok), null);
  assert.equal(checkVideo({ ...ok, mime: 'video/quicktime' }), null);
  assert.match(checkVideo({ ...ok, mime: 'video/x-matroska' }) ?? '', /MP4 or MOV/);
  assert.match(checkVideo({ ...ok, bytes: MAX_VIDEO_BYTES + 1 }) ?? '', /25 MB/);
  assert.match(checkVideo({ ...ok, durationMs: MAX_VIDEO_MS + 1 }) ?? '', /30 seconds/);
  assert.match(checkVideo({ ...ok, durationMs: 0 }) ?? '', /empty/);
});
