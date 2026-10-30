/** RGBA PNG encoder (used by the art importer and to build synthetic test fixtures). */
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export type Paint = (x: number, y: number) => [number, number, number, number] | null;

export function encodePng(width: number, height: number, paint: Paint, colorType = 6): Buffer {
  const bpp = colorType === 6 ? 4 : 3;
  const raw = Buffer.alloc((width * bpp + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * bpp + 1);
    for (let x = 0; x < width; x++) {
      const px = paint(x, y) ?? [0, 0, 0, 0];
      px.slice(0, bpp).forEach((v, i) => (raw[row + 1 + x * bpp + i] = v));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Point-in-convex-polygon test for painting footprint diamonds. */
export function inPoly(x: number, y: number, pts: { x: number; y: number }[]) {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (cross !== 0) {
      if (sign === 0) sign = Math.sign(cross);
      else if (Math.sign(cross) !== sign) return false;
    }
  }
  return true;
}

/** Encodes a straight-alpha RGBA buffer (width * height * 4 bytes) as an 8-bit RGBA PNG. */
export function encodeRgba(width: number, height: number, data: Uint8Array): Buffer {
  return encodePng(width, height, (x, y) => {
    const i = (y * width + x) * 4;
    return data[i + 3] ? [data[i], data[i + 1], data[i + 2], data[i + 3]] : null;
  });
}

/**
 * Low-level PNG writer for arbitrary colour types/bit depths (unfiltered rows). Used by tests
 * to reproduce the variants image tools export (palette + tRNS, grey+alpha, 16-bit, ...).
 */
export function encodeRawPng(
  width: number,
  height: number,
  colorType: number,
  depth: number,
  rows: Buffer[],
  extra: { type: string; data: Buffer }[] = [],
): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = depth;
  ihdr[9] = colorType;
  const raw = Buffer.concat(rows.map((r) => Buffer.concat([Buffer.from([0]), r])));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...extra.map((c) => chunk(c.type, c.data)),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
