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
  mint: hex("#6EE7C8"),
  mintDeep: hex("#2FA98C"),
  mintLight: hex("#CBFFF3"),
  leaf: hex("#4FBF8B"),
  leafDeep: hex("#2E9E6E"),
  ink: hex("#1F2A44"),
  white: hex("#FFFFFF"),
  blush: hex("#FF9EB0"),
};

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

/** Coverage of an ellipse (smooth edge over ~1.5px). */
function ellipseCov(px, py, cx, cy, rx, ry) {
  const d = Math.hypot((px - cx) / rx, (py - cy) / ry);
  const px_ = ((px - cx) / rx) * ((px - cx) / rx) + ((py - cy) / ry) * ((py - cy) / ry);
  const grad = Math.sqrt(px_); // normalized distance
  const edge = 1.5 / Math.min(rx, ry);
  return smooth(1 - edge, 1 + edge, 2 - grad * 2 + 1) || 0, smooth(1 - edge / 1, 1 + edge, 1.999 - grad);
}

function ellipseAlpha(px, py, cx, cy, rx, ry, soft = 1.5) {
  const nx = (px - cx) / rx;
  const ny = (py - cy) / ry;
  const d = Math.hypot(nx, ny);
  const e = soft / Math.min(rx, ry);
  return smooth(1 - e, 1 + e, d < 0 ? 1 - d : d); // smoothstep toward inside
}

function circleAlpha(px, py, cx, cy, r, soft = 1.5) {
  const d = Math.hypot(px - cx, py - cy);
  return smooth(r - soft, r + soft, d);
}

/* ---------------- the actual icon ---------------- */

function draw(size) {
  const S = size / 512; // design space is 512x512
  const buf = Buffer.alloc(size * size * 4);

  // design-space helpers
  const X = (v) => v * S;
  const cx = 256,
    cy = 310,
    R = 178;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x / S,
        dy = y / S;

      /* --- stem + leaf (drawn first, sits behind the ball top) --- */
      {
        // little stalk
        const stalk = ellipseAlpha(dx, dy, 256, 120, 14, 46, 2);
        if (stalk > 0) paint(buf, size, x, y, COL.leafDeep, stalk);
        // leaf: rotated ellipse to the right
        const lx = dx - 300,
          ly = dy - 92;
        const rot = (-32 * Math.PI) / 180;
        const rxp = lx * Math.cos(rot) - ly * Math.sin(rot);
        const ryp = lx * Math.sin(rot) + ly * Math.cos(rot);
        const leaf = ellipseAlpha(rxp, ryp, 0, 0, 66, 30, 2);
        if (leaf > 0) {
          const shade = clamp(0.55 + 0.45 * (1 - (ryp + 30) / 60), 0, 1);
          const col = [
            Math.round(lerp(COL.leafDeep[0], COL.leaf[0], shade)),
            Math.round(lerp(COL.leafDeep[1], COL.leaf[1], shade)),
            Math.round(lerp(COL.leafDeep[2], COL.leaf[2], shade)),
          ];
          paint(buf, size, x, y, col, leaf);
        }
      }

      /* --- ball body --- */
      const nd = Math.hypot(dx - cx, dy - cy) / R;
      const bodyA = nd < 1.2 ? smooth(1 - 1.5 / R, 1 + 1.5 / R, nd) : 0;
      if (bodyA > 0) {
        const nx = (dx - cx) / R;
        const ny = (dy - cy) / R;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const L = [-0.42, -0.78, 0.47];
        const diff = nx * L[0] + ny * L[1] + nz * L[2];
        const t = clamp((diff + 0.55) / 1.35, 0, 1);
        // base gradient: deep -> mint -> light
        let col;
        if (t < 0.55) {
          const k = t / 0.55;
          col = [
            Math.round(lerp(COL.mintDeep[0], COL.mint[0], k)),
            Math.round(lerp(COL.mintDeep[1], COL.mint[1], k)),
            Math.round(lerp(COL.mintDeep[2], COL.mint[2], k)),
          ];
        } else {
          const k = (t - 0.55) / 0.45;
          col = [
            Math.round(lerp(COL.mint[0], COL.mintLight[0], k)),
            Math.round(lerp(COL.mint[1], COL.mintLight[1], k)),
            Math.round(lerp(COL.mint[2], COL.mintLight[2], k)),
          ];
        }
        // specular blob top-left
        const spec = Math.pow(Math.max(0, diff), 26) * 0.95;
        // rim light bottom-right
        const rim = Math.pow(1 - nz, 2.2) * Math.max(0, nx * 0.5 + ny * 0.85) * 0.5;
        col = [
          clamp(col[0] + spec * 255 + rim * 90, 0, 255),
          clamp(col[1] + spec * 255 + rim * 120, 0, 255),
          clamp(col[2] + spec * 255 + rim * 110, 0, 255),
        ];
        paint(buf, size, x, y, col, bodyA);
      }

      /* --- face (only where the ball is) --- */
      if (nd < 1.05) {
        // eyes
        for (const ex of [cx - 58, cx + 58]) {
          const eye = ellipseAlpha(dx, dy, ex, cy - 22, 30, 38, 1.6);
          if (eye > 0) paint(buf, size, x, y, COL.ink, eye);
          // glints
          const g1 = ellipseAlpha(dx, dy, ex + 11, cy - 38, 10, 12, 1.2);
          if (g1 > 0) paint(buf, size, x, y, COL.white, g1 * 0.95);
          const g2 = ellipseAlpha(dx, dy, ex - 10, cy - 6, 5, 6, 1.2);
          if (g2 > 0) paint(buf, size, x, y, COL.white, g2 * 0.75);
        }
        // blush
        for (const bx of [cx - 108, cx + 108]) {
          const b = ellipseAlpha(dx, dy, bx, cy + 34, 30, 17, 6);
          if (b > 0) paint(buf, size, x, y, COL.blush, b * 0.45);
        }
        // smile: parabola arc
        const sx = dx - cx;
        const smileY = cy + 44 + sx * sx * 0.0042;
        if (Math.abs(sx) < 46 && dy > cy + 30) {
          const m = smooth(5.5, 2.5, Math.abs(dy - smileY));
          if (m > 0) paint(buf, size, x, y, COL.ink, m * 0.95);
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
