// news-image-20261118 — "The World in One Day"
// A newspaper front page summing up Wednesday 18 November 2026.
// Node 22+, standard library only, no network, fully deterministic.
// Draws into a raw RGB buffer and encodes its own PNG (zlib deflate,
// own CRC32, IHDR/IDAT/IEND only — no text chunks, no timestamps).
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";

const W = 1024;
const H = 1024;
const buf = Buffer.alloc(W * H * 3);

// ---- palette ----
const CREAM = [244, 239, 228];
const INK = [20, 20, 22];
const NAVY = [31, 42, 68];
const NAVY_D = [22, 30, 50];
const RED = [179, 35, 42];
const WHITE = [255, 255, 255];
const GREY = [120, 122, 126];
const LINE = [178, 170, 150];
const SEA = [207, 224, 232];
const TAN = [216, 196, 154];
const GOLD = [212, 175, 55];
const GREEN = [46, 125, 70];
const BLUE = [70, 110, 160];
const ORANGE = [224, 110, 40];
const YELLOW = [240, 200, 60];
const SKY = [188, 211, 224];
const DARKSEA = [95, 138, 168];

function px(x, y, c) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
}
function rect(x, y, w, h, c) {
  for (let j = y; j < y + h; j++)
    for (let i = x; i < x + w; i++) px(i, j, c);
}
function hline(x, y, w, c) { rect(x, y, w, 1, c); }
function vline(x, y, h, c) { rect(x, y, 1, h, c); }
function line(x0, y0, x1, y1, c) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  for (let n = 0; n < 4000; n++) {
    px(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}
function disc(cx, cy, r, c) {
  for (let j = cy - r; j <= cy + r; j++)
    for (let i = cx - r; i <= cx + r; i++)
      if ((i - cx) * (i - cx) + (j - cy) * (j - cy) <= r * r) px(i, j, c);
}
function ring(cx, cy, r, c) {
  for (let a = 0; a < 360; a += 2) {
    const t = (a * Math.PI) / 180;
    px(Math.round(cx + r * Math.cos(t)), Math.round(cy + r * Math.sin(t)), c);
  }
}
function poly(points, c) {
  // scanline fill, even-odd
  let minY = 1e9, maxY = -1e9;
  for (const p of points) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  for (let y = Math.ceil(minY); y <= maxY; y++) {
    const xs = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let x = Math.ceil(xs[k]); x <= xs[k + 1]; x++) px(x, y, c);
  }
}
function tri(x, y, w, h, c) { // triangle pointing up, base at y+h
  poly([[x + w / 2, y], [x, y + h], [x + w, y + h]], c);
}

// ---- bitmap font: 5x7, written by hand ----
const FONT = {
  A: ["01110","10001","10001","11111","10001","10001","10001"],
  B: ["11110","10001","10001","11110","10001","10001","11110"],
  C: ["01110","10001","10000","10000","10000","10001","01110"],
  D: ["11110","10001","10001","10001","10001","10001","11110"],
  E: ["11111","10000","10000","11110","10000","10000","11111"],
  F: ["11111","10000","10000","11110","10000","10000","10000"],
  G: ["01110","10001","10000","10111","10001","10001","01111"],
  H: ["10001","10001","10001","11111","10001","10001","10001"],
  I: ["01110","00100","00100","00100","00100","00100","01110"],
  J: ["00111","00010","00010","00010","00010","10010","01100"],
  K: ["10001","10010","10100","11000","10100","10010","10001"],
  L: ["10000","10000","10000","10000","10000","10000","11111"],
  M: ["10001","11011","10101","10101","10001","10001","10001"],
  N: ["10001","11001","10101","10011","10001","10001","10001"],
  O: ["01110","10001","10001","10001","10001","10001","01110"],
  P: ["11110","10001","10001","11110","10000","10000","10000"],
  Q: ["01110","10001","10001","10001","10101","10010","01101"],
  R: ["11110","10001","10001","11110","10100","10010","10001"],
  S: ["01111","10000","10000","01110","00001","00001","11110"],
  T: ["11111","00100","00100","00100","00100","00100","00100"],
  U: ["10001","10001","10001","10001","10001","10001","01110"],
  V: ["10001","10001","10001","10001","10001","01010","00100"],
  W: ["10001","10001","10001","10101","10101","11011","10001"],
  X: ["10001","10001","01010","00100","01010","10001","10001"],
  Y: ["10001","10001","01010","00100","00100","00100","00100"],
  Z: ["11111","00001","00010","00100","01000","10000","11111"],
  "0": ["01110","10001","10011","10101","11001","10001","01110"],
  "1": ["00100","01100","00100","00100","00100","00100","01110"],
  "2": ["01110","10001","00001","00110","01000","10000","11111"],
  "3": ["11110","00001","00001","01110","00001","00001","11110"],
  "4": ["00010","00110","01010","10010","11111","00010","00010"],
  "5": ["11111","10000","11110","00001","00001","10001","01110"],
  "6": ["01110","10000","10000","11110","10001","10001","01110"],
  "7": ["11111","00001","00010","00100","01000","01000","01000"],
  "8": ["01110","10001","10001","01110","10001","10001","01110"],
  "9": ["01110","10001","10001","01111","00001","00001","01110"],
  ".": ["00000","00000","00000","00000","00000","01100","01100"],
  ",": ["00000","00000","00000","00000","01100","00100","01000"],
  ":": ["00000","01100","01100","00000","01100","01100","00000"],
  "'": ["00100","00100","01000","00000","00000","00000","00000"],
  "-": ["00000","00000","00000","01110","00000","00000","00000"],
  "(": ["00010","00100","01000","01000","01000","00100","00010"],
  ")": ["01000","00100","00010","00010","00010","00100","01000"],
  "!": ["00100","00100","00100","00100","00100","00000","00100"],
  "?": ["01110","10001","00001","00110","00100","00000","00100"],
  "/": ["00001","00010","00010","00100","01000","01000","10000"],
  "&": ["01100","10010","10100","01000","10101","10010","01101"],
  "%": ["11001","11010","00010","00100","01000","01011","10011"],
  $: ["00100","01111","10100","01110","00101","11110","00100"],
  "+": ["00000","00100","00100","11111","00100","00100","00000"],
  "=": ["00000","00000","11111","00000","11111","00000","00000"],
  " ": ["00000","00000","00000","00000","00000","00000","00000"],
};
function textWidth(s, sc) { return s.length * 6 * sc - sc; }
function drawText(s, x, y, sc, c) {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const g = FONT[ch] || FONT[" "];
    for (let r = 0; r < 7; r++)
      for (let col = 0; col < 5; col++)
        if (g[r][col] === "1") rect(cx + col * sc, y + r * sc, sc, sc, c);
    cx += 6 * sc;
  }
}
function drawTextC(s, cx, y, sc, c) { drawText(s, cx - Math.floor(textWidth(s, sc) / 2), y, sc, c); }
function drawTextR(s, rx, y, sc, c) { drawText(s, rx - textWidth(s, sc), y, sc, c); }
function wrap(s, maxW, sc) {
  const words = s.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (textWidth(t, sc) <= maxW) cur = t;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---- PNG encoder ----
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePNG() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    buf.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- paper ----
rect(0, 0, W, H, CREAM);

// ================= MASTHEAD =================
rect(0, 0, W, 112, NAVY);
drawText("THE WORLD IN ONE DAY", 16, 12, 1, WHITE);
drawTextR("33 STORIES - 6 CONTINENTS - ONE DAY", 1008, 12, 1, WHITE);
drawText("WEDNESDAY 18 NOVEMBER 2026", 107, 40, 5, WHITE);
hline(0, 104, W, RED);
rect(0, 105, W, 7, NAVY_D);

// ================= THREE BIG LEADS =================
const LEADS = [
  {
    x: 16, kicker: "MIDDLE EAST - WAR",
    head: "US AND IRAN TRADE FIRE OVER BAHRAIN",
    deck: "Iranian drones target US radar at Sheikh Isa; Bahrain intercepts again; US jets struck Qeshm on Tuesday",
    scene: 1,
  },
  {
    x: 351, kicker: "EUROPE - WAR",
    head: "UKRAINE DROPS A SPAN OF THE CRIMEA BRIDGE",
    deck: "A second day of strikes brings the road arch down; Russia answers against Kyiv's two main bridges",
    scene: 2,
  },
  {
    x: 686, kicker: "ASIA - DIPLOMACY",
    head: "TRUMP IN MANILA FOR FIRST QUAD IN TWO YEARS",
    deck: "He meets Modi, Takaichi and Albanese at ASEAN, then flies to Shenzhen for APEC",
    scene: 3,
  },
];
function sceneBahrain(x, y, w, h) {
  rect(x, y, w, h, NAVY_D);
  rect(x, y + h - 34, w, 34, [150, 40, 35]); // red glow horizon
  rect(x, y + h - 18, w, 18, [30, 30, 44]); // dark ground
  for (const [sx, sy] of [[18, 12], [70, 26], [150, 10], [230, 22], [290, 12]]) disc(x + sx, y + sy, 1, WHITE);
  // radar station: mast + tilted dish
  rect(x + 150, y + 46, 6, 46, [200, 200, 205]);
  poly([[x + 118, y + 58], [x + 150, y + 40], [x + 188, y + 48], [x + 160, y + 62]], [210, 210, 215]);
  line(x + 118, y + 58, x + 188, y + 48, [230, 230, 235]);
  rect(x + 96, y + 82, 116, 12, [90, 92, 100]); // base building
  for (let i = 0; i < 5; i++) rect(x + 104 + i * 20, y + 86, 8, 6, YELLOW);
  // fire left
  tri(x + 18, y + 62, 26, 30, ORANGE);
  tri(x + 26, y + 72, 14, 20, YELLOW);
  tri(x + 240, y + 70, 20, 22, ORANGE);
  // drones: small dark crosses with red lights
  for (const [dx, dy] of [[60, 34], [250, 40], [205, 24]]) {
    line(x + dx - 8, y + dy, x + dx + 8, y + dy, INK);
    line(x + dx, y + dy - 5, x + dx, y + dy + 5, INK);
    disc(x + dx, y + dy, 2, RED);
  }
}
function sceneBridge(x, y, w, h) {
  rect(x, y, w, h, SKY);
  rect(x, y + 78, w, h - 78, DARKSEA);
  for (const [cx, cy, r] of [[90, 26, 12], [120, 18, 15], [150, 28, 10]]) disc(x + cx, y + cy, r, [235, 235, 235]);
  // towers
  rect(x + 58, y + 30, 8, 52, [120, 122, 128]);
  rect(x + 250, y + 30, 8, 52, [120, 122, 128]);
  // deck: left standing, right standing, middle collapsed
  rect(x, y + 76, 120, 7, [90, 92, 100]);
  rect(x + 210, y + 76, w - 210, 7, [90, 92, 100]);
  line(x + 120, y + 79, x + 168, y + 104, [90, 92, 100]);
  line(x + 168, y + 104, x + 210, y + 79, [90, 92, 100]);
  // cables
  line(x + 62, y + 34, x + 120, y + 76, GREY);
  line(x + 254, y + 34, x + 210, y + 76, GREY);
  // smoke over the gap
  disc(x + 165, y + 52, 10, [200, 200, 200]);
  disc(x + 180, y + 44, 12, [220, 220, 220]);
  // splash
  disc(x + 165, y + 100, 6, WHITE);
  disc(x + 150, y + 104, 4, WHITE);
}
function flagUS(x, y) {
  for (let i = 0; i < 7; i++) rect(x, y + i * 4, 46, 4, i % 2 === 0 ? RED : WHITE);
  rect(x, y, 20, 16, NAVY);
  for (const [sx, sy] of [[4, 4], [12, 4], [4, 11], [12, 11], [8, 7]]) disc(x + sx, y + sy, 1, WHITE);
}
function flagIN(x, y) {
  rect(x, y, 46, 10, [255, 153, 51]);
  rect(x, y + 10, 46, 9, WHITE);
  rect(x, y + 19, 46, 9, [19, 136, 8]);
  ring(x + 23, y + 14, 4, NAVY);
}
function flagJP(x, y) {
  rect(x, y, 46, 28, WHITE);
  disc(x + 23, y + 14, 7, RED);
}
function sceneSummit(x, y, w, h) {
  rect(x, y, w, h, [232, 223, 200]);
  // flag poles
  for (const [fx, fn] of [[28, flagUS], [138, flagIN], [248, flagJP]]) {
    vline(x + fx + 46, y + 8, 52, INK);
    fn(x + fx, y + 8);
  }
  // table
  rect(x + 30, y + 82, w - 60, 10, [122, 84, 52]);
  rect(x + 40, y + 92, 8, 20, [96, 64, 40]);
  rect(x + w - 48, y + 92, 8, 20, [96, 64, 40]);
  // four seated leaders
  const suits = [NAVY, [70, 70, 74], [90, 40, 44], [40, 70, 52]];
  for (let i = 0; i < 4; i++) {
    const lx = x + 58 + i * 70;
    rect(lx, y + 62, 34, 22, suits[i]);
    disc(lx + 17, y + 52, 10, [232, 188, 150]);
    rect(lx + 7, y + 42, 20, 5, i === 1 ? INK : [120, 120, 120]);
  }
}
for (const L of LEADS) {
  const x = L.x, w = 322, y = 120, sh = 112;
  if (L.scene === 1) sceneBahrain(x, y, w, sh);
  if (L.scene === 2) sceneBridge(x, y, w, sh);
  if (L.scene === 3) sceneSummit(x, y, w, sh);
  rect(x, y, w, 2, INK); rect(x, y + sh - 2, w, 2, INK);
  drawText(L.kicker, x, 242, 1, RED);
  const hl = wrap(L.head, w, 2);
  hl.forEach((ln, i) => drawText(ln, x, 256 + i * 17, 2, INK));
  const dk = wrap(L.deck, w, 1);
  dk.slice(0, 2).forEach((ln, i) => drawText(ln, x, 294 + i * 11, 1, [60, 60, 64]));
  hline(x, 326, w, LINE);
}

// ================= TWELVE FEATURED =================
const FEAT = [
  { n: 4, kicker: "MARKETS - TECHNOLOGY", head: "NVIDIA REVENUE MORE THAN DOUBLES", deck: "$115.8BN IN THE QUARTER; DATA CENTRE SALES HIT $107.6BN", icon: "chip" },
  { n: 5, kicker: "ASIA - WEATHER", head: "CYCLONE AKVAN BEARS DOWN ON INDIA", deck: "CROSSES ANDHRA PRADESH ON FRIDAY WITH WINDS OF 145 KM/H", icon: "cyclone" },
  { n: 6, kicker: "MIDDLE EAST - POLITICS", head: "KNESSET ELECTS KAHANA", deck: "EISENKOT ALLY TAKES THE SPEAKERSHIP 66-52 FROM LIKUD", icon: "knesset" },
  { n: 7, kicker: "EUROPE - UKRAINE AID", head: "EU PLANS 45BN EURO LOAN FOR UKRAINE", deck: "TWO-THIRDS OF KYIV 70BN EURO 2027 GAP; REPAID ONLY BY RUSSIA", icon: "euro" },
  { n: 8, kicker: "BRITAIN - SANCTIONS", head: "BRITAIN SANCTIONS SETTLEMENT BUILDERS", deck: "EIGHT ISRAELI FIRMS AND THE GROUP TZAV 9 FACE ASSET FREEZES", icon: "sanction" },
  { n: 9, kicker: "TRADE - CHINA-CANADA", head: "CHINA CUTS TARIFFS AS XI MEETS CARNEY", deck: "400M DOLLARS RELIEF ON PORK AND SEAFOOD; STEEL RELIEF EXTENDED", icon: "ship" },
  { n: 10, kicker: "ASIA - DISASTER", head: "RUSSIAN PLANE CRASHES IN SIBERIA", deck: "AN AN-12 DOWN NEAR YAGUNOVO; 19 DEAD, ALL ABOARD KILLED", icon: "plane" },
  { n: 11, kicker: "ASIA - SPORT", head: "DHONI ENDS IPL PLAYING CAREER", deck: "CSK NAME HIM TEAM MENTOR FOR 2027; FIVE TITLES, 272 APPEARANCES", icon: "cricket" },
  { n: 12, kicker: "TECHNOLOGY", head: "APPLE RESTORES SERVICES", deck: "APP STORE, ICLOUD AND APPLE PAY BACK AFTER A THREE-HOUR OUTAGE", icon: "phone" },
  { n: 13, kicker: "ASIA - ECONOMY", head: "INDIA GDP GREW 7.5% LAST QUARTER", deck: "JULY-SEPTEMBER GROWTH HOLDS FIRM, ECONOMISTS SAY", icon: "bars" },
  { n: 14, kicker: "ASIA - BUSINESS", head: "AMAZON TO INVEST $7BN IN INDIA", deck: "THE PLAN BACKS SOLAR AND WIND POWER FOR ITS INDIAN OPERATIONS", icon: "solar" },
  { n: 15, kicker: "ASIA - SECURITY", head: "JAPAN SCRAMBLES FIGHTERS", deck: "TOKYO PROTESTS AS SUSPECTED RUSSIAN JETS ENTER ITS AIRSPACE", icon: "jets" },
];
function iconChip(x, y, w, h) {
  rect(x, y, w, h, [226, 232, 222]);
  rect(x + 14, y + 6, 20, 18, INK);
  rect(x + 19, y + 11, 10, 8, GREEN);
  for (let i = 0; i < 3; i++) { hline(x + 8, y + 10 + i * 6, 6, INK); hline(x + 34, y + 10 + i * 6, 6, INK); }
  const pts = [[x + 52, y + 24], [x + 76, y + 18], [x + 100, y + 20], [x + 128, y + 10], [x + 160, y + 12], [x + 200, y + 4]];
  for (let i = 0; i + 1 < pts.length; i++) line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], GREEN);
  tri(x + 196, y + 2, 8, 7, GREEN);
}
function iconCyclone(x, y, w, h) {
  rect(x, y, w, h, [214, 228, 236]);
  ring(x + 60, y + 15, 12, BLUE); ring(x + 60, y + 15, 8, BLUE); ring(x + 60, y + 15, 4, BLUE);
  line(x + 60, y + 15, x + 72, y + 15, BLUE);
  rect(x + 130, y + 18, w - 130, 12, TAN);
  drawText("COAST", x + 150, y + 21, 1, [90, 70, 40]);
  line(x + 100, y + 8, x + 130, y + 14, RED);
}
function iconKnesset(x, y, w, h) {
  rect(x, y, w, h, [232, 226, 210]);
  rect(x + 70, y + 8, 100, 16, [200, 190, 160]);
  disc(x + 120, y + 10, 8, [160, 150, 120]);
  for (let i = 0; i < 5; i++) vline(x + 78 + i * 20, y + 12, 12, [120, 110, 90]);
  rect(x + 60, y + 24, 120, 5, [140, 130, 105]);
  drawText("JERUSALEM", x + 168, y + 12, 1, [90, 80, 60]);
}
function iconEuro(x, y, w, h) {
  rect(x, y, w, h, [240, 230, 190]);
  disc(x + 40, y + 15, 12, GOLD);
  drawText("EU", x + 32, y + 11, 1, NAVY);
  drawText("45BN EURO LOAN", x + 62, y + 11, 1, NAVY);
  line(x + 62, y + 24, x + 200, y + 24, NAVY);
}
function iconSanction(x, y, w, h) {
  rect(x, y, w, h, [232, 226, 210]);
  rect(x + 16, y + 10, 60, 14, [180, 170, 145]);
  for (let i = 0; i < 4; i++) vline(x + 22 + i * 14, y + 13, 9, [120, 110, 90]);
  ring(x + 150, y + 15, 12, RED);
  line(x + 141, y + 6, x + 159, y + 24, RED);
  line(x + 159, y + 6, x + 141, y + 24, RED);
  drawText("FROZEN", x + 176, y + 11, 1, RED);
}
function iconShip(x, y, w, h) {
  rect(x, y, w, h, [214, 228, 236]);
  rect(x + 120, y + 22, w - 120, 8, DARKSEA);
  poly([[x + 20, y + 14], [x + 150, y + 14], [x + 140, y + 26], [x + 30, y + 26]], [60, 64, 72]);
  rect(x + 34, y + 4, 16, 10, RED);
  rect(x + 52, y + 4, 16, 10, BLUE);
  rect(x + 70, y + 4, 16, 10, GOLD);
  rect(x + 88, y + 4, 16, 10, GREEN);
  hline(x + 160, y + 24, 60, WHITE);
}
function iconPlane(x, y, w, h) {
  rect(x, y, w, h, [226, 232, 238]);
  poly([[x + 30, y + 18], [x + 110, y + 8], [x + 130, y + 12], [x + 60, y + 22]], [150, 152, 158]);
  line(x + 80, y + 10, x + 70, y + 22, [150, 152, 158]);
  line(x + 100, y + 10, x + 92, y + 22, [150, 152, 158]);
  for (const [sx, sy] of [[160, 6], [180, 14], [200, 8], [220, 18], [150, 22]]) disc(x + sx, y + sy, 1, WHITE);
  rect(x, y + 26, w, 4, WHITE);
}
function iconCricket(x, y, w, h) {
  rect(x, y, w, h, [220, 236, 210]);
  poly([[x + 30, y + 4], [x + 44, y + 4], [x + 36, y + 22], [x + 26, y + 22]], [150, 110, 60]);
  rect(x + 34, y + 20, 5, 8, [150, 110, 60]);
  for (let i = 0; i < 3; i++) vline(x + 120 + i * 7, y + 8, 18, [220, 190, 120]);
  hline(x + 118, y + 8, 22, [220, 190, 120]);
  disc(x + 180, y + 12, 5, RED);
  drawText("272", x + 196, y + 9, 1, INK);
}
function iconPhone(x, y, w, h) {
  rect(x, y, w, h, [226, 232, 222]);
  rect(x + 30, y + 3, 18, 26, INK);
  rect(x + 33, y + 6, 12, 16, [200, 220, 235]);
  disc(x + 39, y + 25, 1, WHITE);
  line(x + 60, y + 22, x + 68, y + 26, GREEN);
  line(x + 68, y + 26, x + 84, y + 8, GREEN);
  drawText("BACK ONLINE", x + 92, y + 11, 1, GREEN);
}
function iconBars(x, y, w, h) {
  rect(x, y, w, h, [226, 232, 222]);
  rect(x + 30, y + 18, 22, 10, BLUE);
  rect(x + 58, y + 12, 22, 16, BLUE);
  rect(x + 86, y + 6, 22, 22, GREEN);
  drawText("7.5%", x + 120, y + 11, 2, GREEN);
}
function iconSolar(x, y, w, h) {
  rect(x, y, w, h, [240, 232, 200]);
  disc(x + 36, y + 12, 9, YELLOW);
  for (let a = 0; a < 8; a++) {
    const t = (a * Math.PI) / 4;
    line(x + 36 + Math.round(11 * Math.cos(t)), y + 12 + Math.round(11 * Math.sin(t)),
      x + 36 + Math.round(15 * Math.cos(t)), y + 12 + Math.round(15 * Math.sin(t)), ORANGE);
  }
  vline(x + 130, y + 6, 22, INK);
  line(x + 130, y + 6, x + 118, y + 16, INK);
  line(x + 130, y + 6, x + 142, y + 16, INK);
  line(x + 130, y + 6, x + 130, y + 18, INK);
  drawText("$7BN", x + 160, y + 11, 2, GREEN);
}
function iconJets(x, y, w, h) {
  rect(x, y, w, h, [214, 228, 236]);
  poly([[x + 30, y + 10], [x + 70, y + 14], [x + 30, y + 20]], [120, 124, 130]);
  poly([[x + 90, y + 8], [x + 130, y + 12], [x + 90, y + 18]], [90, 94, 100]);
  line(x + 30, y + 15, x + 6, y + 15, WHITE);
  line(x + 90, y + 13, x + 66, y + 13, WHITE);
  drawText("AIRSPACE", x + 150, y + 11, 1, RED);
}
const ICONS = { chip: iconChip, cyclone: iconCyclone, knesset: iconKnesset, euro: iconEuro, sanction: iconSanction, ship: iconShip, plane: iconPlane, cricket: iconCricket, phone: iconPhone, bars: iconBars, solar: iconSolar, jets: iconJets };
hline(0, 338, W, NAVY);
FEAT.forEach((f, idx) => {
  const col = idx % 4, row = Math.floor(idx / 4);
  const x = 16 + col * 250, y = 346 + row * 106, w = 242, h = 104;
  rect(x, y, w, h, WHITE);
  rect(x, y, w, 1, LINE); rect(x, y + h - 1, w, 1, LINE);
  rect(x, y, 1, h, LINE); rect(x + w - 1, y, 1, h, LINE);
  ICONS[f.icon](x + 1, y + 1, w - 2, 30);
  drawText(f.n + ". " + f.kicker, x + 4, y + 37, 1, RED);
  const hl = wrap(f.head, w - 8, 2);
  hl.slice(0, 2).forEach((ln, i) => drawText(ln, x + 4, y + 49 + i * 17, 2, INK));
  const dk = wrap(f.deck, w - 8, 1);
  dk.slice(0, 2).forEach((ln, i) => drawText(ln, x + 4, y + 84 + i * 10, 1, [60, 60, 64]));
});

// ================= BOTTOM BAND: MAP + ALSO LIST =================
hline(0, 672, W, NAVY);
drawText("WHERE IT HAPPENED", 16, 682, 2, NAVY);
drawText("ALSO ON WEDNESDAY 18 NOVEMBER", 500, 682, 2, NAVY);

// world map, equirectangular: lon -170..190, lat 75..-55
const MAP = { x: 16, y: 706, w: 470, h: 200 };
function project(lon, lat) {
  return [
    MAP.x + Math.round(((lon + 170) / 360) * MAP.w),
    MAP.y + Math.round(((75 - lat) / 130) * MAP.h),
  ];
}
rect(MAP.x, MAP.y, MAP.w, MAP.h, SEA);
const NA = [[-168, 66], [-140, 70], [-120, 72], [-95, 80], [-80, 73], [-60, 60], [-55, 47], [-70, 42], [-75, 35], [-80, 26], [-90, 21], [-97, 16], [-105, 20], [-115, 28], [-125, 40], [-125, 49], [-140, 60], [-165, 60]];
const SA = [[-80, 10], [-60, 5], [-50, 0], [-35, -8], [-40, -20], [-48, -28], [-58, -35], [-65, -45], [-70, -55], [-73, -40], [-70, -20], [-80, -5]];
const EU = [[-10, 36], [-9, 43], [0, 48], [-2, 50], [5, 53], [8, 57], [10, 59], [18, 56], [21, 55], [24, 58], [28, 60], [30, 62], [32, 70], [25, 71], [18, 69], [12, 65], [5, 60], [5, 58], [-5, 50], [-10, 43]];
const UK = [[-5, 50], [-3, 53], [-5, 56], [-2, 58], [0, 53], [1, 51]];
const AF = [[-17, 15], [-10, 30], [0, 35], [10, 37], [20, 32], [32, 31], [35, 28], [43, 12], [51, 11], [48, 0], [40, -10], [35, -18], [32, -26], [26, -34], [18, -35], [15, -27], [12, -18], [9, -1], [9, 4], [-8, 5], [-13, 8]];
const AS = [[30, 70], [40, 68], [60, 69], [70, 72], [90, 75], [110, 77], [130, 72], [160, 70], [178, 66], [170, 60], [160, 55], [142, 50], [140, 40], [130, 42], [127, 35], [122, 30], [120, 25], [110, 20], [108, 12], [105, 8], [100, 6], [97, 15], [92, 21], [88, 22], [80, 15], [77, 8], [73, 20], [66, 25], [60, 25], [57, 26], [52, 28], [50, 30], [48, 30], [44, 29], [42, 35], [36, 36], [32, 36], [30, 40]];
const AU = [[113, -22], [114, -30], [115, -35], [124, -33], [130, -32], [135, -35], [140, -38], [146, -39], [150, -37], [153, -27], [146, -19], [142, -11], [136, -12], [132, -12], [126, -14], [122, -17], [118, -20]];
const NZ = [[167, -45], [174, -41], [178, -38], [175, -38], [168, -44]];
const CONT = [
  [NA, [217, 196, 143]], [SA, [194, 209, 138]], [EU, [185, 200, 216]],
  [UK, [185, 200, 216]], [AF, [224, 177, 131]], [AS, [216, 160, 138]],
  [AU, [168, 200, 160]], [NZ, [168, 200, 160]],
];
for (const [pts, col] of CONT) poly(pts.map(([lo, la]) => project(lo, la)), col);
// graticule
for (let lo = -120; lo <= 120; lo += 60) {
  const [gx] = project(lo, 75);
  for (let yy = MAP.y; yy < MAP.y + MAP.h; yy += 4) px(gx, yy, [190, 208, 216]);
}
// dots: [n, lon, lat, label dx, label dy]
const DOTS = [
  [1, 50.5, 26.2, 0, 0], [2, 36.5, 45.3, 0, 0], [3, 121, 14.6, 0, 0],
  [4, -122, 37.4, 0, 0], [5, 82, 16, 16, -4], [6, 35.2, 31.8, 0, 0],
  [7, 4.4, 50.8, 0, 0], [8, -0.1, 51.5, -16, -12], [9, 116.4, 39.9, 0, 0],
  [10, 86, 55.5, 0, 0], [11, 80.3, 13.1, 14, 12], [12, -114, 33, 14, 12],
  [13, 77.2, 28.6, -16, -14], [14, 72.8, 19.1, -18, 2], [15, 139.7, 35.7, 0, 0],
];
for (const [n, lo, la, dx, dy] of DOTS) {
  const [dxp, dyp] = project(lo, la);
  disc(dxp, dyp, 4, RED);
  const lx = dxp + dx, ly = dyp + dy;
  if (dx || dy) line(dxp, dyp, lx, ly, INK);
  disc(lx, ly, 7, RED);
  const ns = String(n);
  drawText(ns, lx - Math.floor(textWidth(ns, 1) / 2), ly - 3, 1, WHITE);
}
// legend
const LEG = [["N AMERICA", [217, 196, 143]], ["S AMERICA", [194, 209, 138]], ["EUROPE", [185, 200, 216]], ["AFRICA", [224, 177, 131]], ["ASIA", [216, 160, 138]], ["OCEANIA", [168, 200, 160]]];
let lx0 = 16;
for (const [nm, col] of LEG) {
  rect(lx0, 914, 9, 9, col);
  rect(lx0, 914, 9, 1, INK); rect(lx0, 922, 9, 1, INK);
  drawText(nm, lx0 + 12, 915, 1, INK);
  lx0 += 12 + textWidth(nm, 1) + 14;
}
drawText("NUMBERED DOTS MARK STORIES 1-15.", 16, 932, 1, [60, 60, 64]);

// also list, stories 16-33, two columns of nine
const ALSO = [
  "ESTONIA TO SHUT RUSSIA BORDER 1 DEC",
  "POPE LEO FORGIVES ROSARY THROWER",
  "JORDAN AND IRAQ BLOCK TELEGRAM",
  "US PRESSES UN OVER TAIWAN CURBS",
  "BAIDU CHIEF WARNS OF AI BUBBLE",
  "INDIA RE-ELECTED TO ITU COUNCIL",
  "JAY SHAH RE-ELECTED ICC CHAIRMAN",
  "UEFA BACKS DIALLO VS INFANTINO",
  "MODI OFFERS FREE E-VISAS AT ASEAN",
  "PAKISTAN AND IRAN STRESS ENGAGEMENT",
  "JAPAN OFFERS ASEAN ENERGY STORAGE",
  "COSTA RICA JOURNALIST SHOT DEAD",
  "GUINEA CRACKDOWN DISPLACES THOUSANDS",
  "TRUMP SIGNS THAILAND TRADE DEAL",
  "EBOLA CASES PASS 11,000 IN CONGO",
  "US MEASLES CASES PASS 5,400",
  "GAZA TENTS FLOOD IN STORMS",
  "UN WARNS OF DRASTIC EMISSION CUTS",
];
ALSO.forEach((s, i) => {
  const n = 16 + i;
  const col = i < 9 ? 0 : 1;
  const row = i % 9;
  const x = 500 + col * 258;
  const y = 706 + row * 24;
  drawText(n + ".", x, y + 6, 1, RED);
  drawText(s, x + 24, y + 6, 1, INK);
});

// ================= FOOTER =================
hline(0, 958, W, NAVY);
drawTextC("EVERY STORY HAPPENED OR WAS FIRST REPORTED ON WEDNESDAY 18 NOVEMBER 2026.", 512, 970, 1, INK);
drawTextC("DISPUTED CLAIMS ARE ATTRIBUTED. SOURCES: AP, REUTERS, AFP, BBC, AL JAZEERA, UN NEWS. ORIGINAL DRAWINGS.", 512, 988, 1, INK);

// ---- write ----
const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "entry.png"), encodePNG());
