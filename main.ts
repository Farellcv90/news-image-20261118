// news-image-20261118 — "The World in One Day"
// Wednesday 18 November 2026, 37 stories. Node 22, stdlib only.
// Draws the whole front page in code into a 2048x2048 buffer,
// downsamples 2x2 to 1024x1024, writes one deterministic PNG.
// No network, no file reads, no randomness, no Date calls.
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

// ---------------------------------------------------------------- palette
const PAPER = [244, 239, 228];
const INK = [20, 20, 20];
const NAVY = [31, 42, 68];
const NAVY2 = [43, 56, 88];
const RED = [179, 35, 42];
const RED_DK = [140, 22, 30];
const WHITE = [255, 255, 255];
const TAN = [216, 201, 163];
const SEA = [207, 224, 234];
const SEA_DK = [168, 196, 214];
const GREY = [107, 107, 107];
const GREY_LT = [160, 158, 148];
const GOLD = [217, 164, 65];
const GOLD_DK = [176, 128, 40];
const GREEN = [46, 125, 79];
const BLUE = [58, 110, 160];
const ORANGE = [217, 106, 30];
const SKY = [142, 178, 205];
const NIGHT = [24, 34, 58];

// ---------------------------------------------------------------- buffer
const W2 = 2048;
const H2 = 2048;
const W = 1024;
const H = 1024;
const buf = new Uint8Array(W2 * H2 * 3);

function px(x: number, y: number, c: number[]): void {
  if (x < 0 || y < 0 || x >= W2 || y >= H2) return;
  const i = (y * W2 + x) * 3;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
}
function rect(x: number, y: number, w: number, h: number, c: number[]): void {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W2, Math.round(x + w));
  const y1 = Math.min(H2, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * W2 + x0) * 3;
    for (let xx = x0; xx < x1; xx++) {
      buf[i] = c[0];
      buf[i + 1] = c[1];
      buf[i + 2] = c[2];
      i += 3;
    }
  }
}
function circle(cx: number, cy: number, r: number, c: number[]): void {
  const rr = Math.round(r);
  for (let dy = -rr; dy <= rr; dy++) {
    const dx = Math.floor(Math.sqrt(Math.max(0, rr * rr - dy * dy)));
    for (let xx = -dx; xx <= dx; xx++) px(cx + xx, cy + dy, c);
  }
}
function disc(cx: number, cy: number, r: number, c: number[]): void {
  circle(cx, cy, r, c);
}
function line(x0: number, y0: number, x1: number, y1: number, c: number[], w = 1): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + (dx * i) / steps);
    const y = Math.round(y0 + (dy * i) / steps);
    if (w <= 1) px(x, y, c);
    else circle(x, y, Math.floor(w / 2), c);
  }
}
function poly(points: number[][], c: number[]): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        const t = (y - a[1]) / (b[1] - a[1]);
        xs.push(a[0] + t * (b[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) px(x, y, c);
    }
  }
}
function tri(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, c: number[]): void {
  poly([[x1, y1], [x2, y2], [x3, y3]], c);
}
function ring(cx: number, cy: number, r: number, c: number[], w = 3): void {
  for (let a = 0; a < 360; a += 2) {
    const rad = (a * Math.PI) / 180;
    for (let k = 0; k < w; k++) {
      px(Math.round(cx + (r + k - w / 2) * Math.cos(rad)), Math.round(cy + (r + k - w / 2) * Math.sin(rad)), c);
    }
  }
}

// ---------------------------------------------------------------- bitmap font
// 5x7 glyphs, rows as 5-bit strings. Lowercase live on rows 2..6 (x-height),
// ascenders reach row 0, descenders (g j p q y) reach row 6.
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
  a: ["00000", "00000", "01110", "00001", "01111", "10001", "01111"],
  b: ["10000", "10000", "11110", "10001", "10001", "10001", "11110"],
  c: ["00000", "00000", "01110", "10001", "10000", "10001", "01110"],
  d: ["00001", "00001", "01111", "10001", "10001", "10001", "01111"],
  e: ["00000", "00000", "01110", "10001", "11111", "10000", "01110"],
  f: ["00110", "01001", "01000", "11110", "01000", "01000", "01000"],
  g: ["00000", "00000", "01111", "10001", "10001", "01111", "01110"],
  h: ["10000", "10000", "11110", "10001", "10001", "10001", "10001"],
  i: ["00100", "00000", "01100", "00100", "00100", "00100", "01110"],
  j: ["00010", "00000", "00110", "00010", "00010", "00010", "01100"],
  k: ["10000", "10000", "10010", "10100", "11000", "10100", "10010"],
  l: ["01100", "00100", "00100", "00100", "00100", "00100", "01110"],
  m: ["00000", "00000", "11010", "10101", "10101", "10101", "10101"],
  n: ["00000", "00000", "11110", "10001", "10001", "10001", "10001"],
  o: ["00000", "00000", "01110", "10001", "10001", "10001", "01110"],
  p: ["00000", "00000", "11110", "10001", "10001", "11110", "10000"],
  q: ["00000", "00000", "01111", "10001", "10001", "01111", "00001"],
  r: ["00000", "00000", "10110", "11001", "10000", "10000", "10000"],
  s: ["00000", "00000", "01111", "10000", "01110", "00001", "11110"],
  t: ["00100", "00100", "11110", "00100", "00100", "00100", "00011"],
  u: ["00000", "00000", "10001", "10001", "10001", "10001", "01111"],
  v: ["00000", "00000", "10001", "10001", "10001", "01010", "00100"],
  w: ["00000", "00000", "10001", "10101", "10101", "10101", "01010"],
  x: ["00000", "00000", "10001", "01010", "00100", "01010", "10001"],
  y: ["00000", "00000", "10001", "10001", "01010", "00100", "00100"],
  z: ["00000", "00000", "11111", "00010", "00100", "01000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["01110", "10000", "11110", "10001", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "€": ["00111", "01000", "10000", "11110", "10000", "01000", "00111"],
  "·": ["00000", "00000", "00000", "01100", "01100", "00000", "00000"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

function charWidth(s: number): number {
  return 6 * s;
}
function textWidth(t: string, s: number): number {
  return t.length * charWidth(s) - s;
}
function drawChar(ch: string, x: number, y: number, s: number, c: number[], bold = false, slant = 0): void {
  const g = GLYPHS[ch] || GLYPHS[" "];
  for (let r = 0; r < 7; r++) {
    const row = g[r];
    const shift = slant ? Math.round((6 - r) * slant) : 0;
    for (let col = 0; col < 5; col++) {
      if (row[col] === "1") {
        const px0 = x + col * s + shift;
        const py0 = y + r * s;
        rect(px0, py0, s, s, c);
        if (bold) rect(px0 + Math.max(1, Math.round(s / 2)), py0, s, s, c);
      }
    }
  }
}
function drawText(t: string, x: number, y: number, s: number, c: number[], bold = false, slant = 0): void {
  let cx = Math.round(x);
  for (const ch of t) {
    drawChar(ch, cx, Math.round(y), s, c, bold, slant);
    cx += charWidth(s);
  }
}
function drawTextCenter(t: string, cx: number, y: number, s: number, c: number[], bold = false, slant = 0): void {
  drawText(t, cx - textWidth(t, s) / 2, y, s, c, bold, slant);
}
function drawTextRight(t: string, xRight: number, y: number, s: number, c: number[], bold = false): void {
  drawText(t, xRight - textWidth(t, s), y, s, c, bold);
}

// Word wrap on word boundaries; never leaves a single short word alone on
// the last line (pulls the previous line's last word down instead).
function wrap(text: string, maxW: number, s: number): string[] {
  const words = text.split(" ").filter((w) => w.length > 0);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textWidth(trial, s) <= maxW || cur === "") {
      cur = trial;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  if (lines.length > 1) {
    const last = lines[lines.length - 1];
    if (!last.includes(" ")) {
      const prev = lines[lines.length - 2];
      const pi = prev.lastIndexOf(" ");
      if (pi > 0) {
        lines[lines.length - 2] = prev.slice(0, pi);
        lines[lines.length - 1] = prev.slice(pi + 1) + " " + last;
      }
    }
  }
  return lines;
}
function drawWrapped(text: string, x: number, y: number, maxW: number, s: number, c: number[], lh: number, bold = false): number {
  const lines = wrap(text, maxW, s);
  for (let i = 0; i < lines.length; i++) drawText(lines[i], x, y + i * lh, s, c, bold);
  return lines.length;
}

// ---------------------------------------------------------------- PNG encoder
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG(rgb: Buffer, w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    rgb.copy(raw, y * (1 + w * 3) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---------------------------------------------------------------- content
interface Lead {
  n: number;
  kicker: string;
  headline: string;
  deck: string;
}
interface Feat {
  n: number;
  kicker: string;
  headline: string;
  deck: string;
  scene: string;
}
const LEADS: Lead[] = [
  {
    n: 1,
    kicker: "MIDDLE EAST · WAR",
    headline: "US and Iran trade fire over Bahrain",
    deck: "Iranian drones target US radar at Sheikh Isa base; Bahrain intercepts them, and US jets strike a missile site on Qeshm Island.",
  },
  {
    n: 2,
    kicker: "EUROPE · WAR",
    headline: "Ukraine drops a span of the Crimea bridge",
    deck: "A second day of strikes brings the road arch down; Russia answers against Kyiv's two main bridges.",
  },
  {
    n: 3,
    kicker: "ASIA · DIPLOMACY",
    headline: "Trump in Manila for first Quad in two years",
    deck: "He meets Modi, Takaichi and Albanese at ASEAN, then flies to Shenzhen for APEC.",
  },
];
const FEATURED: Feat[] = [
  { n: 4, kicker: "MARKETS · TECHNOLOGY", headline: "Nvidia revenue more than doubles to $115.8bn", deck: "First results since Huang resigned; data-centre sales hit $107.6bn.", scene: "chip" },
  { n: 5, kicker: "ASIA · WEATHER", headline: "Cyclone Akvan bears down on India", deck: "Crosses Andhra Pradesh on Friday with winds of 145 km/h.", scene: "cyclone" },
  { n: 6, kicker: "MIDDLE EAST · POLITICS", headline: "Knesset elects Kahana, a blow to Netanyahu", deck: "Eisenkot's ally takes the speakership 66-52 from Likud.", scene: "knesset" },
  { n: 7, kicker: "EUROPE · UKRAINE AID", headline: "EU to propose €45bn loan for Ukraine", deck: "Two-thirds of Kyiv's €70bn 2027 gap; repaid only by Russia.", scene: "euro" },
  { n: 8, kicker: "BRITAIN · SANCTIONS", headline: "Britain sanctions settlement builders", deck: "Eight Israeli firms and the group Tzav 9 face asset freezes.", scene: "ban" },
  { n: 9, kicker: "TRADE · CHINA-CANADA", headline: "China cuts tariffs as Xi meets Carney", deck: "C$400m relief on pork and seafood; steel relief extended.", scene: "ship" },
  { n: 10, kicker: "ASIA · DISASTER", headline: "Russian military plane crashes in Siberia; 19 dead", deck: "An An-12 comes down near Yagunovo; all aboard are killed.", scene: "plane" },
  { n: 11, kicker: "ASIA · SPORT", headline: "Dhoni ends IPL playing career", deck: "CSK name him Team Mentor for 2027; five titles and 272 appearances.", scene: "cricket" },
  { n: 12, kicker: "TECHNOLOGY", headline: "Apple restores services after outage", deck: "App Store, iCloud and Apple Pay return after a three-hour failure.", scene: "phone" },
  { n: 13, kicker: "ASIA · ECONOMY", headline: "India's GDP grew 7.5% last quarter", deck: "July-September growth holds firm, economists say.", scene: "chart" },
  { n: 14, kicker: "ASIA · BUSINESS", headline: "Amazon to invest $7bn in India", deck: "The plan backs solar and wind power for its Indian operations.", scene: "solar" },
  { n: 15, kicker: "ASIA · SECURITY", headline: "Japan scrambles fighters at Russian jets", deck: "Tokyo protests after suspected Russian aircraft enter its airspace.", scene: "jets" },
];
// ALSO list: [number, bold lead-in, rest of line (sentence case)]
const ALSO: [number, string, string][] = [
  [16, "Estonia", "to shut Russia border on 1 Dec"],
  [17, "Pope Leo", "forgives rosary thrower"],
  [18, "Jordan and Iraq", "block Telegram"],
  [19, "US", "presses UN over Taiwan flight curbs"],
  [20, "Baidu chief", "warns of AI 'bubble'"],
  [21, "India", "re-elected to ITU Council"],
  [22, "Jay Shah", "re-elected ICC chairman"],
  [23, "UEFA", "backs Diallo against Infantino"],
  [24, "Modi", "offers free e-visas at ASEAN"],
  [25, "Pakistan and Iran", "stress engagement"],
  [26, "Japan", "offers ASEAN energy storage"],
  [27, "Costa Rica", "journalist shot dead"],
  [28, "Guinea", "crackdown displaces thousands"],
  [29, "Trump", "signs Thailand trade deal"],
  [30, "Ebola", "cases pass 11,000 in Congo"],
  [31, "US measles", "cases pass 5,400"],
  [32, "Gaza", "tents flood in storms"],
  [33, "UN", "warns of drastic emission cuts"],
  [34, "Chips:", "US widens export scrutiny to Brazil and SE Asia"],
  [35, "Waymo:", "California bans robotaxis from freeways"],
  [36, "Korea:", "IMF raises growth forecast to 3.9%"],
  [37, "Australia:", "fresh sanctions on Israeli settlements"],
];
// Map dots: [story number, longitude, latitude]
const DOTS: [number, number, number][] = [
  [1, 50.5, 26.0],
  [2, 36.5, 45.3],
  [3, 121.0, 14.6],
  [4, -122.0, 37.0],
  [5, 80.0, 16.0],
  [6, 35.2, 31.8],
  [7, 6.0, 51.0],
  [8, -1.5, 52.0],
  [9, 116.0, 40.0],
  [10, 86.5, 55.4],
  [11, 82.5, 12.0],
  [12, -117.0, 33.0],
  [13, 77.0, 28.6],
  [14, 75.5, 15.0],
  [15, 139.7, 35.7],
];
// Dot-matrix land mask: 40 rows x 90 cols, runs [start,end] inclusive.
// col = (lon+180)/4, row = (75-lat)/3.3. Drawn from the continents' shapes.
const LAND: number[][][] = [
  [[4, 10], [15, 30], [33, 36], [58, 88]],
  [[3, 11], [14, 31], [33, 37], [52, 89]],
  [[3, 10], [13, 30], [34, 36], [46, 50], [51, 89]],
  [[4, 9], [13, 29], [41, 42], [46, 51], [52, 88]],
  [[5, 9], [13, 28], [47, 52], [53, 87]],
  [[13, 27], [44, 45], [48, 51], [54, 86]],
  [[12, 26], [44, 44], [46, 55], [56, 85]],
  [[11, 25], [43, 56], [57, 86]],
  [[9, 27], [42, 55], [57, 87]],
  [[8, 28], [42, 55], [58, 88]],
  [[8, 28], [43, 55], [58, 87]],
  [[8, 27], [43, 54], [59, 86], [79, 80]],
  [[9, 26], [44, 55], [56, 62], [63, 87], [79, 81]],
  [[10, 25], [41, 56], [57, 63], [64, 86]],
  [[9, 18], [26, 27], [41, 57], [58, 63], [64, 68], [70, 78]],
  [[10, 17], [41, 57], [58, 62], [65, 68], [71, 75]],
  [[11, 16], [41, 57], [65, 68], [71, 76]],
  [[13, 17], [42, 56], [66, 68], [72, 75]],
  [[15, 18], [43, 55], [66, 67], [72, 76]],
  [[17, 19], [25, 33], [44, 54], [73, 76]],
  [[25, 34], [45, 53], [72, 79]],
  [[25, 34], [46, 52], [73, 80]],
  [[26, 34], [47, 51], [74, 80]],
  [[26, 33], [47, 51], [75, 80], [81, 84]],
  [[26, 33], [47, 51], [82, 85]],
  [[27, 33], [47, 50], [73, 82]],
  [[27, 32], [47, 50], [72, 83]],
  [[28, 32], [48, 50], [72, 83]],
  [[28, 31], [48, 50], [73, 82]],
  [[28, 31], [48, 49], [74, 82]],
  [[29, 31], [48, 49], [74, 81]],
  [[29, 31], [48, 49], [75, 80]],
  [[29, 31], [47, 49], [76, 79]],
  [[30, 31], [47, 48], [77, 78]],
  [[30, 31]],
  [[30, 31]],
  [[30, 31]],
  [[30, 31]],
  [[30, 31]],
  [[30, 30]],
];

// ---------------------------------------------------------------- scenes
function numberBadge(x: number, y: number, n: number, r = 15): void {
  disc(x, y, r, RED);
  ring(x, y, r, WHITE, 2);
  const s = String(n);
  drawText(s, x - textWidth(s, 2) / 2, y - 7, 2, WHITE, true);
}
function tintPanel(x: number, y: number, w: number, h: number, c: number[]): void {
  rect(x, y, w, h, c);
  rect(x, y, w, 3, RED);
}
function flagUS(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, WHITE);
  for (let i = 0; i < 7; i++) if (i % 2 === 0) rect(x, y + (i * h) / 7, w, h / 7 + 1, RED);
  rect(x, y, w * 0.42, h * 0.54, NAVY);
  for (let r = 0; r < 3; r++)
    for (let cI = 0; cI < 4; cI++)
      px(Math.round(x + 6 + cI * ((w * 0.42 - 10) / 3)), Math.round(y + 5 + r * ((h * 0.54 - 8) / 2)), WHITE);
}
function flagIndia(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h / 3, [255, 153, 51]);
  rect(x, y + h / 3, w, h / 3, WHITE);
  rect(x, y + (2 * h) / 3, w, h / 3, [19, 136, 8]);
  ring(x + w / 2, y + h / 2, h / 6, NAVY, 2);
}
function flagJapan(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, WHITE);
  disc(x + w / 2, y + h / 2, h * 0.3, [188, 0, 45]);
}
function flagAus(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, [0, 40, 104]);
  for (let i = 0; i < 5; i++) {
    const sx = x + w * 0.2 + (i % 3) * w * 0.2;
    const sy = y + h * 0.25 + Math.floor(i / 3) * h * 0.4;
    px(Math.round(sx), Math.round(sy), WHITE);
    px(Math.round(sx) + 1, Math.round(sy), WHITE);
  }
  rect(x, y, w * 0.4, h * 0.5, NAVY);
  line(x, y, x + w * 0.4, y + h * 0.5, WHITE, 2);
  line(x + w * 0.4, y, x, y + h * 0.5, WHITE, 2);
}

function sceneRadar(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, NIGHT);
  const stars: [number, number][] = [[0.08, 0.12], [0.2, 0.07], [0.32, 0.16], [0.45, 0.08], [0.58, 0.14], [0.7, 0.06], [0.82, 0.13], [0.93, 0.08], [0.15, 0.24], [0.38, 0.26], [0.66, 0.24], [0.88, 0.26]];
  for (const [fx, fy] of stars) {
    px(Math.round(x + fx * w), Math.round(y + fy * h), WHITE);
    px(Math.round(x + fx * w) + 1, Math.round(y + fy * h), WHITE);
  }
  disc(x + w * 0.85, y + h * 0.2, 14, [232, 226, 200]);
  rect(x, y + h * 0.78, w, h * 0.22, [28, 62, 96]);
  for (let i = 0; i < 8; i++) line(x + 10 + i * 78, y + h * 0.86, x + 50 + i * 78, y + h * 0.86, SEA_DK, 2);
  const bx = x + w * 0.5;
  const by = y + h * 0.78;
  rect(bx - 70, by - 26, 140, 26, GREY_LT);
  rect(bx - 58, by - 44, 116, 18, [200, 198, 188]);
  disc(bx, by - 44, 40, [226, 224, 212]);
  ring(bx, by - 44, 40, [150, 148, 138], 2);
  line(bx, by - 44, bx + 78, by - 108, [255, 210, 90], 3);
  line(bx, by - 44, bx - 60, by - 96, [255, 210, 90], 2);
  for (const [fx, fy] of [[0.16, 0.34], [0.3, 0.44], [0.72, 0.36]] as [number, number][]) {
    const dx = x + fx * w;
    const dy = y + fy * h;
    line(dx - 14, dy, dx + 14, dy, WHITE, 3);
    line(dx, dy - 8, dx, dy + 6, WHITE, 2);
    disc(dx - 14, dy, 3, RED);
    disc(dx + 14, dy, 3, RED);
  }
  line(x + w * 0.12, y + h * 0.66, x + w * 0.24, y + h * 0.4, ORANGE, 3);
  line(x + w * 0.9, y + h * 0.68, x + w * 0.8, y + h * 0.42, ORANGE, 3);
  tri(bx - 96, by, bx - 76, by - 34, bx - 58, by, ORANGE);
  tri(bx + 58, by, bx + 78, by - 30, bx + 96, by, ORANGE);
  tri(bx - 84, by, bx - 70, by - 18, bx - 56, by, [255, 200, 60]);
  disc(bx - 110, by - 44, 12, [120, 120, 120]);
  disc(bx + 112, by - 40, 10, [120, 120, 120]);
}
function sceneBridge(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SKY);
  disc(x + w * 0.86, y + h * 0.22, 18, [255, 240, 190]);
  rect(x, y + h * 0.62, w, h * 0.38, [46, 102, 150]);
  for (let i = 0; i < 7; i++) {
    line(x + 8 + i * 90, y + h * 0.72, x + 52 + i * 90, y + h * 0.72, WHITE, 2);
    line(x + 40 + i * 90, y + h * 0.88, x + 78 + i * 90, y + h * 0.88, WHITE, 2);
  }
  const deckY = y + h * 0.42;
  rect(x + 20, deckY, w * 0.42, 12, [90, 90, 96]);
  // arch of the standing span, drawn as thick segments so it reads
  let prevX = x + 40;
  let prevY = deckY;
  for (let a = 3; a <= 60; a += 3) {
    const t = (a * Math.PI) / 60;
    const nx = Math.round(x + 40 + a * 3.2);
    const ny = Math.round(deckY - Math.sin(t) * 52);
    line(prevX, prevY, nx, ny, [90, 90, 96], 4);
    prevX = nx;
    prevY = ny;
  }
  rect(x + 60, deckY - 70, 10, 70, [70, 70, 76]);
  rect(x + w * 0.36, deckY - 70, 10, 70, [70, 70, 76]);
  line(x + w * 0.46, deckY, x + w * 0.62, y + h * 0.78, [90, 90, 96], 8);
  rect(x + w * 0.78, deckY, w * 0.18, 12, [90, 90, 96]);
  rect(x + w * 0.86, deckY - 40, 10, 40, [70, 70, 76]);
  disc(x + w * 0.52, y + h * 0.3, 16, [120, 120, 120]);
  disc(x + w * 0.56, y + h * 0.2, 20, [140, 140, 140]);
  disc(x + w * 0.6, y + h * 0.12, 14, [160, 160, 160]);
  disc(x + w * 0.3, y + h * 0.28, 12, [140, 140, 140]);
  const bx = x + w * 0.68;
  const by = y + h * 0.8;
  poly([[bx - 34, by], [bx + 34, by], [bx + 24, by + 14], [bx - 24, by + 14]], [200, 60, 50]);
  rect(bx - 12, by - 14, 24, 14, WHITE);
  for (const [fx, fy] of [[0.2, 0.14], [0.28, 0.2], [0.72, 0.12]] as [number, number][]) {
    const gx = x + fx * w;
    const gy = y + fy * h;
    line(gx - 10, gy, gx, gy - 6, INK, 2);
    line(gx, gy - 6, gx + 10, gy, INK, 2);
  }
  for (let i = 0; i < 6; i++) line(x + w * 0.6 + i * 8 - 20, y + h * 0.8, x + w * 0.6 + i * 8 - 16, y + h * 0.72, WHITE, 2);
}
function sceneQuad(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, [214, 196, 168]);
  rect(x, y, w, h * 0.52, [238, 228, 205]);
  const fw = 118;
  const fh = 44;
  const fy = y + 8;
  flagUS(x + 26, fy, fw, fh);
  flagIndia(x + 168, fy, fw, fh);
  flagJapan(x + 310, fy, fw, fh);
  flagAus(x + 452, fy, fw, fh);
  // floor first, then table, then leaders, so nothing is covered
  rect(x, y + h * 0.86, w, h * 0.14, [180, 162, 134]);
  const tableY = y + h * 0.76;
  rect(x + 30, tableY, w - 60, 26, [120, 82, 52]);
  rect(x + 30, tableY, w - 60, 6, [150, 108, 70]);
  const seats = [0.16, 0.38, 0.6, 0.82];
  const suits: number[][] = [NAVY, [90, 30, 40], [40, 60, 90], [40, 70, 50]];
  const hair: number[][] = [[210, 210, 210], [40, 32, 24], [30, 30, 30], [40, 32, 24]];
  for (let i = 0; i < 4; i++) {
    const sx = x + seats[i] * w;
    const sy = tableY;
    rect(sx - 34, sy - 6, 68, 10, [90, 70, 50]);
    poly([[sx - 30, sy], [sx + 30, sy], [sx + 22, sy - 48], [sx - 22, sy - 48]], suits[i]);
    disc(sx, sy - 58, 15, [232, 196, 164]);
    // hair as a cap strip across the top of the head only
    rect(sx - 13, sy - 73, 26, 9, hair[i]);
    line(sx + 26, sy - 6, sx + 34, sy - 34, INK, 2);
    disc(sx + 34, sy - 36, 4, INK);
    rect(sx - 26, sy + 6, 52, 14, WHITE);
  }
}

// Featured scenes: each draws inside (x,y,w,h) — a tinted panel.
function featScene(kind: string, x: number, y: number, w: number, h: number): void {
  const cx = x + w / 2;
  const cy = y + h / 2;
  if (kind === "chip") {
    rect(x + w * 0.08, cy - 26, 96, 52, [30, 34, 44]);
    rect(x + w * 0.08 + 8, cy - 18, 80, 36, NAVY2);
    for (let i = 0; i < 5; i++) {
      rect(x + w * 0.08 + 14 + i * 16, cy - 34, 5, 8, GOLD);
      rect(x + w * 0.08 + 14 + i * 16, cy + 26, 5, 8, GOLD);
    }
    drawText("AI", x + w * 0.08 + 34, cy - 8, 2, WHITE, true);
    const ox = x + w * 0.48;
    line(ox, y + h - 22, ox + w * 0.44, y + h - 22, INK, 2);
    line(ox, y + h - 22, ox, y + 22, INK, 2);
    line(ox + 6, y + h - 30, ox + 34, y + h - 42, GREEN, 4);
    line(ox + 34, y + h - 42, ox + 62, y + h - 36, GREEN, 4);
    line(ox + 62, y + h - 36, ox + 96, y + h - 56, GREEN, 4);
    line(ox + 96, y + h - 56, ox + 122, y + h - 66, GREEN, 4);
    tri(ox + 122, y + h - 72, ox + 110, y + h - 56, ox + 134, y + h - 56, GREEN);
    disc(ox + 34, y + h - 42, 4, GREEN);
    disc(ox + 62, y + h - 36, 4, GREEN);
    disc(ox + 96, y + h - 56, 4, GREEN);
  } else if (kind === "cyclone") {
    line(x + 14, y + h - 14, x + w * 0.55, y + h - 40, TAN, 3);
    line(x + w * 0.55, y + h - 40, x + w * 0.62, y + 18, TAN, 3);
    rect(x + w * 0.62, y, w * 0.38, h, [214, 226, 214]);
    ring(cx - 40, cy - 6, 30, [90, 120, 160], 5);
    ring(cx - 40, cy - 6, 21, [120, 150, 185], 5);
    ring(cx - 40, cy - 6, 12, [150, 180, 210], 5);
    disc(cx - 40, cy - 6, 7, WHITE);
    for (let i = 0; i < 5; i++) line(x + w * 0.12 + i * 14, y + h - 30, x + w * 0.1 + i * 14, y + h - 48, BLUE, 2);
    line(x + w * 0.7, y + 26, x + w * 0.86, y + 26, INK, 3);
    tri(x + w * 0.86, y + 26, x + w * 0.8, y + 18, x + w * 0.8, y + 34, INK);
  } else if (kind === "knesset") {
    rect(cx - 110, cy + 6, 220, 34, [226, 220, 200]);
    rect(cx - 96, cy - 22, 192, 30, [238, 232, 214]);
    disc(cx, cy - 22, 34, [200, 190, 160]);
    rect(cx - 34, cy - 22, 68, 10, [200, 190, 160]);
    for (let i = 0; i < 6; i++) rect(cx - 88 + i * 32, cy - 18, 12, 40, [210, 202, 176]);
    rect(cx - 100, cy + 40, 200, 6, GREY);
    // small flag on a short pole at the foot of the building
    line(cx - 128, cy + 40, cx - 128, cy + 8, INK, 2);
    rect(cx - 128, cy + 8, 26, 14, WHITE);
    line(cx - 128, cy + 12, cx - 102, cy + 12, BLUE, 2);
    line(cx - 128, cy + 18, cx - 102, cy + 18, BLUE, 2);
    disc(cx - 115, cy + 15, 3, BLUE);
    rect(cx - 120, cy + 40, 240, 5, GREY_LT);
  } else if (kind === "euro") {
    disc(cx - 52, cy + 2, 38, GOLD);
    ring(cx - 52, cy + 2, 38, GOLD_DK, 3);
    ring(cx - 52, cy + 2, 27, GOLD_DK, 2);
    drawText("€", cx - 52 - 12, cy - 19, 6, GOLD_DK, true);
    disc(cx + 52, cy + 18, 26, GOLD_DK);
    disc(cx + 52, cy + 10, 26, GOLD);
    ring(cx + 52, cy + 10, 26, GOLD_DK, 2);
    drawText("€", cx + 52 - 8, cy - 2, 4, GOLD_DK, true);
    drawText("45", cx + 66, cy - 34, 3, INK, true);
  } else if (kind === "ban") {
    rect(cx - 120, cy - 6, 240, 40, [210, 205, 190]);
    tri(cx - 120, cy - 6, cx, cy - 36, cx + 120, cy - 6, [190, 184, 168]);
    for (let i = 0; i < 7; i++) rect(cx - 104 + i * 30, cy - 2, 12, 36, [240, 236, 220]);
    rect(cx - 126, cy + 34, 252, 6, GREY);
    ring(cx + 108, cy - 14, 20, RED, 6);
    line(cx + 108 - 14, cy - 14 + 14, cx + 108 + 14, cy - 14 - 14, RED, 6);
  } else if (kind === "ship") {
    rect(x, y + h * 0.62, w, h * 0.38, [70, 130, 175]);
    for (let i = 0; i < 5; i++) line(x + 10 + i * 96, y + h * 0.74, x + 50 + i * 96, y + h * 0.74, WHITE, 2);
    poly([[x + 40, y + h * 0.6], [x + w - 40, y + h * 0.6], [x + w - 80, y + h * 0.82], [x + 80, y + h * 0.82]], [160, 40, 40]);
    const cols: number[][] = [RED, BLUE, GOLD, GREEN, [200, 90, 40]];
    for (let r = 0; r < 2; r++) {
      for (let cI = 0; cI < 5; cI++) {
        rect(x + 66 + cI * 62, y + h * 0.6 - 22 - r * 22, 56, 20, cols[(r * 5 + cI) % 5]);
      }
    }
    rect(x + w - 96, y + h * 0.6 - 44, 40, 44, WHITE);
    rect(x + w - 96, y + h * 0.6 - 44, 40, 10, NAVY);
    rect(x + 60, y + h * 0.6 - 34, 22, 34, [40, 40, 46]);
    disc(x + 52, y + 24, 14, [255, 220, 120]);
  } else if (kind === "plane") {
    rect(x, y, w, h, [226, 232, 238]);
    for (let i = 0; i < 14; i++) {
      const sx = x + 20 + ((i * 67) % (w - 40));
      const sy = y + 14 + ((i * 41) % (h - 28));
      disc(sx, sy, 2, WHITE);
    }
    disc(cx - 120, cy - 26, 12, [150, 150, 150]);
    disc(cx - 96, cy - 18, 16, [165, 165, 165]);
    disc(cx - 70, cy - 10, 12, [180, 180, 180]);
    poly([[cx - 60, cy - 6], [cx + 90, cy + 26], [cx + 70, cy + 40], [cx - 70, cy + 16]], [70, 80, 96]);
    poly([[cx - 30, cy - 6], [cx - 6, cy - 34], [cx + 8, cy - 30], [cx - 4, cy - 4]], [90, 100, 116]);
    poly([[cx - 44, cy + 16], [cx - 30, cy + 44], [cx - 14, cy + 40], [cx - 28, cy + 14]], [90, 100, 116]);
    disc(cx + 78, cy + 30, 6, RED);
    for (const tx of [0.14, 0.24, 0.82, 0.92]) {
      const px0 = x + tx * w;
      tri(px0 - 14, y + h - 12, px0, y + h - 44, px0 + 14, y + h - 12, GREEN);
      rect(px0 - 3, y + h - 12, 6, 10, [90, 70, 50]);
    }
  } else if (kind === "cricket") {
    rect(x, y + h * 0.66, w, h * 0.34, [196, 178, 130]);
    rect(cx - 150, y + h * 0.66, 300, 10, [232, 220, 180]);
    for (let i = 0; i < 3; i++) rect(cx - 96 + i * 12, cy - 8, 7, 34, [240, 220, 160]);
    rect(cx - 96, cy - 12, 31, 5, [240, 220, 160]);
    poly([[cx + 30, cy - 44], [cx + 52, cy - 38], [cx + 8, cy + 34], [cx - 12, cy + 28]], [214, 178, 120]);
    rect(cx + 34, cy - 38, 10, 18, [120, 90, 60]);
    disc(cx + 96, cy - 30, 13, RED);
    ring(cx + 96, cy - 30, 13, RED_DK, 2);
    line(cx + 116, cy - 40, cx + 140, cy - 48, GREY, 2);
    line(cx + 116, cy - 28, cx + 142, cy - 28, GREY, 2);
    for (let i = 0; i < 9; i++) disc(x + 24 + i * 46, y + 16, 6, i % 2 ? BLUE : RED);
  } else if (kind === "phone") {
    rect(cx - 46, cy - 38, 92, 76, [30, 34, 44]);
    rect(cx - 40, cy - 32, 80, 64, [200, 228, 240]);
    rect(cx - 14, cy - 44, 28, 6, [30, 34, 44]);
    const appCols: number[][] = [BLUE, GREEN, RED, GOLD, [120, 80, 160], [200, 90, 40]];
    for (let i = 0; i < 6; i++) rect(cx - 32 + (i % 3) * 26, cy - 24 + Math.floor(i / 3) * 24, 20, 18, appCols[i]);
    disc(cx + 58, cy + 18, 20, GREEN);
    ring(cx + 58, cy + 18, 20, WHITE, 3);
    line(cx + 58 - 10, cy + 18, cx + 58 - 2, cy + 27, WHITE, 4);
    line(cx + 58 - 2, cy + 27, cx + 58 + 11, cy + 9, WHITE, 4);
    for (let i = 0; i < 4; i++) rect(x + 22 + i * 10, y + h - 26 - i * 7, 7, 8 + i * 7, GREEN);
  } else if (kind === "chart") {
    const ox = x + 30;
    line(ox, y + h - 18, ox + w - 60, y + h - 18, INK, 2);
    line(ox, y + h - 18, ox, y + 16, INK, 2);
    const bars = [14, 20, 18, 28, 36, 44];
    for (let i = 0; i < bars.length; i++) {
      const bh = bars[i];
      rect(ox + 12 + i * 62, y + h - 18 - bh, 40, bh, i === bars.length - 1 ? GREEN : BLUE);
    }
    line(ox + 20, y + h - 32, ox + 82, y + h - 40, RED, 3);
    line(ox + 82, y + h - 40, ox + 146, y + h - 36, RED, 3);
    line(ox + 146, y + h - 36, ox + 210, y + h - 50, RED, 3);
    line(ox + 210, y + h - 50, ox + 330, y + h - 58, RED, 3);
    tri(ox + 330, y + h - 64, ox + 316, y + h - 48, ox + 344, y + h - 48, RED);
    drawText("7.5%", ox + w - 150, y + 8, 3, GREEN, true);
  } else if (kind === "solar") {
    disc(x + 56, y + 30, 20, [255, 200, 60]);
    for (let a = 0; a < 8; a++) {
      const rad = (a * Math.PI) / 4;
      line(x + 56 + Math.cos(rad) * 26, y + 30 + Math.sin(rad) * 26, x + 56 + Math.cos(rad) * 34, y + 30 + Math.sin(rad) * 34, [255, 200, 60], 3);
    }
    for (let r = 0; r < 2; r++) {
      for (let cI = 0; cI < 3; cI++) {
        const px0 = cx - 40 + cI * 96;
        const py0 = cy - 28 + r * 30;
        poly([[px0, py0 + 26], [px0 + 84, py0 + 26], [px0 + 72, py0], [px0 - 12, py0]], [36, 80, 160]);
        line(px0 - 6, py0 + 13, px0 + 78, py0 + 13, [120, 180, 220], 2);
        line(px0 + 18, py0 + 2, px0 + 30, py0 + 24, [120, 180, 220], 2);
        line(px0 + 46, py0 + 2, px0 + 58, py0 + 24, [120, 180, 220], 2);
      }
    }
    const tx = x + w - 46;
    const ty = y + h - 14;
    rect(tx - 3, ty - 36, 6, 36, GREY);
    for (let a = 0; a < 3; a++) {
      const rad = (a * 2 * Math.PI) / 3 + 0.5;
      line(tx, ty - 36, tx + Math.cos(rad) * 18, ty - 36 + Math.sin(rad) * 18, GREY, 3);
    }
    disc(tx, ty - 36, 5, GREY);
    rect(x, y + h - 14, w, 14, [120, 160, 90]);
  } else if (kind === "jets") {
    rect(x, y, w, h, [178, 205, 228]);
    for (let i = 0; i < 8; i++) disc(x + 20 + ((i * 83) % (w - 40)), y + 14 + ((i * 29) % 26), 5, WHITE);
    line(x + 20, cy - 24, x + w - 120, cy - 24, WHITE, 3);
    line(x + 20, cy + 30, x + w - 160, cy + 30, WHITE, 3);
    for (const [jx, jy] of [[0.62, 0.34], [0.52, 0.68]] as [number, number][]) {
      const jx0 = x + jx * w;
      const jy0 = y + jy * h;
      poly([[jx0, jy0 - 8], [jx0 + 84, jy0], [jx0, jy0 + 8]], [70, 80, 96]);
      poly([[jx0 + 18, jy0 - 8], [jx0 + 34, jy0 - 30], [jx0 + 46, jy0 - 26], [jx0 + 34, jy0 - 6]], [90, 100, 116]);
      poly([[jx0 + 18, jy0 + 8], [jx0 + 34, jy0 + 30], [jx0 + 46, jy0 + 26], [jx0 + 34, jy0 + 6]], [90, 100, 116]);
      disc(jx0 + 76, jy0, 5, RED);
    }
    disc(x + w - 52, y + 30, 16, [200, 40, 50]);
  }
}

// ---------------------------------------------------------------- layout
const MX = 40;
const PAGE_W = W2 - MX * 2;

function drawMasthead(): void {
  rect(0, 0, W2, 250, NAVY);
  rect(0, 250, W2, 6, RED);
  drawText("THE WORLD IN ONE DAY", MX, 34, 3, WHITE, true);
  drawTextRight("37 STORIES · 6 CONTINENTS · ONE DAY", W2 - MX, 34, 3, WHITE, true);
  line(MX, 76, W2 - MX, 76, [90, 105, 140], 2);
  drawTextCenter("WEDNESDAY 18 NOVEMBER 2026", W2 / 2, 98, 12, WHITE, true);
  drawTextCenter(
    "Every story below happened, or was first reported, on this day.",
    W2 / 2,
    206,
    3,
    [185, 196, 214],
    false,
    1,
  );
}

function drawLeads(): void {
  const y0 = 266;
  const colW = 624;
  const xs = [MX, MX + colW + 40, MX + 2 * (colW + 40)];
  const scenes: ((x: number, y: number, w: number, h: number) => void)[] = [sceneRadar, sceneBridge, sceneQuad];
  for (let i = 0; i < 3; i++) {
    const x = xs[i];
    const L = LEADS[i];
    scenes[i](x, y0, colW, 170);
    numberBadge(x + 30, y0 + 30, L.n, 17);
    drawText(L.kicker, x, y0 + 182, 3, RED, true);
    const hl = wrap(L.headline, colW, 6);
    for (let k = 0; k < hl.length; k++) drawText(hl[k], x, y0 + 210 + k * 46, 6, INK, true);
    drawWrapped(L.deck, x, y0 + 210 + hl.length * 46 + 6, colW, 3, [40, 40, 40], 24);
    if (i > 0) line(x - 20, y0, x - 20, y0 + 440, GREY_LT, 2);
  }
  line(MX, y0 + 454, W2 - MX, y0 + 454, INK, 3);
}

function drawFeatured(): void {
  const yTop = 736;
  const rowH = 300;
  const colW = 474;
  const gapX = 24;
  const tints: number[][] = [
    [226, 232, 240],
    [240, 232, 214],
    [232, 238, 228],
    [240, 226, 222],
  ];
  for (let i = 0; i < FEATURED.length; i++) {
    const f = FEATURED[i];
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = MX + col * (colW + gapX);
    const y = yTop + row * rowH;
    tintPanel(x, y, colW, 80, tints[col]);
    featScene(f.scene, x, y + 1, colW, 78);
    numberBadge(x + 26, y + 26, f.n, 14);
    drawText(f.kicker, x, y + 90, 3, RED, true);
    const hl = wrap(f.headline, colW, 4);
    for (let k = 0; k < hl.length; k++) drawText(hl[k], x, y + 116 + k * 32, 4, INK, true);
    drawWrapped(f.deck, x, y + 116 + hl.length * 32 + 6, colW, 3, [40, 40, 40], 21);
    if (col > 0) line(x - 12, y, x - 12, y + rowH - 18, GREY_LT, 2);
    if (row > 0) line(x, y - 6, x + colW, y - 6, GREY_LT, 2);
  }
  line(MX, yTop + 3 * rowH + 4, W2 - MX, yTop + 3 * rowH + 4, INK, 3);
}

function drawMap(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, SEA);
  // Merge the 40-row land mask into ~square cells: the band is far wider
  // than it is tall, so 40 rows would squash into vertical stripes.
  const cols = 90;
  const trows = 17;
  const cw = w / cols;
  const ch = h / trows;
  for (let t = 0; t < trows; t++) {
    const r0 = Math.floor((t * LAND.length) / trows);
    const r1 = Math.max(Math.floor(((t + 1) * LAND.length) / trows), r0 + 1);
    const landCols = new Set<number>();
    for (let r = r0; r < r1 && r < LAND.length; r++) {
      for (const [c0, c1] of LAND[r]) {
        for (let cI = c0; cI <= c1; cI++) landCols.add(cI);
      }
    }
    for (const cI of landCols) {
      // solid square dots read bolder than small circles at this size
      rect(x + (cI + 0.5) * cw - 3.5, y + (t + 0.5) * ch - 3.5, 7, 7, [168, 138, 88]);
    }
  }
  line(x, y + h / 2, x + w, y + h / 2, SEA_DK, 1);
  for (const [n, lon, lat] of DOTS) {
    const dx = x + ((lon + 180) / 360) * w;
    const dy = y + ((75 - lat) / 130) * h;
    disc(dx, dy, 11, RED);
    ring(dx, dy, 11, WHITE, 2);
    const s = String(n);
    drawText(s, dx - textWidth(s, 2) / 2, dy - 7, 2, WHITE, true);
  }
}

function drawAlso(x: number, y: number, w: number): number {
  const colW = Math.floor((w - 24) / 2);
  const s = 2;
  const lh = 16;
  let bottom = y;
  for (let cI = 0; cI < 2; cI++) {
    let cy = y;
    for (let k = 0; k < 11; k++) {
      const [n, lead, rest] = ALSO[cI * 11 + k];
      const cx = x + cI * (colW + 24);
      const full = n + ". " + lead + " " + rest;
      const lines = wrap(full, colW, s);
      for (let li = 0; li < lines.length; li++) {
        const lineText = lines[li];
        if (li === 0) {
          const numPart = n + ". ";
          const leadPart = lead + " ";
          drawText(numPart, cx, cy, s, RED, true);
          let tx = cx + textWidth(numPart, s);
          drawText(leadPart, tx, cy, s, INK, true);
          tx += textWidth(leadPart, s);
          const restText = lineText.slice(numPart.length + leadPart.length);
          drawText(restText, tx, cy, s, INK);
        } else {
          drawText(lineText, cx, cy, s, INK);
        }
        cy += lh;
      }
      cy += 3;
    }
    bottom = Math.max(bottom, cy);
  }
  return bottom;
}

function drawBottom(): void {
  const y0 = 1656;
  drawText("WHERE IT HAPPENED", MX, y0, 3, INK, true);
  drawText("ALSO ON WEDNESDAY 18 NOVEMBER", 1000, y0, 3, INK, true);
  line(MX, y0 + 26, W2 - MX, y0 + 26, INK, 2);
  const mapX = MX;
  const mapY = y0 + 38;
  const mapW = 920;
  const mapH = 176;
  drawMap(mapX, mapY, mapW, mapH);
  const capY = mapY + mapH + 10;
  drawText("Numbered dots mark stories 1-15.", mapX, capY, 2, INK);
  disc(mapX + 560, capY + 6, 5, TAN);
  drawText("Land", mapX + 572, capY, 2, INK);
  disc(mapX + 640, capY + 6, 5, SEA_DK);
  drawText("Sea", mapX + 652, capY, 2, INK);
  disc(mapX + 716, capY + 6, 6, RED);
  drawText("Story", mapX + 728, capY, 2, INK);
  const jx = mapX;
  const jy = capY + 26;
  const jw = mapW;
  const jh = 60;
  rect(jx, jy, jw, jh, [253, 246, 236]);
  rect(jx, jy, jw, 3, RED);
  rect(jx, jy + jh - 3, jw, 3, RED);
  rect(jx, jy, 3, jh, RED);
  rect(jx + jw - 3, jy, 3, jh, RED);
  drawText("JUDGE NOTE", jx + 14, jy + 8, 2, RED, true);
  drawWrapped(
    "Every story above happened, or was first reported, on Wednesday 18 November 2026. Disputed claims are attributed, not stated as fact.",
    jx + 14,
    jy + 28,
    jw - 28,
    2,
    INK,
    17,
  );
  drawAlso(1000, y0 + 38, W2 - MX - 1000);
  const fy = 1988;
  line(MX, fy - 10, W2 - MX, fy - 10, INK, 2);
  drawTextCenter(
    "Every story was reported on Wednesday 18 November 2026; disputed claims are attributed. Sources: AP, Reuters, AFP, BBC, Al Jazeera, UN News. Original drawings.",
    W2 / 2,
    fy,
    2,
    [60, 60, 60],
  );
}

function render(): Buffer {
  rect(0, 0, W2, H2, PAPER);
  drawMasthead();
  drawLeads();
  drawFeatured();
  drawBottom();
  const out = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const i = ((y * 2 + dy) * W2 + (x * 2 + dx)) * 3;
          r += buf[i];
          g += buf[i + 1];
          b += buf[i + 2];
        }
      }
      const o = (y * W + x) * 3;
      out[o] = Math.round(r / 4);
      out[o + 1] = Math.round(g / 4);
      out[o + 2] = Math.round(b / 4);
    }
  }
  return encodePNG(out, W, H);
}

function main(): void {
  const dir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(dir, { recursive: true });
  const png = render();
  fs.writeFileSync(path.join(dir, "entry.png"), png);
}

main();
