/**
 * Generates the app/tray icons: a cute little ball with a stem.
 * Pure Node (zlib only) — no image libraries needed.
 *
 *   node scripts/gen-icon.js
 */
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

/* ---------------- PNG encoding ---------------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------------- drawing helpers ---------------- */

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

const COL = {
  bodyLight: hex("#9797B4"),
  body: hex("#726FCF"),
  bodyDark: hex("#4C47EA"),
  ink: hex("#000000"),
};

const lerp3 = (a, b, t) => [
  Math.round(lerp(a[0], b[0], t)),
  Math.round(lerp(a[1], b[1], t)),
  Math.round(lerp(a[2], b[2], t)),
];

/** Draw with antialiased alpha onto an RGBA buffer ("over" composite). */
function paint(buf, W, x, y, color, alpha) {
  if (alpha <= 0) return;
  const i = (Math.floor(y) * W + Math.floor(x)) * 4;
  const a = clamp(alpha, 0, 1);
  const da = buf[i + 3] / 255;
  const outA = a + da * (1 - a);
  if (outA <= 0) return;
  for (let c = 0; c < 3; c++) {
    buf[i + c] = Math.round((color[c] * a + buf[i + c] * da * (1 - a)) / outA);
  }
  buf[i + 3] = Math.round(outA * 255);
}

/** Alpha for a rounded rectangle with elliptical corners, antialiased. */
function roundRectAlpha(px, py, cx, cy, hw, hh, rx, ry, soft = 1.5) {
  const dx = Math.abs(px - cx);
  const dy = Math.abs(py - cy);
  const qx = dx - (hw - rx);
  const qy = dy - (hh - ry);
  let d;
  if (qx > 0 && qy > 0) d = (Math.hypot(qx / rx, qy / ry) - 1) * Math.min(rx, ry);
  else d = Math.max(qx, qy);
  return 1 - smooth(-soft, soft, d);
}

function ellipseAlpha(px, py, cx, cy, rx, ry, soft = 1.5) {
  const nx = (px - cx) / rx;
  const ny = (py - cy) / ry;
  const d = Math.hypot(nx, ny);
  const e = soft / Math.min(rx, ry);
  return smooth(1 - e, 1 + e, d < 0 ? 1 - d : d); // smoothstep toward inside
}

/* ---------------- the actual icon ---------------- */

function draw(size) {
  const S = size / 512; // design space is 512x512
  const buf = Buffer.alloc(size * size * 4);

  const cx = 256;
  const cy = 256;
  const W = 380;
  const H = 262;
  const hw = W / 2;
  const hh = H / 2;
  const rx = 0.411 * W;
  const ry = 0.390 * H;

  // eye geometry, straight from the artwork
  const eyeW = 0.171 * W;
  const eyeH = 0.195 * H;
  const eyeTop = cy - hh + 0.266 * H;
  const eyeY = eyeTop + eyeH / 2;
  const eyeXs = [
    cx - hw + 0.224 * W + eyeW / 2,
    cx - hw + 0.503 * W + eyeW / 2,
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x / S;
      const py = y / S;

      const bodyA = roundRectAlpha(px, py, cx, cy, hw, hh, rx, ry, 1.2);
      if (bodyA > 0) {
        // same ramp as the in-app bean: light crown → base → deep foot
        const t = clamp((py - (cy - hh)) / H, 0, 1);
        const col =
          t < 0.5
            ? lerp3(COL.bodyLight, COL.body, t / 0.5)
            : lerp3(COL.body, COL.bodyDark, (t - 0.5) / 0.5);
        paint(buf, size, x, y, col, bodyA);

        for (const ex of eyeXs) {
          const eye = ellipseAlpha(px, py, ex, eyeY, eyeW / 2, eyeH / 2, 1.1);
          if (eye > 0) paint(buf, size, x, y, COL.ink, eye * 0.42 * bodyA);
        }
      }
    }
  }
  return encodePNG(size, size, buf);
}

/* ---------------- main ---------------- */

const outDir = path.join(__dirname, "..", "assets");
fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 64, 128, 256, 512]) {
  const file = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(file, draw(size));
  console.log("wrote", file);
}
fs.copyFileSync(path.join(outDir, "icon-256.png"), path.join(outDir, "icon.png"));
console.log("done");
