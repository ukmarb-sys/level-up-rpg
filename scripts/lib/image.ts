/**
 * Minimal, dependency-free image inspection for the asset validator:
 * PNG/WebP header parsing and an 8-bit RGBA PNG decoder (for transparency/alignment checks).
 */
import { inflateSync } from 'node:zlib';

export interface ImageInfo {
  format: 'png' | 'webp';
  width: number;
  height: number;
  hasAlpha: boolean;
  /** Human-readable reason when the encoding isn't what the spec asks for. */
  encodingIssue?: string;
}

export interface RgbaImage {
  width: number;
  height: number;
  /** Alpha at (x, y), 0-255. */
  alpha(x: number, y: number): number;
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function readImageInfo(buf: Buffer): ImageInfo | null {
  if (buf.length >= 33 && buf.subarray(0, 8).equals(PNG_SIG) && buf.toString('ascii', 12, 16) === 'IHDR') {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    const depth = buf[24];
    const colorType = buf[25];
    const interlace = buf[28];
    const hasAlpha = colorType === 6 || colorType === 4 || (colorType === 3 && hasChunk(buf, 'tRNS'));
    let encodingIssue: string | undefined;
    if (colorType !== 6 || depth !== 8) encodingIssue = `PNG must be 8-bit RGBA (got colour type ${colorType}, ${depth}-bit)`;
    else if (interlace !== 0) encodingIssue = 'PNG must not be interlaced';
    return { format: 'png', width, height, hasAlpha, encodingIssue };
  }
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X') {
      const flags = buf[20];
      const width = 1 + buf.readUIntLE(24, 3);
      const height = 1 + buf.readUIntLE(27, 3);
      return { format: 'webp', width, height, hasAlpha: (flags & 0x10) !== 0 };
    }
    if (chunk === 'VP8L') {
      const bits = buf.readUInt32LE(21);
      return {
        format: 'webp',
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
        hasAlpha: ((bits >> 28) & 1) === 1,
      };
    }
    if (chunk === 'VP8 ') {
      return { format: 'webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, hasAlpha: false };
    }
  }
  return null;
}

function hasChunk(buf: Buffer, type: string): boolean {
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    if (buf.toString('ascii', off + 4, off + 8) === type) return true;
    off += 12 + len;
  }
  return false;
}

/** Decodes a non-interlaced 8-bit RGBA PNG. Returns null for other encodings. */
export function decodePng(buf: Buffer): RgbaImage | null {
  const info = readImageInfo(buf);
  if (!info || info.format !== 'png' || info.encodingIssue) return null;
  const { width, height } = info;
  const idat: Buffer[] = [];
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
    if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[dst + x - bpp] : 0;
      const b = y > 0 ? out[dst - stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[dst - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[dst + x] = v & 255;
    }
  }
  return { width, height, alpha: (x, y) => out[y * stride + x * bpp + 3] };
}
