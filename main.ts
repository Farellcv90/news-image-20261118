// news-image-20261118 v3 — "The World in One Day"
// Wednesday 18 November 2026. Drawn entirely in code: a 1024x1024
// newspaper front page with 33 stories, rendered at 2048x2048 and
// downsampled 2x2 for smooth anti-aliased type and shapes.
// Node 22+, stdlib only. No network, no file reads, no randomness,
// no Date calls. Fully deterministic output.
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

// ---------- canvas ----------
// Work buffer is 2048x2048; final image is 1024x1024 after 2x2 averaging.
const BIG = 2048;
const OUT = 1024;
const buf = new Uint8Array(BIG * BIG * 3);

type RGB = [number, number, number];
const NAVY: RGB = [31, 42, 68];
const CREAM: RGB = [244, 239, 228];
const INK: RGB = [17, 17, 17];
const RED: RGB = [179, 35, 42];
const WHITE: RGB = [255, 255, 255];
const GREY: RGB = [110, 110, 105];
const LIGHTGREY: RGB = [200, 198, 188];
const SEA: RGB = [188, 211, 224];
const LAND: RGB = [217, 192, 138];
const DARKBLUE: RGB = [38, 64, 110];
const MIDBLUE: RGB = [90, 130, 175];
const SKYBLUE: RGB = [168, 198, 220];
const TAN: RGB = [205, 170, 110];
const BROWN: RGB = [122, 84, 52];
const GREEN: RGB = [46, 125, 70];
const LIGHTGREEN: RGB = [140, 190, 140];
const ORANGE: RGB = [224, 122, 42];
const GOLD: RGB = [212, 175, 60];
const DARKRED: RGB = [140, 30, 30];
const TEAL: RGB = [52, 120, 118];
const PINK: RGB = [222, 170, 170];
const NIGHT: RGB = [16, 24, 48];
const DARKSEA: RGB = [28, 52, 84];

function fillAll(c: RGB): void {
  for (let i = 0; i < BIG * BIG; i++) {
    buf[i * 3] = c[0];
    buf[i * 3 + 1] = c[1];
    buf[i * 3 + 2] = c[2];
  }
}

// Set one pixel in the 2048 buffer.
function px2(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= BIG || y >= BIG) return;
  const i = (y * BIG + x) * 3;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
}

// Filled rect in 2048 coords.
function rect2(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(BIG, Math.ceil(x + w));
  const y1 = Math.min(BIG, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * BIG + x0) * 3;
    for (let xx = x0; xx < x1; xx++) {
      buf[i] = c[0];
      buf[i + 1] = c[1];
      buf[i + 2] = c[2];
      i += 3;
    }
  }
}

// All public drawing helpers take FINAL (1024-space) coordinates and
// scale by 2 into the 2048 buffer.
function rectF(x: number, y: number, w: number, h: number, c: RGB): void {
  rect2(x * 2, y * 2, w * 2, h * 2, c);
}

function circleF(cx: number, cy: number, r: number, c: RGB): void {
  const R = r * 2;
  const CX = cx * 2;
  const CY = cy * 2;
  const r2 = R * R;
  for (let yy = Math.floor(CY - R); yy <= Math.ceil(CY + R); yy++) {
    const dy = yy - CY;
    const dx = Math.sqrt(Math.max(0, r2 - dy * dy));
    for (let xx = Math.floor(CX - dx); xx <= Math.ceil(CX + dx); xx++) {
      px2(xx, yy, c);
    }
  }
}

// Ring (outline circle) in final coords.
function ringF(cx: number, cy: number, r: number, t: number, c: RGB): void {
  const R = r * 2;
  const CX = cx * 2;
  const CY = cy * 2;
  const t2 = t * 2;
  for (let yy = Math.floor(CY - R - t2); yy <= Math.ceil(CY + R + t2); yy++) {
    for (let xx = Math.floor(CX - R - t2); xx <= Math.ceil(CX + R + t2); xx++) {
      const d = Math.sqrt((xx - CX) * (xx - CX) + (yy - CY) * (yy - CY));
      if (d >= R - t2 / 2 && d <= R + t2 / 2) px2(xx, yy, c);
    }
  }
}

// Thick line in final coords (Bresenham, stamping squares).
function lineF(x0: number, y0: number, x1: number, y1: number, c: RGB, th = 1): void {
  const X0 = x0 * 2;
  const Y0 = y0 * 2;
  const X1 = x1 * 2;
  const Y1 = y1 * 2;
  const dx = X1 - X0;
  const dy = Y1 - Y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  const s = th * 2;
  const half = Math.floor(s / 2);
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(X0 + (dx * i) / steps);
    const y = Math.round(Y0 + (dy * i) / steps);
    for (let a = -half; a <= half; a++) {
      for (let b = -half; b <= half; b++) px2(x + a, y + b, c);
    }
  }
}

// Filled polygon (final coords), scanline fill.
function polyF(pts: [number, number][], c: RGB): void {
  const P = pts.map(([x, y]) => [x * 2, y * 2] as [number, number]);
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of P) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < P.length; i++) {
      const [x1, y1] = P[i];
      const [x2, y2] = P[(i + 1) % P.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) px2(x, y, c);
    }
  }
}

// Stippled (checker-dithered) rect: small darker dots on a base fill,
// for shading scenes without banding.
function stippleF(x: number, y: number, w: number, h: number, c: RGB, gap = 3): void {
  for (let yy = y * 2; yy < (y + h) * 2; yy += gap * 2) {
    for (let xx = x * 2; xx < (x + w) * 2; xx += gap * 2) {
      if (((xx + yy) / 2) % 2 === 0) rect2(xx, yy, 2, 2, c);
    }
  }
}

// ---------- bitmap font ----------
// 5x7 glyphs, written out by hand. '1' = ink, '0' = empty.
// scale = pixels per font-pixel in the 2048 buffer (so final size is
// scale/2 px per font pixel). Sizes used: 11 giant, 5 headline,
// 4 deck, 3 small, 2 tiny.
const GLYPHS: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "=": ["00000", "00000", "01110", "00000", "01110", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "€": ["00110", "01001", "10000", "11110", "10000", "01001", "00110"],
  "·": ["00000", "00000", "00000", "01100", "01100", "00000", "00000"],
  "•": ["00000", "00000", "01110", "01110", "01110", "00000", "00000"],
};

// Width of a string in final px at a given scale.
function textW(s: string, scale: number): number {
  return ((s.length * 6 - 1) * scale) / 2;
}

// Draw text at final coords (top-left), scale in 2048 units.
function textF(x: number, y: number, s: string, scale: number, c: RGB): void {
  let cx = Math.round(x * 2);
  const cy = Math.round(y * 2);
  for (const ch of s.toUpperCase()) {
    const g = GLYPHS[ch] || GLYPHS["?"];
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r][col] === "1") rect2(cx + col * scale, cy + r * scale, scale, scale, c);
      }
    }
    cx += 6 * scale;
  }
}

function textCenterF(cx: number, y: number, s: string, scale: number, c: RGB): void {
  textF(cx - textW(s, scale) / 2, y, s, scale, c);
}

function textRightF(rx: number, y: number, s: string, scale: number, c: RGB): void {
  textF(rx - textW(s, scale), y, s, scale, c);
}

// Word wrap on word boundaries, in final px. Never leaves a single
// short word (5 letters or fewer) alone on the last line: pull the
// previous line's last word down instead.
function wrapLines(s: string, maxW: number, scale: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  const cw = (t: string) => textW(t, scale);
  for (const w of words) {
    if (cur === "") {
      cur = w;
    } else if (cw(cur + " " + w) <= maxW) {
      cur = cur + " " + w;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  // Orphan fix: last line a single short word -> steal a word from above.
  while (lines.length > 1) {
    const last = lines[lines.length - 1];
    const lastWords = last.split(" ");
    if (lastWords.length === 1 && lastWords[0].length <= 5) {
      const prev = lines[lines.length - 2].split(" ");
      if (prev.length <= 1) break;
      const stolen = prev.pop() as string;
      lines[lines.length - 2] = prev.join(" ");
      lines[lines.length - 1] = stolen + " " + last;
    } else break;
  }
  return lines;
}

// Draw wrapped text; returns number of lines drawn.
function textWrapF(
  x: number,
  y: number,
  s: string,
  scale: number,
  c: RGB,
  maxW: number,
  lineH: number,
  maxLines = 99,
): number {
  const lines = wrapLines(s, maxW, scale).slice(0, maxLines);
  lines.forEach((ln, i) => textF(x, y + i * lineH, ln, scale, c));
  return lines.length;
}

// ---------- minimal PNG encoder ----------
const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePNG(w: number, h: number, rgb: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = w * 3;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgb.buffer, rgb.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Downsample the 2048 buffer to 1024 by 2x2 averaging.
function downsample(): Uint8Array {
  const out = new Uint8Array(OUT * OUT * 3);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const i = ((y * 2 + dy) * BIG + (x * 2 + dx)) * 3;
          r += buf[i];
          g += buf[i + 1];
          b += buf[i + 2];
        }
      }
      const o = (y * OUT + x) * 3;
      out[o] = Math.round(r / 4);
      out[o + 1] = Math.round(g / 4);
      out[o + 2] = Math.round(b / 4);
    }
  }
  return out;
}

// ---------- dot-matrix world map ----------
// Coarse land mask, 96 columns x 48 rows, drawn from the shape of the
// continents (equirectangular: col 0 = 180W, col 95 = 180E;
// row 0 = 90N, row 47 = 90S). '#' = land, '.' = sea. Short rows are
// treated as sea on the right.
const MAP_ROWS: string[] = [
  ".................................######.............................................",
  "..........................######..##########.........................................",
  "..........######################..###########....................###################",
  "......##########################..##########..................######################",
  "...########......................######.......#####..........#######################",
  "...#########......................#####......######.........#######################.",
  "....########......................####...#########..........#######################.",
  ".....######.......................###...##########..........#######################.",
  ".............#####################....##########..........#######################..",
  "..............####################..###########.........#######################...",
  "..............####################.###########..........######################....",
  "...............##################..##########..........#####################......",
  "................#################.##########...........###################...##...",
  ".................################..#########...........##################...##....",
  "..................###############..##########..........#################....#.....",
  "...................#############..############.........##################..........",
  ".................########......#############..........#################...........",
  "................########.......############...........################............",
  ".................#######.......#############..........################............",
  "...................######.......############...........###############............",
  "....................######......############............##############............",
  "......................####......###########.............#############.............",
  "........................######..##########..............############..............",
  "........................#######.#########..............###########...............",
  "........................################...............##########....####.........",
  "........................###############................#########....#####........",
  ".........................#######.......####...............########....####.........",
  ".........................######.........###..............##########...............",
  ".........................######.........###..............##########...............",
  "..........................#####.........###..............#########................",
  "..........................####..........##..............#########................",
  "..........................####..........##..............########.................",
  "..........................###...........##..............#######..........##........",
  "..........................###...........................######...........#.........",
  "..........................##......................................................",
  "..........................##......................................................",
  "..........................#.......................................................",
  "..........................#.......................................................",
  "................................................................................",
  "................................................................................",
  "................................................................................",
  "................................................................................",
  "................................................................................",
  "................................................................................",
  "..............................########################################............",
  "....................####################################################..........",
  "...............##########################################################.........",
  "..........################################################################........",
];

// Story dot positions (lon, lat), spread slightly where stories share
// a region so no two numbered dots overlap.
const DOTS: [number, number][] = [
  [50, 26], // 1 Bahrain
  [31, 47], // 2 Crimea bridge (nudged north-west of Israel dot)
  [121, 14], // 3 Manila
  [-122, 37], // 4 Nvidia, California
  [84, 20], // 5 Cyclone Akvan, Andhra Pradesh
  [35, 32], // 6 Knesset, Israel
  [10, 53], // 7 EU, Brussels (nudged east of London)
  [-6, 54], // 8 London
  [116, 40], // 9 Beijing
  [87, 55], // 10 Siberia
  [78, 8], // 11 Chennai / Dhoni
  [-108, 32], // 12 Apple (nudged south-east of the Nvidia dot)
  [76, 33], // 13 Delhi (nudged north of the India cluster)
  [68, 21], // 14 Gujarat solar
  [139, 36], // 15 Japan
];

function drawMap(x: number, y: number, w: number, h: number): void {
  rectF(x, y, w, h, SEA);
  // Stippled wave texture on the sea, sparse.
  stippleF(x + 4, y + 4, w - 8, h - 8, [168, 196, 214], 12);
  const cw = w / 96;
  const ch = h / 48;
  for (let r = 0; r < 48; r++) {
    const row = MAP_ROWS[r] || "";
    for (let c = 0; c < 96; c++) {
      if (row[c] === "#") {
        circleF(x + (c + 0.5) * cw, y + (r + 0.5) * ch, Math.min(cw, ch) * 0.42, LAND);
      }
    }
  }
  // Numbered story dots.
  for (let i = 0; i < DOTS.length; i++) {
    const [lon, lat] = DOTS[i];
    const dx = x + ((lon + 180) / 360) * w;
    const dy = y + ((90 - lat) / 180) * h;
    circleF(dx, dy, 5.5, RED);
    ringF(dx, dy, 5.5, 1, WHITE);
    const label = String(i + 1);
    textF(dx - textW(label, 2) / 2, dy - 3.5, label, 2, WHITE);
  }
}

// ---------- lead scenes (rich detail, stippled shading) ----------
// Each scene is drawn inside rect (x, y, w, h) in final coords.

function leadScene1(x: number, y: number, w: number, h: number): void {
  // Night over a Gulf radar station: stars, red horizon, radar dome
  // with beam, flames, sea texture, drones.
  rectF(x, y, w, h, NIGHT);
  // Stars: fixed deterministic pattern.
  const stars: [number, number][] = [
    [12, 8], [34, 16], [58, 6], [82, 14], [108, 7], [132, 18], [158, 9],
    [184, 15], [208, 6], [234, 17], [260, 8], [286, 14], [308, 7],
    [22, 26], [70, 28], [120, 25], [170, 29], [220, 26], [270, 28], [300, 25],
  ];
  for (const [sx, sy] of stars) {
    circleF(x + sx, y + sy, 1.1, WHITE);
    circleF(x + sx + 3, y + sy + 2, 0.7, [200, 200, 220]);
  }
  // Red horizon glow bands.
  rectF(x, y + 46, w, 8, [120, 40, 34]);
  rectF(x, y + 54, w, 6, DARKRED);
  rectF(x, y + 60, w, 4, [90, 30, 28]);
  // Sea with texture.
  rectF(x, y + 64, w, h - 64, DARKSEA);
  stippleF(x, y + 66, w, h - 68, [44, 74, 112], 5);
  for (let i = 0; i < 6; i++) {
    lineF(x + 8 + i * 52, y + 72 + (i % 2) * 6, x + 38 + i * 52, y + 72 + (i % 2) * 6, [120, 160, 200], 1);
  }
  // Radar station on a low island.
  polyF([[x + 96, y + 64], [x + 232, y + 64], [x + 252, y + 76], [x + 76, y + 76]], [90, 78, 60]);
  rectF(x + 128, y + 44, 10, 22, [150, 150, 145]);
  circleF(x + 133, y + 40, 13, [210, 210, 205]);
  ringF(x + 133, y + 40, 13, 1.5, GREY);
  lineF(x + 133, y + 40, x + 133, y + 27, GREY, 1);
  circleF(x + 133, y + 26, 2, RED);
  // Rotating beam.
  polyF([[x + 133, y + 40], [x + 196, y + 22], [x + 200, y + 30]], [255, 220, 90]);
  lineF(x + 133, y + 40, x + 198, y + 25, [255, 230, 120], 1);
  // Small second dome + mast.
  rectF(x + 196, y + 52, 7, 14, [150, 150, 145]);
  circleF(x + 199, y + 49, 8, [190, 190, 185]);
  lineF(x + 214, y + 66, x + 214, y + 42, GREY, 1);
  lineF(x + 208, y + 48, x + 220, y + 48, GREY, 1);
  // Flames on the island.
  polyF([[x + 100, y + 66], [x + 108, y + 48], [x + 116, y + 66]], ORANGE);
  polyF([[x + 112, y + 66], [x + 118, y + 54], [x + 124, y + 66]], [255, 190, 60]);
  polyF([[x + 238, y + 66], [x + 244, y + 52], [x + 250, y + 66]], ORANGE);
  // Smoke plumes.
  circleF(x + 112, y + 42, 7, [90, 90, 92]);
  circleF(x + 118, y + 34, 8, [110, 110, 112]);
  circleF(x + 246, y + 44, 6, [90, 90, 92]);
  circleF(x + 252, y + 36, 7, [110, 110, 112]);
  // Drones with lights.
  for (const [dx, dy] of [[64, 22], [262, 30], [300, 18]] as [number, number][]) {
    polyF([[x + dx, y + dy], [x + dx + 12, y + dy + 3], [x + dx, y + dy + 6]], [40, 40, 44]);
    circleF(x + dx + 6, y + dy + 3, 1.4, RED);
  }
  // Red tracer arcs.
  lineF(x + 70, y + 30, x + 96, y + 44, [255, 90, 80], 1);
  lineF(x + 268, y + 36, x + 246, y + 46, [255, 90, 80], 1);
}

function leadScene2(x: number, y: number, w: number, h: number): void {
  // Crimea bridge: one span dropped into the sea, smoke, rescue boat.
  rectF(x, y, w, h, SKYBLUE);
  // Clouds.
  circleF(x + 52, y + 12, 10, WHITE);
  circleF(x + 66, y + 10, 12, WHITE);
  circleF(x + 80, y + 13, 9, WHITE);
  circleF(x + 250, y + 16, 9, WHITE);
  circleF(x + 262, y + 13, 11, WHITE);
  circleF(x + 274, y + 16, 8, WHITE);
  // Distant headland.
  polyF([[x, y + 52], [x + 60, y + 34], [x + 110, y + 52]], [140, 160, 130]);
  polyF([[x + w - 90, y + 52], [x + w - 40, y + 36], [x + w, y + 52]], [140, 160, 130]);
  // Sea.
  rectF(x, y + 52, w, h - 52, MIDBLUE);
  stippleF(x, y + 54, w, h - 56, [70, 110, 155], 5);
  // Whitecaps.
  for (let i = 0; i < 7; i++) {
    const wx = x + 10 + i * 44;
    const wy = y + 62 + (i % 3) * 8;
    lineF(wx, wy, wx + 16, wy, WHITE, 1);
    lineF(wx + 4, wy + 3, wx + 12, wy + 3, WHITE, 1);
  }
  // Bridge deck, left and right of the gap.
  rectF(x, y + 40, 118, 7, [120, 118, 112]);
  rectF(x + 210, y + 40, w - 210, 7, [120, 118, 112]);
  // Pylons.
  rectF(x + 18, y + 22, 6, 26, [100, 98, 92]);
  rectF(x + 96, y + 22, 6, 26, [100, 98, 92]);
  rectF(x + 226, y + 22, 6, 26, [100, 98, 92]);
  rectF(x + 296, y + 22, 6, 26, [100, 98, 92]);
  // Cables.
  lineF(x + 21, y + 22, x + 60, y + 40, [80, 78, 72], 1);
  lineF(x + 99, y + 22, x + 60, y + 40, [80, 78, 72], 1);
  lineF(x + 229, y + 22, x + 268, y + 40, [80, 78, 72], 1);
  lineF(x + 299, y + 22, x + 268, y + 40, [80, 78, 72], 1);
  // Collapsed span slanting into the water.
  polyF([[x + 118, y + 42], [x + 210, y + 42], [x + 196, y + 62], [x + 132, y + 62]], [130, 128, 122]);
  lineF(x + 128, y + 48, x + 200, y + 58, [100, 98, 92], 1);
  // Splash + debris.
  circleF(x + 164, y + 64, 9, WHITE);
  circleF(x + 176, y + 66, 7, WHITE);
  rectF(x + 150, y + 60, 8, 3, [100, 98, 92]);
  rectF(x + 184, y + 62, 7, 3, [100, 98, 92]);
  // Two smoke plumes.
  circleF(x + 128, y + 32, 8, [105, 105, 105]);
  circleF(x + 136, y + 22, 10, [125, 125, 125]);
  circleF(x + 144, y + 13, 8, [140, 140, 140]);
  circleF(x + 200, y + 34, 7, [105, 105, 105]);
  circleF(x + 206, y + 25, 9, [125, 125, 125]);
  // Small rescue boat with wake.
  polyF([[x + 236, y + 74], [x + 272, y + 74], [x + 264, y + 82], [x + 244, y + 82]], ORANGE);
  rectF(x + 250, y + 66, 12, 8, WHITE);
  lineF(x + 236, y + 82, x + 222, y + 84, WHITE, 1);
  lineF(x + 272, y + 82, x + 286, y + 84, WHITE, 1);
  // Gulls.
  for (const [gx, gy] of [[40, 20], [58, 14], [290, 26]] as [number, number][]) {
    lineF(x + gx, y + gy, x + gx + 5, y + gy + 3, INK, 1);
    lineF(x + gx + 5, y + gy + 3, x + gx + 10, y + gy, INK, 1);
  }
  // Car stopped at the gap edge.
  rectF(x + 96, y + 34, 14, 6, RED);
  circleF(x + 100, y + 41, 2, INK);
  circleF(x + 107, y + 41, 2, INK);
}

function leadScene3(x: number, y: number, w: number, h: number): void {
  // Quad summit in Manila: three flags, table, nameplates, microphones.
  rectF(x, y, w, h, [214, 206, 188]);
  // Backdrop curtain.
  rectF(x, y, w, 34, NAVY);
  stippleF(x, y + 2, w, 30, [44, 56, 86], 6);
  // Flags on poles: USA, India, Japan.
  const flagX = [x + 46, x + 152, x + 258];
  for (let i = 0; i < 3; i++) {
    lineF(flagX[i], y + 4, flagX[i], y + 34, [200, 200, 190], 1);
    circleF(flagX[i], y + 3, 1.6, GOLD);
  }
  // USA: stripes + blue canton.
  for (let s = 0; s < 7; s++) {
    rectF(flagX[0] + 2, y + 6 + s * 3, 34, 2, s % 2 === 0 ? RED : WHITE);
  }
  rectF(flagX[0] + 2, y + 6, 15, 10, DARKBLUE);
  // India: saffron / white / green + wheel.
  rectF(flagX[1] + 2, y + 6, 34, 7, [255, 153, 51]);
  rectF(flagX[1] + 2, y + 13, 34, 7, WHITE);
  rectF(flagX[1] + 2, y + 20, 34, 7, [19, 136, 8]);
  circleF(flagX[1] + 19, y + 16, 3.5, DARKBLUE);
  // Japan: white + red disc.
  rectF(flagX[2] + 2, y + 6, 34, 21, WHITE);
  circleF(flagX[2] + 19, y + 16, 6, RED);
  // Seated leaders behind the table.
  const seats = [x + 62, x + 132, x + 202, x + 272];
  const suits: RGB[] = [NAVY, [70, 70, 78], [40, 60, 90], [90, 40, 44]];
  for (let i = 0; i < 4; i++) {
    polyF(
      [[seats[i] - 16, y + 62], [seats[i] + 16, y + 62], [seats[i] + 11, y + 42], [seats[i] - 11, y + 42]],
      suits[i],
    );
    circleF(seats[i], y + 34, 8, [222, 186, 150]);
    // Hair.
    polyF([[seats[i] - 8, y + 34], [seats[i] + 8, y + 34], [seats[i] + 7, y + 27], [seats[i] - 7, y + 27]], [60, 50, 44]);
    // Shirt + tie.
    polyF([[seats[i] - 3, y + 42], [seats[i] + 3, y + 42], [seats[i], y + 52]], WHITE);
    lineF(seats[i], y + 43, seats[i], y + 56, RED, 1);
  }
  // Summit table.
  rectF(x, y + 62, w, 12, BROWN);
  rectF(x, y + 62, w, 3, [150, 110, 76]);
  stippleF(x, y + 66, w, 6, [100, 68, 42], 4);
  // Nameplates.
  for (let i = 0; i < 4; i++) {
    rectF(seats[i] - 12, y + 56, 24, 7, WHITE);
    lineF(seats[i] - 9, y + 59, seats[i] + 9, y + 59, GREY, 1);
  }
  // Microphones.
  for (let i = 0; i < 4; i++) {
    lineF(seats[i] + 14, y + 62, seats[i] + 18, y + 52, INK, 1);
    circleF(seats[i] + 18, y + 51, 2, INK);
  }
  // Water glasses + papers on the table.
  for (let i = 0; i < 4; i++) {
    rectF(seats[i] - 24, y + 64, 4, 6, [180, 210, 225]);
    rectF(seats[i] + 20, y + 64, 10, 6, WHITE);
  }
  // ASEAN emblem plaque centre-front.
  circleF(x + w / 2, y + 80, 6, GOLD);
  ringF(x + w / 2, y + 80, 6, 1, [150, 120, 40]);
}

// ---------- featured icons ----------
// Each icon fills a tinted panel (x, y, w, h) with a small scene plus
// 2-3 extra story details. n = story number 4..15.
function drawIcon(n: number, x: number, y: number, w: number, h: number): void {
  const cx = x + w / 2;
  switch (n) {
    case 4: { // Nvidia chip + rising chart
      rectF(x, y, w, h, [214, 232, 214]);
      rectF(x + 8, y + 6, 150, 32, [30, 60, 40]);
      stippleF(x + 8, y + 6, 150, 32, [20, 45, 30], 5);
      rectF(x + 58, y + 14, 52, 18, [12, 12, 14]);
      textF(x + 70, y + 18, "NV", 2, [120, 200, 130]);
      for (let i = 0; i < 5; i++) {
        lineF(x + 58, y + 17 + i * 3, x + 52, y + 17 + i * 3, GOLD, 1);
        lineF(x + 110, y + 17 + i * 3, x + 116, y + 17 + i * 3, GOLD, 1);
      }
      lineF(x + 8, y + 10, x + 52, y + 10, GOLD, 1);
      lineF(x + 116, y + 30, x + 150, y + 30, GOLD, 1);
      // Rising chart.
      lineF(x + 168, y + 36, x + 168, y + 8, INK, 1);
      lineF(x + 168, y + 36, x + 238, y + 36, INK, 1);
      lineF(x + 172, y + 32, x + 190, y + 24, RED, 2);
      lineF(x + 190, y + 24, x + 208, y + 26, RED, 2);
      lineF(x + 208, y + 26, x + 232, y + 10, RED, 2);
      polyF([[x + 232, y + 10], [x + 226, y + 12], [x + 232, y + 16]], RED);
      circleF(x + 190, y + 24, 2, RED);
      break;
    }
    case 5: { // Cyclone over a coast
      rectF(x, y, w, h, [200, 220, 235]);
      // Spiral: offset rings.
      ringF(cx - 30, y + 20, 14, 2, [40, 70, 110]);
      ringF(cx - 30, y + 20, 9, 2, [40, 70, 110]);
      ringF(cx - 30, y + 20, 4, 2, [40, 70, 110]);
      circleF(cx - 30, y + 20, 2.5, RED);
      // Rain bands.
      for (let i = 0; i < 4; i++) {
        lineF(x + 150 + i * 16, y + 4, x + 142 + i * 16, y + 22, MIDBLUE, 1);
        lineF(x + 20 + i * 14, y + 30, x + 14 + i * 14, y + 42, MIDBLUE, 1);
      }
      // Coastline + sea.
      polyF([[x, y + h], [x, y + 34], [x + 90, y + 38], [x + 150, y + 32], [x + w, y + 36], [x + w, y + h]], LAND);
      rectF(x, y + 38, w, h - 38, SEA);
      stippleF(x, y + 38, w, h - 38, [150, 185, 205], 5);
      // Wind arrow.
      lineF(x + 176, y + 30, x + 216, y + 30, DARKBLUE, 2);
      polyF([[x + 216, y + 30], [x + 206, y + 25], [x + 206, y + 35]], DARKBLUE);
      break;
    }
    case 6: { // Knesset building
      rectF(x, y, w, h, [232, 224, 200]);
      rectF(cx - 52, y + 18, 104, 20, [250, 248, 240]);
      rectF(cx - 56, y + 36, 112, 4, [200, 196, 184]);
      circleF(cx, y + 16, 13, [120, 140, 170]);
      rectF(cx - 13, y + 16, 26, 3, [120, 140, 170]);
      for (let i = -2; i <= 2; i++) {
        rectF(cx + i * 20 - 3, y + 22, 6, 14, [180, 176, 164]);
      }
      rectF(cx - 5, y + 28, 10, 10, BROWN);
      // Flag + steps.
      lineF(cx + 66, y + 6, cx + 66, y + 22, INK, 1);
      rectF(cx + 68, y + 6, 20, 11, WHITE);
      lineF(cx + 68, y + 9, cx + 88, y + 9, DARKBLUE, 1);
      lineF(cx + 68, y + 14, cx + 88, y + 14, DARKBLUE, 1);
      rectF(cx - 60, y + 40, 120, 3, [180, 176, 164]);
      // Ballot box.
      rectF(x + 14, y + 26, 16, 12, NAVY);
      rectF(x + 17, y + 22, 10, 4, NAVY);
      break;
    }
    case 7: { // Euro sign + coins
      rectF(x, y, w, h, NAVY);
      stippleF(x, y, w, h, [44, 56, 86], 6);
      textF(cx - 34, y + 6, "€", 8, GOLD);
      circleF(x + 196, y + 12, 7, GOLD);
      textF(x + 192, y + 8, "€", 2, NAVY);
      circleF(x + 212, y + 30, 7, GOLD);
      textF(x + 208, y + 26, "€", 2, NAVY);
      circleF(x + 30, y + 34, 6, GOLD);
      textF(x + 26, y + 30, "€", 2, NAVY);
      // Coins stack.
      for (let i = 0; i < 3; i++) rectF(x + 170 + i * 4, y + 34 - i * 3, 34, 3, GOLD);
      break;
    }
    case 8: { // Parliament + sanction stamp
      rectF(x, y, w, h, [228, 228, 224]);
      // Parliament block.
      rectF(cx - 58, y + 14, 116, 22, [190, 186, 172]);
      polyF([[cx - 62, y + 14], [cx, y + 2], [cx + 62, y + 14]], [160, 156, 142]);
      for (let i = -2; i <= 2; i++) {
        rectF(cx + i * 20 - 3, y + 18, 6, 16, [150, 146, 132]);
      }
      rectF(cx - 6, y + 26, 12, 10, BROWN);
      // Red sanction stamp.
      ringF(cx + 78, y + 26, 15, 2.5, RED);
      ringF(cx + 78, y + 26, 11, 1.5, RED);
      lineF(cx + 66, y + 36, cx + 90, y + 16, RED, 2.5);
      textF(cx + 70, y + 23, "NO", 2, RED);
      // Union flag hint.
      rectF(x + 8, y + 6, 22, 12, DARKBLUE);
      lineF(x + 8, y + 6, x + 30, y + 18, WHITE, 1);
      lineF(x + 30, y + 6, x + 8, y + 18, WHITE, 1);
      break;
    }
    case 9: { // Cargo ship
      rectF(x, y, w, h, [198, 220, 232]);
      // Crane.
      lineF(x + 16, y + 6, x + 16, y + 34, [90, 90, 88], 2);
      lineF(x + 16, y + 6, x + 62, y + 6, [90, 90, 88], 2);
      lineF(x + 16, y + 6, x + 44, y + 22, [90, 90, 88], 1);
      lineF(x + 52, y + 6, x + 52, y + 14, [90, 90, 88], 1);
      rectF(x + 48, y + 14, 9, 7, BROWN);
      // Containers.
      const cols: RGB[] = [RED, [40, 90, 140], GOLD, GREEN, [200, 90, 40]];
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 4; c++) {
          rectF(x + 78 + c * 30, y + 12 + r * 11, 28, 10, cols[(r * 4 + c) % 5]);
          lineF(x + 78 + c * 30, y + 17 + r * 11, x + 106 + c * 30, y + 17 + r * 11, [0, 0, 0], 1);
        }
      }
      // Hull + bridge.
      polyF([[x + 60, y + 34], [x + 216, y + 34], [x + 204, y + 42], [x + 72, y + 42]], [40, 50, 60]);
      rectF(x + 196, y + 22, 16, 12, WHITE);
      rectF(x + 199, y + 24, 10, 4, DARKBLUE);
      // Waves.
      lineF(x + 8, y + 43, x + 40, y + 43, WHITE, 1);
      lineF(x + 210, y + 43, x + 238, y + 43, WHITE, 1);
      break;
    }
    case 10: { // Plane crashing in snow
      rectF(x, y, w, h, [210, 222, 232]);
      // Mountains.
      polyF([[x, y + h], [x + 40, y + 18], [x + 80, y + h]], [170, 180, 190]);
      polyF([[x + 60, y + h], [x + 110, y + 10], [x + 160, y + h]], [150, 162, 175]);
      polyF([[x + 40, y + 18], [x + 30, y + 28], [x + 50, y + 28]], WHITE);
      polyF([[x + 110, y + 10], [x + 100, y + 20], [x + 120, y + 20]], WHITE);
      // Smoke trail.
      circleF(x + 150, y + 12, 6, [120, 120, 120]);
      circleF(x + 162, y + 16, 7, [135, 135, 135]);
      circleF(x + 175, y + 21, 8, [150, 150, 150]);
      // Plane, nose down, larger and centred.
      polyF([[x + 168, y + 20], [x + 214, y + 32], [x + 170, y + 36]], [90, 95, 105]);
      polyF([[x + 186, y + 24], [x + 190, y + 10], [x + 198, y + 26]], [70, 75, 85]);
      polyF([[x + 182, y + 36], [x + 188, y + 46], [x + 194, y + 36]], [70, 75, 85]);
      rectF(x + 202, y + 28, 10, 5, RED);
      circleF(x + 196, y + 28, 2, WHITE);
      // Snow dots.
      for (const [sx, sy] of [[20, 8], [60, 6], [100, 12], [140, 6], [220, 8], [40, 30], [230, 34]] as [number, number][]) {
        circleF(x + sx, y + sy, 1.4, WHITE);
      }
      // Snow ground.
      rectF(x, y + h - 4, w, 4, WHITE);
      break;
    }
    case 11: { // Cricket bat + stumps
      rectF(x, y, w, h, [216, 234, 200]);
      // Pitch strip.
      rectF(cx - 70, y + 30, 140, 12, [222, 200, 150]);
      stippleF(cx - 70, y + 30, 140, 12, [200, 178, 128], 4);
      // Stumps.
      for (let i = -1; i <= 1; i++) {
        rectF(cx + 58 + i * 6, y + 8, 3, 20, GOLD);
      }
      rectF(cx + 52, y + 6, 15, 3, GOLD);
      // Bat, angled.
      polyF([[cx - 66, y + 40], [cx - 52, y + 6], [cx - 44, y + 9], [cx - 56, y + 40]], [150, 100, 60]);
      rectF(cx - 52, y + 2, 6, 8, [120, 80, 46]);
      // Ball + bails flying.
      circleF(cx - 78, y + 12, 4, RED);
      rectF(cx + 66, y + 2, 5, 2, GOLD);
      // Scoreboard hint.
      rectF(x + 8, y + 6, 34, 12, NAVY);
      textF(x + 12, y + 9, "272", 2, WHITE);
      break;
    }
    case 12: { // Phone with restored services
      rectF(x, y, w, h, [228, 230, 232]);
      rectF(cx - 22, y + 3, 44, 38, [30, 32, 36]);
      rectF(cx - 19, y + 6, 38, 30, [120, 190, 230]);
      // App icons on screen.
      const appCols: RGB[] = [RED, GREEN, GOLD, [90, 90, 200]];
      for (let i = 0; i < 4; i++) {
        rectF(cx - 16 + i * 9, y + 10, 7, 7, appCols[i]);
      }
      rectF(cx - 16, y + 20, 20, 3, WHITE);
      rectF(cx - 16, y + 25, 14, 3, WHITE);
      lineF(cx - 8, y + 38, cx + 8, y + 38, [120, 120, 122], 1);
      // Signal bars + check.
      for (let i = 0; i < 4; i++) rectF(x + 178 + i * 6, y + 32 - i * 3, 4, 6 + i * 3, GREEN);
      circleF(x + 44, y + 12, 9, GREEN);
      lineF(x + 38, y + 12, x + 42, y + 16, WHITE, 2);
      lineF(x + 42, y + 16, x + 51, y + 7, WHITE, 2);
      // Cloud with arrow.
      circleF(x + 200, y + 12, 6, MIDBLUE);
      circleF(x + 208, y + 10, 7, MIDBLUE);
      circleF(x + 216, y + 12, 6, MIDBLUE);
      break;
    }
    case 13: { // Rising bar chart
      rectF(x, y, w, h, [236, 232, 214]);
      lineF(x + 30, y + 6, x + 30, y + 38, INK, 1);
      lineF(x + 30, y + 38, x + 220, y + 38, INK, 1);
      const bars: [number, RGB][] = [
        [10, [140, 160, 190]],
        [16, [120, 145, 180]],
        [24, [90, 120, 160]],
        [32, GREEN],
      ];
      bars.forEach(([bh, col], i) => {
        rectF(x + 44 + i * 42, y + 38 - bh, 30, bh, col);
        stippleF(x + 44 + i * 42, y + 38 - bh, 30, bh, [0, 0, 0], 6);
      });
      // Arrow over the bars.
      lineF(x + 48, y + 24, x + 200, y + 4, RED, 2);
      polyF([[x + 200, y + 4], [x + 190, y + 4], [x + 200, y + 12]], RED);
      textF(x + 196, y + 14, "7.5%", 3, RED);
      break;
    }
    case 14: { // Sun + wind turbine
      rectF(x, y, w, h, [214, 230, 235]);
      // Sun with rays.
      circleF(x + 52, y + 13, 10, GOLD);
      for (let a = 0; a < 8; a++) {
        const ang = (a * Math.PI) / 4;
        lineF(
          x + 52 + Math.cos(ang) * 13,
          y + 13 + Math.sin(ang) * 13,
          x + 52 + Math.cos(ang) * 18,
          y + 13 + Math.sin(ang) * 18,
          GOLD,
          1.5,
        );
      }
      // Hills.
      polyF([[x, y + h], [x + 60, y + 28], [x + 130, y + h]], LIGHTGREEN);
      polyF([[x + 110, y + h], [x + 180, y + 30], [x + w, y + h]], [110, 170, 110]);
      // Turbine.
      lineF(cx + 40, y + 8, cx + 40, y + 40, WHITE, 2);
      circleF(cx + 40, y + 8, 2.5, GREY);
      for (let a = 0; a < 3; a++) {
        const ang = (a * 2 * Math.PI) / 3 - Math.PI / 2;
        lineF(cx + 40, y + 8, cx + 40 + Math.cos(ang) * 15, y + 8 + Math.sin(ang) * 15, WHITE, 2);
      }
      // Solar panels.
      polyF([[x + 150, y + 34], [x + 180, y + 30], [x + 186, y + 38], [x + 156, y + 42]], DARKBLUE);
      lineF(x + 165, y + 32, x + 171, y + 40, [150, 180, 210], 1);
      polyF([[x + 190, y + 36], [x + 214, y + 33], [x + 218, y + 40], [x + 194, y + 43]], DARKBLUE);
      break;
    }
    case 15: { // Fighter jets
      rectF(x, y, w, h, [190, 210, 228]);
      // Sun + clouds.
      circleF(x + 216, y + 10, 8, [255, 220, 120]);
      circleF(x + 40, y + 8, 8, WHITE);
      circleF(x + 52, y + 6, 10, WHITE);
      // Contrails.
      lineF(x + 30, y + 30, x + 120, y + 26, WHITE, 1);
      lineF(x + 40, y + 36, x + 130, y + 32, WHITE, 1);
      // Two jets.
      for (const [jx, jy] of [[150, 22], [120, 32]] as [number, number][]) {
        polyF([[x + jx, y + jy], [x + jx + 34, y + jy + 4], [x + jx, y + jy + 8]], [60, 66, 76]);
        polyF([[x + jx + 12, y + jy - 6], [x + jx + 18, y + jy + 4], [x + jx + 22, y + jy + 4]], [60, 66, 76]);
        polyF([[x + jx + 12, y + jy + 8], [x + jx + 18, y + jy + 4], [x + jx + 22, y + jy + 4]], [60, 66, 76]);
        circleF(x + jx + 26, y + jy + 4, 1.6, RED);
      }
      // Radar sweep hint.
      ringF(x + 30, y + 34, 8, 1.5, GREEN);
      lineF(x + 30, y + 34, x + 38, y + 28, GREEN, 1);
      break;
    }
  }
}

// ---------- content (exact stories from the v2 brief) ----------
interface Lead {
  kicker: string;
  headline: string;
  deck: string;
  scene: (x: number, y: number, w: number, h: number) => void;
}
const LEADS: Lead[] = [
  {
    kicker: "MIDDLE EAST · WAR",
    headline: "US AND IRAN TRADE FIRE OVER BAHRAIN",
    deck: "IRANIAN DRONES TARGET US RADAR AT SHEIKH ISA; BAHRAIN INTERCEPTS AGAIN; US JETS STRUCK QESHM ON TUESDAY",
    scene: leadScene1,
  },
  {
    kicker: "EUROPE · WAR",
    headline: "UKRAINE DROPS A SPAN OF THE CRIMEA BRIDGE",
    deck: "A SECOND DAY OF STRIKES BRINGS THE ROAD ARCH DOWN; RUSSIA ANSWERS AGAINST KYIV'S TWO MAIN BRIDGES",
    scene: leadScene2,
  },
  {
    kicker: "ASIA · DIPLOMACY",
    headline: "TRUMP IN MANILA FOR FIRST QUAD IN TWO YEARS",
    deck: "HE MEETS MODI, TAKAICHI AND ALBANESE AT ASEAN, THEN FLIES TO SHENZHEN FOR APEC",
    scene: leadScene3,
  },
];

interface Featured {
  kicker: string;
  headline: string;
  deck: string;
}
const FEATURED: Featured[] = [
  { kicker: "MARKETS · TECHNOLOGY", headline: "NVIDIA REVENUE MORE THAN DOUBLES TO $115.8BN", deck: "FIRST RESULTS SINCE HUANG RESIGNED; DATA-CENTRE SALES HIT $107.6BN" },
  { kicker: "ASIA · WEATHER", headline: "CYCLONE AKVAN BEARS DOWN ON INDIA", deck: "CROSSES ANDHRA PRADESH ON FRIDAY WITH WINDS OF 145 KM/H" },
  { kicker: "MIDDLE EAST · POLITICS", headline: "KNESSET ELECTS KAHANA, A BLOW TO NETANYAHU", deck: "EISENKOT'S ALLY TAKES THE SPEAKERSHIP 66-52 FROM LIKUD" },
  { kicker: "EUROPE · UKRAINE AID", headline: "EU TO PROPOSE €45BN LOAN FOR UKRAINE", deck: "TWO-THIRDS OF KYIV'S €70BN 2027 GAP; REPAID ONLY BY RUSSIA" },
  { kicker: "BRITAIN · SANCTIONS", headline: "BRITAIN SANCTIONS SETTLEMENT BUILDERS", deck: "EIGHT ISRAELI FIRMS AND THE GROUP TZAV 9 FACE ASSET FREEZES" },
  { kicker: "TRADE · CHINA-CANADA", headline: "CHINA CUTS TARIFFS AS XI MEETS CARNEY", deck: "C$400M RELIEF ON PORK AND SEAFOOD; STEEL RELIEF EXTENDED" },
  { kicker: "ASIA · DISASTER", headline: "RUSSIAN MILITARY PLANE CRASHES IN SIBERIA; 19 DEAD", deck: "AN AN-12 COMES DOWN NEAR YAGUNOVO; ALL ABOARD ARE KILLED" },
  { kicker: "ASIA · SPORT", headline: "DHONI ENDS IPL PLAYING CAREER", deck: "CSK NAME HIM TEAM MENTOR FOR 2027; FIVE TITLES AND 272 APPEARANCES" },
  { kicker: "TECHNOLOGY", headline: "APPLE RESTORES SERVICES AFTER OUTAGE", deck: "APP STORE, ICLOUD AND APPLE PAY RETURN AFTER A THREE-HOUR FAILURE" },
  { kicker: "ASIA · ECONOMY", headline: "INDIA'S GDP GREW 7.5% LAST QUARTER", deck: "JULY-SEPTEMBER GROWTH HOLDS FIRM, ECONOMISTS SAY" },
  { kicker: "ASIA · BUSINESS", headline: "AMAZON TO INVEST $7BN IN INDIA", deck: "THE PLAN BACKS SOLAR AND WIND POWER FOR ITS INDIAN OPERATIONS" },
  { kicker: "ASIA · SECURITY", headline: "JAPAN SCRAMBLES FIGHTERS AT RUSSIAN JETS", deck: "TOKYO PROTESTS AFTER SUSPECTED RUSSIAN AIRCRAFT ENTER ITS AIRSPACE" },
];

const ALSO: string[] = [
  "16. ESTONIA TO SHUT RUSSIA BORDER ON 1 DEC",
  "17. POPE LEO FORGIVES ROSARY THROWER",
  "18. JORDAN AND IRAQ BLOCK TELEGRAM",
  "19. US PRESSES UN OVER TAIWAN FLIGHT CURBS",
  "20. BAIDU CHIEF WARNS OF AI 'BUBBLE'",
  "21. INDIA RE-ELECTED TO ITU COUNCIL",
  "22. JAY SHAH RE-ELECTED ICC CHAIRMAN",
  "23. UEFA BACKS DIALLO AGAINST INFANTINO",
  "24. MODI OFFERS FREE E-VISAS AT ASEAN",
  "25. PAKISTAN AND IRAN STRESS ENGAGEMENT",
  "26. JAPAN OFFERS ASEAN ENERGY STORAGE",
  "27. COSTA RICA JOURNALIST SHOT DEAD",
  "28. GUINEA CRACKDOWN DISPLACES THOUSANDS",
  "29. TRUMP SIGNS THAILAND TRADE DEAL",
  "30. EBOLA CASES PASS 11,000 IN CONGO",
  "31. US MEASLES CASES PASS 5,400",
  "32. GAZA TENTS FLOOD IN STORMS",
  "33. UN WARNS OF DRASTIC EMISSION CUTS",
];

// ---------- page ----------
function badge(x: number, y: number, n: number): void {
  circleF(x, y, 8, RED);
  ringF(x, y, 8, 1, WHITE);
  const label = String(n);
  textF(x - textW(label, 2) / 2, y - 3.5, label, 2, WHITE);
}

function drawPage(): void {
  fillAll(CREAM);

  // Masthead.
  rectF(0, 0, 1024, 112, NAVY);
  textF(16, 12, "THE WORLD IN ONE DAY", 4, WHITE);
  textRightF(1008, 12, "33 STORIES · 6 CONTINENTS · ONE DAY", 4, WHITE);
  rectF(16, 34, 992, 2, [120, 135, 165]);
  textCenterF(512, 46, "WEDNESDAY 18 NOVEMBER 2026", 11, WHITE);
  rectF(16, 96, 992, 2, [120, 135, 165]);

  // Three big leads.
  const leadX = [8, 348, 688];
  for (let i = 0; i < 3; i++) {
    const x = leadX[i];
    const L = LEADS[i];
    L.scene(x, 118, 328, 88);
    rectF(x, 118, 328, 2, INK);
    badge(x + 14, 132, i + 1);
    textF(x, 214, L.kicker, 3, RED);
    const hl = textWrapF(x, 230, L.headline, 5, INK, 328, 20, 3);
    textWrapF(x, 230 + hl * 20 + 6, L.deck, 3.5, [40, 40, 40], 328, 13.5, 4);
    rectF(x, 346, 328, 1, LIGHTGREY);
  }

  // Twelve featured, 4 x 3.
  const cellX = [8, 262, 516, 770];
  const cellY = [352, 496, 640];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const idx = r * 4 + c;
      const F = FEATURED[idx];
      const x = cellX[c];
      const y = cellY[r];
      drawIcon(idx + 4, x, y + 2, 246, 44);
      badge(x + 12, y + 12, idx + 4);
      textF(x, y + 50, F.kicker, 3, RED);
      const hl = textWrapF(x, y + 63, F.headline, 4, INK, 246, 15.5, 3);
      textWrapF(x, y + 63 + hl * 15.5 + 4, F.deck, 2.5, [40, 40, 40], 246, 10.5, 3);
    }
  }
  rectF(8, 784, 1008, 1, LIGHTGREY);

  // Bottom band: map (left) + also list (right).
  textF(8, 790, "WHERE IT HAPPENED", 4, INK);
  rectF(8, 806, 60, 3, RED);
  drawMap(8, 812, 470, 140);
  textF(8, 956, "NUMBERED DOTS MARK STORIES 1-15.", 3, INK);
  textF(8, 968, "TAN DOTS = LAND, BLUE = SEA.", 3, GREY);

  textF(486, 790, "ALSO ON WEDNESDAY 18 NOVEMBER", 4, INK);
  rectF(486, 806, 60, 3, RED);
  const colX = [486, 754];
  for (let i = 0; i < ALSO.length; i++) {
    const col = i < 9 ? 0 : 1;
    const row = i % 9;
    textWrapF(colX[col], 814 + row * 19, ALSO[i], 2.5, INK, 262, 9.5, 2);
  }

  // Footer.
  rectF(8, 990, 1008, 1, LIGHTGREY);
  textF(8, 994, "EVERY STORY HAPPENED OR WAS FIRST REPORTED ON WEDNESDAY 18 NOVEMBER 2026. DISPUTED CLAIMS ARE ATTRIBUTED.", 3, GREY);
  textF(8, 1005, "SOURCES: AP, REUTERS, AFP, BBC, AL JAZEERA, UN NEWS. ORIGINAL DRAWINGS.", 3, GREY);
}

function main(): void {
  drawPage();
  const png = encodePNG(OUT, OUT, downsample());
  const dir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "entry.png"), png);
}

main();
