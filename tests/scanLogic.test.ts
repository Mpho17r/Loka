import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFile, imageSize, interpretModeration, secretMatches, sniffType, toHex } from '../supabase/functions/scan-media/logic';

const png = (w: number, h: number) => {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  new DataView(b.buffer).setUint32(16, w); new DataView(b.buffer).setUint32(20, h);
  return b;
};
const jpeg = (w: number, h: number) => {
  // SOI, APP0 (len 16), SOF0 with the size
  const b = new Uint8Array(64);
  b.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], 0);
  b.set([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255], 2 + 2 + 16);
  return b;
};
const mp4 = () => { const b = new Uint8Array(32); b.set([0, 0, 0, 24], 0); b.set(Buffer.from('ftypisom'), 4); return b; };
const mov = () => { const b = new Uint8Array(32); b.set(Buffer.from('ftypqt  '), 4); return b; };

test('file type is read from the bytes, not the name', () => {
  assert.equal(sniffType(png(300, 300)), 'png');
  assert.equal(sniffType(jpeg(300, 300)), 'jpeg');
  assert.equal(sniffType(mp4()), 'mp4');
  assert.equal(sniffType(mov()), 'mov');
  assert.equal(sniffType(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])), null);
  const webp = new Uint8Array(16); webp.set(Buffer.from('RIFF'), 0); webp.set(Buffer.from('WEBP'), 8);
  assert.equal(sniffType(webp), 'webp');
});

test('image sizes are read from PNG and JPEG headers', () => {
  assert.deepEqual(imageSize(png(640, 480), 'png'), { w: 640, h: 480 });
  assert.deepEqual(imageSize(jpeg(1024, 768), 'jpeg'), { w: 1024, h: 768 });
});

test('normal files pass', () => {
  assert.equal(checkFile('u/a.png', png(640, 480)).status, 'passed');
  assert.equal(checkFile('u/a.jpg', jpeg(640, 480)).status, 'passed');
  assert.equal(checkFile('u/a.mp4', mp4()).status, 'passed');
  assert.equal(checkFile('u/a.mov', mov()).status, 'passed');
});

test('a renamed file is flagged', () => {
  assert.deepEqual(checkFile('u/a.png', mp4()).reasons, ['type_mismatch']);
  assert.deepEqual(checkFile('u/a.mp4', png(640, 480)).reasons, ['type_mismatch']);
  assert.ok(checkFile('u/a.png', new Uint8Array(100)).reasons.includes('unrecognised_file_type'));
});

test('tiny and gigantic pictures, and pictures carrying code, are flagged', () => {
  assert.ok(checkFile('u/a.png', png(50, 50)).reasons.includes('too_small'));
  assert.ok(checkFile('u/a.png', png(9000, 600)).reasons.includes('too_large_dimensions'));
  const sneaky = png(640, 480); sneaky.set(Buffer.from('<script>alert(1)</script>'), 30);
  assert.ok(checkFile('u/a.png', sneaky).reasons.includes('embedded_code'));
  assert.ok(checkFile('u/a.png', new Uint8Array(0)).reasons.includes('empty_file'));
});

test('classifier answers are validated', () => {
  assert.deepEqual(interpretModeration({ flagged: true, reasons: ['nudity', 5] }), { flagged: true, reasons: ['nudity'] });
  assert.deepEqual(interpretModeration({ flagged: false }), { flagged: false, reasons: [] });
  assert.equal(interpretModeration({ flagged: 'yes' }), null);
  assert.equal(interpretModeration(null), null);
});

test('hashing helper and secret check', () => {
  assert.equal(toHex(new Uint8Array([0, 15, 255]).buffer), '000fff');
  assert.equal(secretMatches('abc', 'abc'), true);
  assert.equal(secretMatches('abc', 'abd'), false);
  assert.equal(secretMatches(null, 'abc'), false);
});
