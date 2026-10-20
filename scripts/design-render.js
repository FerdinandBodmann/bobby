"use strict";
/**
 * Render Bobby to PNG so someone (or some vision model) can actually look at him.
 *
 *   npx electron scripts/design-render.js --out /tmp/bobby-design
 *   npx electron scripts/design-render.js --out /tmp/bobby-design --sheet cosmetics
 *
 * Sheets:
 *   all        moods, cosmetics, palette, one big hero shot  (default)
 *   moods      every mood at the current colour
 *   cosmetics  every cosmetic on an idle bean
 *   palette    a few preset colours
 *   hero       one large idle shot
 *
 * Writes `NN-name.png` files plus a `sheet-<name>.png` contact strip into --out.
 */
const path = require("path");
const fs = require("fs");
const { app, BrowserWindow, nativeImage } = require("electron");

const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const flag = (name) => args.includes("--" + name);

const OUT = arg("out", "/tmp/bobby-design");
const SHEET = arg("sheet", "all");
const ZOOM = Number(arg("zoom", 2));

const MOODS = ["idle", "thinking", "talking", "happy", "error", "sleeping"];
const COSMETICS = ["none", ...require("../src/shared/cosmetics").ORDER];
const PALETTE = ["#726FCF", "#5FB89A", "#E4A24C", "#E0708F", "#4C8FE4", "#BACF8D"];

// Let each cosmetic use its own default spot, exactly like the real bean does.
const WEAR = { scale: 1 };

function label(text) {
  return `<div class="cap">${text}</div>`;
}

async function shoot(page, { mood = "idle", color, cosmetic = "none", scale = 1, zoom = ZOOM }) {
  await page.webContents.executeJavaScript(`(() => {
    document.documentElement.style.setProperty('--scale', '${scale}');
    state.scale = ${scale};
    state.color = '${color || state.color}';
    applyColor(state.color);
    setGeometry();
    state.cosmetic = ${cosmetic === "none" ? "null" : JSON.stringify({ id: cosmetic, ...WEAR })};
    paintCosmetic();
    state.mood = '${mood}';
    stage.dataset.mood = '${mood}';
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 240));
  const zoomOk = page.webContents.getZoomFactor();
  if (zoomOk !== zoom) page.webContents.setZoomFactor(zoom);
  await new Promise((r) => setTimeout(r, 90));
  const img = await page.webContents.capturePage();
  if (zoomOk !== zoom) page.webContents.setZoomFactor(1);
  return img;
}

async function save(img, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, img.toPNG());
  return file;
}

/** Stack images vertically onto a strip with captions, using an offscreen page. */
async function strip(items, file, { cols = 3, cell = 260 } = {}) {
  const rows = Math.ceil(items.length / cols);
  // Inline the PNGs as data URLs: a page loaded from a data: URL has an opaque
  // origin and silently refuses to load file:// images, which is why the
  // thumbnails used to come out as broken placeholders.
  const thumbs = items.map((it) => ({
    caption: it.caption,
    src: "data:image/png;base64," + fs.readFileSync(it.file).toString("base64"),
  }));
  const html = `<!doctype html><meta charset="utf-8"><style>
    body { margin:0; background:#20243a; font-family:system-ui,sans-serif; color:#cfd6ea;
      display:grid; grid-template-columns: repeat(${cols}, ${cell}px); }
    figure { margin:0; padding:12px 10px; text-align:center; }
    img { width:${cell - 40}px; height:${cell - 40}px; object-fit:contain;
      background:#141726; border-radius:10px; }
    .cap { font-size:12px; letter-spacing:.03em; margin-top:6px; opacity:.75; }
  </style>` +
    thumbs
      .map((it) => `<figure><img src="${it.src}">${label(it.caption)}</figure>`)
      .join("");
  const w = new BrowserWindow({
    width: cols * cell,
    height: rows * cell + 8,
    show: false,
    backgroundColor: "#20243a",
    webPreferences: { offscreen: false, sandbox: false },
  });
  await w.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  await w.webContents.executeJavaScript(
    `Promise.all([...document.images].map((i) => i.decode().catch(() => {})))`
  );
  await new Promise((r) => setTimeout(r, 400));
  const img = await w.webContents.capturePage();
  await save(img, file);
  w.destroy();
  return file;
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const page = new BrowserWindow({
    width: 640,
    height: 560,
    show: false,
    realtime: false,
    backgroundColor: "#20243a",
    webPreferences: {
      preload: path.join(ROOT, "src", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      offscreen: true,
      additionalArguments: ["--window=buddy"],
    },
  });
  await page.loadFile(path.join(ROOT, "src", "renderer", "buddy", "index.html"));
  // Solid backdrop, no animation, and anchor the stage top-left so the bean can
  // be blown up to fill the capture window.
  await page.webContents.insertCSS(`
    html, body { background: #20243a !important; overflow: visible !important; }
    * { animation: none !important; transition: none !important; }
    #stage { transform-origin: top left !important; }
  `);
  await new Promise((r) => setTimeout(r, 400));

  const base = "#726FCF";
  const made = [];
  const wantAll = SHEET === "all";
  const jobs = [];
  const add = (name, opts, caption) => jobs.push({ name, opts, caption });

  if (wantAll || SHEET === "hero") add("hero", { mood: "idle", color: base, scale: 1.6, zoom: 3 }, "idle · hero");
  if (wantAll || SHEET === "moods") {
    for (const m of MOODS) add(`mood-${m}`, { mood: m, color: base }, m);
  }
  if (wantAll || SHEET === "cosmetics") {
    for (const c of COSMETICS) add(`cosmetic-${c}`, { mood: "idle", color: base, cosmetic: c }, c);
  }
  if (wantAll || SHEET === "palette") {
    for (const c of PALETTE) add(`color-${c.slice(1)}`, { mood: "idle", color: c }, c);
  }
  if (wantAll) {
    add("combo-happy-bow", { mood: "happy", color: base, cosmetic: "bow" }, "happy + bow");
    add("combo-sleeping-boba", { mood: "sleeping", color: base, cosmetic: "boba" }, "sleeping + boba");
  }

  for (const j of jobs) {
    const img = await shoot(page, j.opts);
    const file = await save(img, path.join(OUT, `${j.name}.png`));
    made.push({ file, caption: j.caption });
    console.log("wrote", file, img.getSize().width + "x" + img.getSize().height);
  }

  const stripFile = await strip(made, path.join(OUT, `sheet-${SHEET}.png`), {
    cols: SHEET === "hero" ? 1 : 4,
  });
  console.log("wrote", stripFile);
  console.log(JSON.stringify({ out: OUT, sheet: stripFile, count: made.length }));
  app.exit(0);
});
