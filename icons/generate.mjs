import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const root = dirname(fileURLToPath(import.meta.url));
mkdirSync(root, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  writeFileSync(resolve(root, `icon${size}.png`), png(size));
}

function png(size) {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  const stride = 1 + size * 3;
  const raw = Buffer.alloc(stride * size);
  const bg = [30, 61, 107];
  const fg = [61, 139, 253];
  const ink = [237, 240, 246];

  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < size; x++) {
      const color = paint(x, y, size, bg, fg, ink);
      const offset = y * stride + 1 + x * 3;
      raw[offset] = color[0];
      raw[offset + 1] = color[1];
      raw[offset + 2] = color[2];
    }
  }

  return Buffer.concat([header, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function paint(x, y, size, bg, fg, ink) {
  const pad = Math.max(1, Math.round(size * 0.12));
  const inSquare = x >= pad && x < size - pad && y >= pad && y < size - pad;
  if (!inSquare) return bg;

  const nx = (x - pad) / (size - pad * 2);
  const ny = (y - pad) / (size - pad * 2);
  const inCircle = (nx - 0.5) ** 2 + (ny - 0.5) ** 2 < 0.16;
  const inBar = nx > 0.18 && nx < 0.82 && ny > 0.42 && ny < 0.58;
  if (inCircle || inBar) return ink;
  return fg;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([length, typeBuf, data, crc]);
}

function crc32(buffer) {
  const table = crcTable();
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function crcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}
