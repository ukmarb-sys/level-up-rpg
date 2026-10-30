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

export interface DecodedImage {
  width: number;
  height: number;
  /** Straight (non-premultiplied) RGBA, 4 bytes per pixel. */
  data: Uint8Array;
  /** True if the file carries any transparency information. */
  hasAlpha: boolean;
}

interface Chunks {
  ihdr: Buffer;
  idat: Buffer;
  plte?: Buffer;
  trns?: Buffer;
}

function readChunks(buf: Buffer): Chunks | null {
  if (buf.length < 33 || !buf.subarray(0, 8).equals(PNG_SIG)) return null;
  const idat: Buffer[] = [];
  let ihdr: Buffer | undefined;
  let plte: Buffer | undefined;
  let trns: Buffer | undefined;
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  return ihdr ? { ihdr, idat: Buffer.concat(idat), plte, trns } : null;
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * Decodes common PNG variants produced by image tools: greyscale, RGB, palette (with tRNS),
 * grey+alpha and RGBA, at 8 or 16 bits per channel, non-interlaced. Returns RGBA8.
 */
export function decodeImage(buf: Buffer): DecodedImage {
  const c = readChunks(buf);
  if (!c) throw new Error('Not a PNG file (convert WebP/JPEG to PNG first)');
  const width = c.ihdr.readUInt32BE(0);
  const height = c.ihdr.readUInt32BE(4);
  const depth = c.ihdr[8];
  const colorType = c.ihdr[9];
  const interlace = c.ihdr[12];
  const channels = CHANNELS[colorType];
  if (!channels) throw new Error(`Unsupported PNG colour type ${colorType}`);
  if (interlace !== 0) throw new Error('Interlaced PNGs are not supported; re-export without interlacing');
  if (depth !== 8 && depth !== 16) throw new Error(`Unsupported PNG bit depth ${depth} (use 8 or 16)`);
  if (colorType === 3 && depth !== 8) throw new Error('Palette PNGs must be 8-bit');
  const bytesPerSample = depth / 8;
  const bpp = channels * bytesPerSample;
  const stride = width * bpp;
  const raw = inflateSync(c.idat);
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[dst + x - bpp] : 0;
      const b = y > 0 ? px[dst - stride + x] : 0;
      const cc = x >= bpp && y > 0 ? px[dst - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - cc;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - cc);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : cc;
      }
      px[dst + x] = v & 255;
    }
  }
  const sample = (i: number) => px[i * bytesPerSample]; // high byte of 16-bit samples
  const out = new Uint8Array(width * height * 4);
  const trnsGrey = colorType === 0 && c.trns ? c.trns.readUInt16BE(0) : -1;
  const trnsRgb = colorType === 2 && c.trns ? [c.trns.readUInt16BE(0), c.trns.readUInt16BE(2), c.trns.readUInt16BE(4)] : null;
  const full = (i: number) => (bytesPerSample === 2 ? px.readUInt16BE(i * 2) : px[i]);
  for (let p = 0; p < width * height; p++) {
    const s = p * channels;
    const o = p * 4;
    switch (colorType) {
      case 0:
        out[o] = out[o + 1] = out[o + 2] = sample(s);
        out[o + 3] = full(s) === trnsGrey ? 0 : 255;
        break;
      case 2:
        out[o] = sample(s);
        out[o + 1] = sample(s + 1);
        out[o + 2] = sample(s + 2);
        out[o + 3] = trnsRgb && full(s) === trnsRgb[0] && full(s + 1) === trnsRgb[1] && full(s + 2) === trnsRgb[2] ? 0 : 255;
        break;
      case 3: {
        const idx = px[p];
        out[o] = c.plte?.[idx * 3] ?? 0;
        out[o + 1] = c.plte?.[idx * 3 + 1] ?? 0;
        out[o + 2] = c.plte?.[idx * 3 + 2] ?? 0;
        out[o + 3] = c.trns && idx < c.trns.length ? c.trns[idx] : 255;
        break;
      }
      case 4:
        out[o] = out[o + 1] = out[o + 2] = sample(s);
        out[o + 3] = sample(s + 1);
        break;
      case 6:
        out[o] = sample(s);
        out[o + 1] = sample(s + 1);
        out[o + 2] = sample(s + 2);
        out[o + 3] = sample(s + 3);
        break;
    }
  }
  const hasAlpha = colorType === 4 || colorType === 6 || !!c.trns;
  return { width, height, data: out, hasAlpha };
}

/** Decodes a non-interlaced 8-bit RGBA PNG (the required master format). Null for other encodings. */
export function decodePng(buf: Buffer): RgbaImage | null {
  const info = readImageInfo(buf);
  if (!info || info.format !== 'png' || info.encodingIssue) return null;
  const img = decodeImage(buf);
  return { width: img.width, height: img.height, alpha: (x, y) => img.data[(y * img.width + x) * 4 + 3] };
}
