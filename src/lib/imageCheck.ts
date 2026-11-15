import type { PickedImage, PickedVideo } from '../types';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
export const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decode base64 without relying on atob/Buffer, which differ between React Native engines. */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]);
    const b = B64.indexOf(clean[i + 1]);
    const c = i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : -1;
    const d = i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.slice(0, o);
}

export function checkImage(img: PickedImage): string | null {
  if (!ALLOWED.includes(img.mime)) return 'Use a JPG, PNG or WebP image.';
  if (img.bytes > MAX_IMAGE_BYTES) return 'The image is larger than 5 MB. Choose a smaller one.';
  return null;
}


export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_MS = 30_000;
export const VIDEO_EXT: Record<string, string> = { 'video/mp4': 'mp4', 'video/quicktime': 'mov' };

export function checkVideo(v: PickedVideo): string | null {
  if (!VIDEO_EXT[v.mime]) return 'Use an MP4 or MOV video.';
  if (v.bytes > MAX_VIDEO_BYTES) return 'The video is larger than 25 MB. Choose a shorter one.';
  if (v.durationMs > MAX_VIDEO_MS) return 'The video is longer than 30 seconds.';
  if (v.durationMs <= 0) return 'The video looks empty.';
  return null;
}
