// Pure helpers for the scan-media function. No Deno or network code, so they are unit tested with Node.
// What this does NOT do: it cannot tell whether a picture is offensive. That needs a content classifier,
// which you plug in through MODERATION_URL (see index.ts and docs/BACKEND.md).

export type FileType = 'jpeg' | 'png' | 'webp' | 'mp4' | 'mov';
export const IMAGE_TYPES: FileType[] = ['jpeg', 'png', 'webp'];
export const MAX_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MIN_SIDE = 200;
export const MAX_SIDE = 8000;

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.slice(from, to));

/** Identify a file from its first bytes, not from its name or the type the uploader claimed. */
export function sniffType(b: Uint8Array): FileType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 4) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'webp';
  if (b.length >= 12 && ascii(b, 4, 8) === 'ftyp') return ascii(b, 8, 12) === 'qt  ' ? 'mov' : 'mp4';
  return null;
}

export function extensionOf(path: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(path);
  return m ? m[1].toLowerCase() : '';
}

const EXT_OK: Record<FileType, string[]> = { jpeg: ['jpg', 'jpeg'], png: ['png'], webp: ['webp'], mp4: ['mp4'], mov: ['mov'] };

/** Pixel size of a PNG or JPEG, or null if it cannot be read. */
export function imageSize(b: Uint8Array, type: FileType): { w: number; h: number } | null {
  if (type === 'png' && b.length >= 24) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { w: dv.getUint32(16), h: dv.getUint32(20) };
  }
  if (type === 'jpeg') {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = (b[i + 2] << 8) | b[i + 3];
      if (len < 2) return null;
      // start-of-frame markers carry the size (not DHT 0xC4, JPG 0xC8, DAC 0xCC)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      }
      i += 2 + len;
    }
  }
  return null;
}

export interface FileVerdict {
  status: 'passed' | 'flagged';
  reasons: string[];
  detail: Record<string, unknown>;
}

/** Technical checks on the file itself. */
export function checkFile(path: string, bytes: Uint8Array): FileVerdict {
  const reasons: string[] = [];
  const detail: Record<string, unknown> = { bytes: bytes.length };
  const type = sniffType(bytes);
  detail.type = type;

  if (!type) reasons.push('unrecognised_file_type');
  else if (!EXT_OK[type].includes(extensionOf(path))) reasons.push('type_mismatch');

  if (bytes.length === 0) reasons.push('empty_file');
  if (bytes.length > MAX_BYTES) reasons.push('too_large');
  if (type && IMAGE_TYPES.includes(type)) {
    if (bytes.length > MAX_IMAGE_BYTES) reasons.push('too_large');
    const size = imageSize(bytes, type);
    if (size) {
      detail.width = size.w; detail.height = size.h;
      if (size.w < MIN_SIDE || size.h < MIN_SIDE) reasons.push('too_small');
      if (size.w > MAX_SIDE || size.h > MAX_SIDE) reasons.push('too_large_dimensions');
    }
    // Pictures that carry script or PHP are not pictures.
    const head = new TextDecoder('latin1').decode(bytes.slice(0, Math.min(bytes.length, 1 << 20))).toLowerCase();
    if (head.includes('<script') || head.includes('<?php')) reasons.push('embedded_code');
  }
  return { status: reasons.length ? 'flagged' : 'passed', reasons: [...new Set(reasons)], detail };
}

/** The classifier endpoint you plug in must answer { flagged: boolean, reasons?: string[] }. Anything else is an error. */
export function interpretModeration(json: unknown): { flagged: boolean; reasons: string[] } | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as { flagged?: unknown; reasons?: unknown };
  if (typeof j.flagged !== 'boolean') return null;
  const reasons = Array.isArray(j.reasons) ? j.reasons.filter((r): r is string => typeof r === 'string').map((r) => r.slice(0, 60)).slice(0, 10) : [];
  return { flagged: j.flagged, reasons };
}

export function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function secretMatches(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
