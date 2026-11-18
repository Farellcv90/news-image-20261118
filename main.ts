// news-image-20261118 — "The World in One Day"
// A newspaper front page summing up Wednesday 18 November 2026, drawn
// entirely in code: raw RGB buffer, hand-written bitmap font, hand-written
// PNG encoder. Node 22, standard library only, no network, no randomness,
// no Date calls. Deterministic: two runs produce byte-identical output.
import * as fs from "node:fs";
import * as path from "node:path";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- palette
const PAPER: RGB = [247, 241, 227];
const INK: RGB = [17, 17, 17];
const RED: RGB = [179, 39, 30];
const BLUE: RGB = [30, 79, 138];
const SKY: RGB = [168, 205, 225];
const SEA: RGB = [44, 96, 140];
const SEA_DARK: RGB = [28, 70, 108];
const SAND: RGB = [226, 205, 160];
const GREY: RGB = [120, 120, 118];
const SMOKE: RGB = [96, 96, 94];
const FIRE: RGB = [235, 120, 20];
const FIRE_Y: RGB = [245, 200, 40];
const GREEN: RGB = [46, 110, 60];
const WHITE: RGB = [255, 255, 255];
const PANEL: RGB = [252, 248, 238];

type RGB = [number, number, number];

// ---------------------------------------------------------------- buffer
const buf = new Uint8Array(W * H * 3);
function fillAll(c: RGB): void {
  for (let i = 0; i < W * H; i++) {
    buf[i * 3] = c[0];
    buf[i * 3 + 1] = c[1];
    buf[i * 3 + 2] = c[2];
  }
}
function px(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
}
function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) px(xx, yy, c);
  }
}
function frame(x: number, y: number, w: number, h: number, c: RGB, t: number): void {
  rect(x, y, w, t, c);
  rect(x, y + h - t, w, t, c);
  rect(x, y, t, h, c);
  rect(x + w - t, y, t, h, c);
}
function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let yy = cy - r; yy <= cy + r; yy++) {
    for (let xx = cx - r; xx <= cx + r; xx++) {
      const dx = xx - cx;
      const dy = yy - cy;
      if (dx * dx + dy * dy <= r * r) px(xx, yy, c);
    }
  }
}
function ring(cx: number, cy: number, r: number, t: number, c: RGB): void {
  for (let a = 0; a < 360; a += 1) {
    const rad = (a * Math.PI) / 180;
    for (let k = 0; k < t; k++) {
      px(Math.round(cx + (r + k) * Math.cos(rad)), Math.round(cy + (r + k) * Math.sin(rad)), c);
    }
  }
}
function line(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + (dx * i) / steps);
    const y = Math.round(y0 + (dy * i) / steps);
    for (let a = 0; a < t; a++) for (let b = 0; b < t; b++) px(x + a, y + b, c);
  }
}
// Fill a polygon (convex or simple) by scanline.
function poly(points: Array<[number, number]>, c: RGB): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of points) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % points.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) px(x, y, c);
    }
  }
}

// ---------------------------------------------------------------- bitmap font
// 5x7 glyphs, one string per row, "1" = ink. Uppercase, digits, punctuation.
const FONT: Record<string, string[]> = {
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
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
};

function charWidth(s: number): number {
  return 6 * s;
}
function textWidth(text: string, s: number): number {
  if (text.length === 0) return 0;
  return text.length * charWidth(s) - s;
}
function drawChar(ch: string, x: number, y: number, s: number, c: RGB): void {
  const g = FONT[ch];
  if (!g) return;
  for (let r = 0; r < 7; r++) {
    for (let col = 0; col < 5; col++) {
      if (g[r][col] === "1") rect(x + col * s, y + r * s, s, s, c);
    }
  }
}
function drawText(text: string, x: number, y: number, s: number, c: RGB): void {
  for (let i = 0; i < text.length; i++) {
    drawChar(text[i], x + i * charWidth(s), y, s, c);
  }
}
function drawTextCentered(text: string, cx: number, y: number, s: number, c: RGB): void {
  drawText(text, cx - Math.floor(textWidth(text, s) / 2), y, s, c);
}
// Greedy word wrap; returns lines that fit maxW.
function wrap(text: string, s: number, maxW: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textWidth(trial, s) <= maxW) {
      cur = trial;
    } else {
      if (cur !== "") lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}
function drawBlock(lines: string[], cx: number, y: number, s: number, c: RGB, lh: number): void {
  for (let i = 0; i < lines.length; i++) {
    drawTextCentered(lines[i], cx, y + i * lh, s, c);
  }
}

// ---------------------------------------------------------------- PNG encoder
const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcData = new Uint8Array(4 + data.length);
  crcData.set(out.subarray(4, 8 + data.length));
  dv.setUint32(8 + data.length, crc32(crcData));
  return out;
}
function encodePNG(): Uint8Array {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, W);
  dv.setUint32(4, H);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = new Uint8Array(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter none
    raw.set(buf.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))];
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

// ---------------------------------------------------------------- scenes
function smoke(x: number, y: number, r: number): void {
  disc(x, y, r, SMOKE);
  disc(x + r, y - Math.floor(r / 2), Math.floor(r * 0.7), GREY);
  disc(x - r, y - Math.floor(r / 3), Math.floor(r * 0.6), GREY);
}

// Lead scene: Kerch bridge, one span collapsed into the sea, smoke rising.
function sceneLead(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SKY);
  const seaY = y + Math.floor(h * 0.62);
  rect(x, seaY, w, h - (seaY - y), SEA);
  // sun
  disc(x + w - 90, y + 46, 26, FIRE_Y);
  // distant clouds
  disc(x + 90, y + 30, 16, WHITE);
  disc(x + 112, y + 24, 20, WHITE);
  disc(x + 134, y + 32, 14, WHITE);
  // left (intact) span: deck, arch, pillars
  const deckY = y + 96;
  rect(x + 20, deckY, 430, 12, INK);
  poly([[x + 60, deckY], [x + 410, deckY], [x + 350, deckY + 52], [x + 120, deckY + 52]], INK);
  rect(x + 60, deckY + 12, 10, seaY - deckY - 12, INK);
  rect(x + 400, deckY + 12, 10, seaY - deckY - 12, INK);
  // tower on intact span
  rect(x + 215, deckY - 58, 10, 58, INK);
  line(x + 220, deckY - 58, x + 60, deckY, INK, 2);
  line(x + 220, deckY - 58, x + 420, deckY, INK, 2);
  // collapsed span: deck tilted down into the water, right side
  poly(
    [
      [x + 470, deckY],
      [x + 700, deckY + 6],
      [x + 780, seaY + 26],
      [x + 760, seaY + 34],
      [x + 620, deckY + 22],
      [x + 470, deckY + 12],
    ],
    INK
  );
  // broken pillar stub
  rect(x + 700, deckY + 6, 10, 40, INK);
  // splash + waves around the wreck
  disc(x + 770, seaY + 18, 16, WHITE);
  disc(x + 800, seaY + 26, 12, WHITE);
  for (let i = 0; i < 6; i++) {
    line(x + 30 + i * 150, seaY + 40 + (i % 2) * 14, x + 110 + i * 150, seaY + 40 + (i % 2) * 14, WHITE, 2);
  }
  // smoke over the break
  smoke(x + 480, deckY - 26, 22);
  smoke(x + 540, deckY - 44, 18);
  // fire on the wreck
  poly([[x + 700, deckY + 8], [x + 716, deckY - 14], [x + 732, deckY + 8]], FIRE);
  poly([[x + 712, deckY + 8], [x + 720, deckY - 6], [x + 728, deckY + 8]], FIRE_Y);
  // far bank
  rect(x, seaY + 78, w, 6, SAND);
}

// Panel 1: tanker burning in the strait.
function sceneTanker(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SKY);
  const seaY = y + Math.floor(h * 0.55);
  rect(x, seaY, w, h - (seaY - y), SEA);
  disc(x + w - 40, y + 26, 18, FIRE_Y);
  // tanker hull
  poly([[x + 30, seaY - 8], [x + w - 30, seaY - 8], [x + w - 52, seaY + 22], [x + 52, seaY + 22]], RED);
  rect(x + 40, seaY - 34, w - 130, 26, WHITE);
  rect(x + 40, seaY - 34, 26, 26, INK);
  rect(x + 74, seaY - 34, 26, 26, BLUE);
  rect(x + 108, seaY - 34, 26, 26, GREEN);
  // funnel with fire and smoke
  rect(x + w - 84, seaY - 52, 22, 20, INK);
  poly([[x + w - 84, seaY - 52], [x + w - 73, seaY - 78], [x + w - 62, seaY - 52]], FIRE);
  poly([[x + w - 76, seaY - 52], [x + w - 73, seaY - 66], [x + w - 68, seaY - 52]], FIRE_Y);
  smoke(x + w - 73, seaY - 64, 12);
  smoke(x + w - 60, seaY - 76, 9);
  // waves
  for (let i = 0; i < 4; i++) {
    line(x + 12 + i * 70, seaY + 34, x + 52 + i * 70, seaY + 34, WHITE, 2);
  }
}

// Panel 2: summit in Manila — flags and leaders at a table.
function sceneSummit(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SKY);
  // skyline
  rect(x + 10, y + h - 78, 34, 78, GREY);
  rect(x + 52, y + h - 96, 28, 96, INK);
  rect(x + 88, y + h - 66, 40, 66, GREY);
  rect(x + w - 130, y + h - 88, 30, 88, INK);
  rect(x + w - 92, y + h - 62, 42, 62, GREY);
  rect(x + w - 44, y + h - 80, 30, 80, GREY);
  // ground / table
  rect(x, y + h - 34, w, 34, SAND);
  rect(x + 40, y + h - 58, w - 80, 24, INK);
  // three flag poles with simple flags
  const poles = [x + 70, x + w / 2 - 4, x + w - 78];
  const flagCols: RGB[] = [RED, BLUE, [0, 90, 60]];
  for (let i = 0; i < 3; i++) {
    line(poles[i], y + 18, poles[i], y + h - 58, INK, 3);
    rect(poles[i] + 3, y + 20, 44, 26, flagCols[i]);
    rect(poles[i] + 3, y + 20, 44, 8, WHITE);
    if (i === 1) rect(poles[i] + 3, y + 20, 18, 14, BLUE);
  }
  // three leaders behind the table (simple figures)
  const heads = [x + 92, x + w / 2, x + w - 100];
  const suits: RGB[] = [INK, BLUE, [0, 90, 60]];
  for (let i = 0; i < 3; i++) {
    disc(heads[i], y + h - 84, 12, [232, 190, 150]);
    rect(heads[i] - 14, y + h - 72, 28, 16, suits[i]);
    rect(heads[i] - 3, y + h - 72, 6, 16, WHITE);
  }
}

// Panel 3: cyclone spiral over the Bay of Bengal.
function sceneCyclone(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SKY);
  const seaY = y + Math.floor(h * 0.68);
  rect(x, seaY, w, h - (seaY - y), SEA);
  const cx = x + Math.floor(w / 2);
  const cy = y + Math.floor(h * 0.42);
  // spiral arms
  for (let r = 10; r <= 40; r += 8) {
    ring(cx, cy, r, 5, WHITE);
  }
  disc(cx, cy, 8, INK);
  // rain streaks
  for (let i = 0; i < 8; i++) {
    const rx = x + 14 + i * 34;
    line(rx, y + 12, rx - 8, y + 34, BLUE, 2);
  }
  // coastline
  poly([[x, seaY + 26], [x + 90, seaY + 8], [x + 190, seaY + 22], [x + w, seaY + 10], [x + w, h + y], [x, h + y]], SAND);
  // warning triangle, bottom right over the coast
  poly([[x + w - 60, seaY + 6], [x + w - 34, seaY + 44], [x + w - 86, seaY + 44]], FIRE_Y);
  drawChar("!", x + w - 52, seaY + 18, 2, INK);
  // waves
  for (let i = 0; i < 3; i++) line(x + 16 + i * 80, seaY + 44, x + 56 + i * 80, seaY + 44, WHITE, 2);
}

// Panel 4: radar dish and drone over Bahrain.
function sceneRadar(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SKY);
  rect(x, y + h - 30, w, 30, SAND);
  disc(x + w - 42, y + 26, 16, FIRE_Y);
  // radar tower + dish (dish faces up-right)
  rect(x + 46, y + 30, 10, h - 60, INK);
  poly([[x + 30, y + 30], [x + 100, y + 30], [x + 88, y + 74], [x + 42, y + 74]], WHITE);
  frame(x + 30, y + 30, 70, 44, INK, 2);
  line(x + 65, y + 52, x + 132, y + 26, RED, 3);
  // drone, upper right
  const dx = x + w - 104;
  const dy = y + 52;
  rect(dx, dy, 44, 8, INK);
  rect(dx + 18, dy - 8, 8, 24, INK);
  disc(dx + 4, dy + 4, 6, GREY);
  disc(dx + 40, dy + 4, 6, GREY);
  // blast marks on the dish
  poly([[x + 84, y + 40], [x + 92, y + 26], [x + 100, y + 40]], FIRE);
  smoke(x + 92, y + 30, 10);
  // ground line
  line(x, y + h - 30, x + w, y + h - 30, INK, 2);
}

// Panel 5: Canada and China flags, trade handshake.
function sceneTrade(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SKY);
  rect(x, y + h - 34, w, 34, SAND);
  // Canadian flag (left): red-white-red with maple leaf dot
  const fx = x + 24;
  const fy = y + 22;
  rect(fx, fy, 22, 44, RED);
  rect(fx + 22, fy, 44, 44, WHITE);
  rect(fx + 66, fy, 22, 44, RED);
  poly([[fx + 44, fy + 8], [fx + 52, fy + 22], [fx + 58, fy + 14], [fx + 54, fy + 30], [fx + 60, fy + 30], [fx + 44, fy + 40], [fx + 28, fy + 30], [fx + 34, fy + 30], [fx + 30, fy + 14], [fx + 36, fy + 22]], RED);
  line(fx, fy, fx, y + h - 34, INK, 3);
  // Chinese flag (right): red field, yellow stars
  const gx = x + w - 112;
  rect(gx, fy, 88, 44, RED);
  disc(gx + 16, fy + 14, 7, FIRE_Y);
  disc(gx + 38, fy + 10, 3, FIRE_Y);
  disc(gx + 46, fy + 20, 3, FIRE_Y);
  disc(gx + 38, fy + 30, 3, FIRE_Y);
  line(gx + 88, fy, gx + 88, y + h - 34, INK, 3);
  // handshake: two arms meeting low, below the flags
  line(x + 84, y + h - 46, x + w / 2 - 8, y + h - 62, INK, 5);
  line(x + w - 84, y + h - 46, x + w / 2 + 8, y + h - 62, INK, 5);
  disc(x + w / 2, y + h - 62, 9, [232, 190, 150]);
  // document / deal paper under the handshake
  rect(x + w / 2 - 26, y + h - 40, 52, 18, WHITE);
  frame(x + w / 2 - 26, y + h - 40, 52, 18, INK, 2);
  line(x + w / 2 - 18, y + h - 33, x + w / 2 + 18, y + h - 33, INK, 2);
  line(x + w / 2 - 18, y + h - 27, x + w / 2 + 10, y + h - 27, INK, 2);
}

// Panel 6: cricket — stumps, bat, ball.
function sceneCricket(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, GREEN);
  // pitch
  rect(x + 40, y + h - 44, w - 80, 44, SAND);
  line(x + 40, y + h - 44, x + w - 40, y + h - 44, WHITE, 2);
  // stumps
  const sx = x + w - 76;
  const sy = y + h - 96;
  rect(sx, sy, 8, 52, FIRE_Y);
  rect(sx + 12, sy, 8, 52, FIRE_Y);
  rect(sx + 24, sy, 8, 52, FIRE_Y);
  rect(sx, sy - 6, 32, 5, FIRE_Y);
  // bails off, ball flying
  disc(x + w - 60, sy - 26, 8, RED);
  disc(x + 60, y + 30, 10, RED);
  // bat leaning on the pitch, clean diagonal plank + handle
  poly([[x + 46, y + h - 44], [x + 66, y + h - 44], [x + 88, y + h - 92], [x + 68, y + h - 92]], [150, 100, 50]);
  line(x + 78, y + h - 92, x + 92, y + h - 116, [150, 100, 50], 6);
  // crowd: one neat row of heads along the top
  for (let i = 0; i < 9; i++) {
    disc(x + 34 + i * 30, y + 20, 7, i % 2 === 0 ? WHITE : FIRE_Y);
  }
}

// ---------------------------------------------------------------- page
function panel(x: number, y: number, w: number, h: number, scene: (x: number, y: number, w: number, h: number) => void, headline: string[], deck: string[]): void {
  frame(x, y, w, h, INK, 2);
  rect(x + 2, y + 2, w - 4, h - 4, PANEL);
  const sceneH = Math.floor(h * 0.48);
  scene(x + 6, y + 6, w - 12, sceneH);
  frame(x + 6, y + 6, w - 12, sceneH, INK, 2);
  let ty = y + 6 + sceneH + 12;
  const cx = x + Math.floor(w / 2);
  for (const hl of headline) {
    drawTextCentered(hl, cx, ty, 2, INK);
    ty += 18;
  }
  ty += 2;
  const dlines = wrap(deck.join(" "), 1, w - 24);
  drawBlock(dlines, cx, ty, 1, INK, 10);
}

function main(): void {
  fillAll(PAPER);
  // outer frame
  frame(10, 10, W - 20, H - 20, INK, 4);

  // masthead
  drawTextCentered("THE WORLD IN ONE DAY", Math.floor(W / 2), 30, 6, INK);
  rect(30, 96, W - 60, 3, RED);
  drawTextCentered("WEDNESDAY, 18 NOVEMBER 2026", Math.floor(W / 2), 106, 3, RED);
  rect(30, 138, W - 60, 2, INK);

  // ---- lead story
  const lx = 24;
  const ly = 150;
  const lw = W - 48;
  const lh = 318;
  frame(lx, ly, lw, lh, INK, 3);
  rect(lx + 3, ly + 3, lw - 6, lh - 6, PANEL);
  sceneLead(lx + 9, ly + 9, lw - 18, 190);
  frame(lx + 9, ly + 9, lw - 18, 190, INK, 2);
  drawTextCentered("KERCH BRIDGE HIT AGAIN", Math.floor(W / 2), ly + 214, 4, INK);
  const leadDeck = wrap("UKRAINE STRIKES FOR A SECOND DAY; KYIV BRIDGES HIT IN REPLY, WATER AND POWER CUT IN PARTS OF THE CAPITAL", 2, lw - 60);
  drawBlock(leadDeck, Math.floor(W / 2), ly + 254, 2, INK, 24);

  // ---- middle row: 3 panels
  const rowY = 484;
  const rowH = 232;
  const pw = 312;
  const pxs = [24, 356, 688];
  panel(pxs[0], rowY, pw, rowH, sceneTanker, ["TANKER AFTERMATH", "OFF HORMUZ"], ["INDIA CONDEMNS ATTACK ON MT TARA GAS; 21 OF 24 INDIANS EVACUATED AT KHASAB"]);
  panel(pxs[1], rowY, pw, rowH, sceneSummit, ["TRUMP LANDS", "IN MANILA"], ["QUAD TALKS AHEAD OF CHINA VISIT AND APEC; MODI AT ASEAN-INDIA SUMMIT"]);
  panel(pxs[2], rowY, pw, rowH, sceneCyclone, ["CYCLONE AKVAN", "NEARS"], ["SEVERE STORM BY 19 NOV; ANDHRA PRADESH AND ODISHA ON HIGH ALERT"]);

  // ---- bottom row: 3 panels
  const row2Y = 732;
  const row2H = 216;
  panel(pxs[0], row2Y, pw, row2H, sceneRadar, ["IRAN HITS US RADAR"], ["DRONE STRIKE IN BAHRAIN; IRGC CLAIMS MQ-1 DOWNED; GAS SHORTAGES FEARED"]);
  panel(pxs[1], row2Y, pw, row2H, sceneTrade, ["CANADA, CHINA", "EXTEND DEALS"], ["XI MEETS CARNEY AHEAD OF APEC SUMMIT"]);
  panel(pxs[2], row2Y, pw, row2H, sceneCricket, ["DHONI BOWS OUT"], ["RETIREMENT FROM IPL; BECOMES CSK MENTOR. INDIA WIN 10TH SAFF TITLE, 2-1 OVER PAKISTAN"]);

  // ---- footer
  rect(30, 962, W - 60, 2, INK);
  drawTextCentered("18 NOVEMBER 2026 - THE WORLD'S NEWS IN ONE IMAGE", Math.floor(W / 2), 976, 2, INK);

  const png = encodePNG();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "entry.png"), png);
}

main();
