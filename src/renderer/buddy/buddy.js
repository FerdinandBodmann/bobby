"use strict";

const stage = document.getElementById("stage");
const ball = document.getElementById("ball");
const root = document.documentElement;
const cosmeticEl = document.getElementById("cosmetic");

const state = {
  mood: "idle",
  name: "Bobby",
  color: "#726FCF",
  cosmetic: null,
  sounds: true,
};

/* ---------------- colours ---------------- */

function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return { r: 114, g: 111, b: 207 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const toHex = (r, g, b) =>
  "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

function rgbToHsl({ r, g, b }) {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rr) h = 60 * (((gg - bb) / d) % 6);
    else if (max === gg) h = 60 * ((bb - rr) / d + 2);
    else h = 60 * ((rr - gg) / d + 4);
  }
  return { h: (h + 360) % 360, s, l };
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let tri;
  if (h < 60) tri = [c, x, 0];
  else if (h < 120) tri = [x, c, 0];
  else if (h < 180) tri = [0, c, x];
  else if (h < 240) tri = [0, x, c];
  else if (h < 300) tri = [x, 0, c];
  else tri = [c, 0, x];
  return { r: (tri[0] + m) * 255, g: (tri[1] + m) * 255, b: (tri[2] + m) * 255 };
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

function applyColor(hex) {
  const base = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(base);
  // Artwork shading: the crown catches light (pale, nearly neutral) and the
  // base sinks into a deeper, richer shade of the very same hue.
  const light = hslToRgb(h, clamp01(s * 0.33), clamp01(l * 1.04));
  const dark = hslToRgb(h, clamp01(s * 1.58), clamp01(l * 0.96));
  root.style.setProperty("--ball-color", toHex(base.r, base.g, base.b));
  root.style.setProperty("--ball-light", toHex(light.r, light.g, light.b));
  root.style.setProperty("--ball-dark", toHex(dark.r, dark.g, dark.b));
}

/* ---------------- eye tracking ---------------- */

let lastMove = 0;

function setLook(x, y) {
  stage.style.setProperty("--ex", `${x.toFixed(1)}px`);
  stage.style.setProperty("--ey", `${y.toFixed(1)}px`);
}

let wakeArmed = true;

window.addEventListener("mousemove", (e) => {
  const r = ball.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const dx = Math.max(-1, Math.min(1, (e.clientX - cx) / (r.width / 2)));
  const dy = Math.max(-1, Math.min(1, (e.clientY - cy) / (r.height / 2)));
  setLook(dx * 5, dy * 4);
  lastMove = Date.now();

  // Sneak the mouse over a napping Bobby and he stirs awake.
  if (state.mood === "sleeping" && wakeArmed) {
    const over =
      e.clientX >= r.left - 8 && e.clientX <= r.right + 8 &&
      e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8;
    if (over) {
      wakeArmed = false;
      window.bobby.invoke("buddy:wake").catch(() => {}).finally(() => (wakeArmed = true));
    }
  }
});

// When nothing is happening, glance around now and then.
setInterval(() => {
  if (state.mood !== "idle" && state.mood !== "sleeping") return;
  if (Date.now() - lastMove < 3500) return;
  setLook((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 5);
}, 4200);

/* ---------------- blinking ---------------- */

function blink() {
  stage.classList.add("blink");
  setTimeout(() => stage.classList.remove("blink"), 130);
}

function scheduleBlink() {
  const wait = 2300 + Math.random() * 4200;
  setTimeout(() => {
    if (state.mood !== "sleeping") {
      blink();
      if (Math.random() < 0.22) setTimeout(blink, 190);
    }
    scheduleBlink();
  }, wait);
}
scheduleBlink();

/* ---------------- geometry helpers (for tests) ---------------- */

// Design-time geometry, in the stage's own unscaled 200x160 coordinate space.
// `--scale` on #stage does the actual sizing, so nothing here is multiplied by
// it — the bean, mouth and blush all scale together with the stage transform.
const GEOMETRY = {
  "--ball-w": 156,
  "--ball-h": 110,
  "--ball-radius": 46,
  "--mouth-w": 26,
  "--mouth-h": 13,
  "--mouth-top": 68,
  "--cheek-y": 64,
  "--cheek-w": 23,
  "--cheek-h": 10,
  "--cheek-inset": 17,
  "--shadow-w": 132,
  "--shadow-h": 16,
  "--shadow-top": 127,
};

function setGeometry() {
  for (const [k, v] of Object.entries(GEOMETRY)) root.style.setProperty(k, v + "px");
}

// what the tests ask about: the bean's real box, in CSS px, at the current scale
window.buddyInfo = function buddyInfo() {
  const b = ball.getBoundingClientRect();
  const m = document.getElementById("mouth").getBoundingClientRect();
  const e = [...document.querySelectorAll(".eye")].map((n) => n.getBoundingClientRect());
  return {
    ball: { left: Math.round(b.left), top: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) },
    mouth: { top: Math.round(m.top), bottom: Math.round(m.bottom), w: Math.round(m.width), h: Math.round(m.height) },
    eyes: e.map((r) => ({ left: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) })),
    cosmetic: (() => {
      const c = cosmeticEl.getBoundingClientRect();
      return { on: cosmeticEl.classList.contains("on"), w: Math.round(c.width), h: Math.round(c.height), x: Math.round(c.x), y: Math.round(c.y) };
    })(),
    mood: state.mood,
    scale: state.scale,
  };
};

/* ---------------- cosmetics ----------------
   One little decoration worn on the bean. The wardrobe itself lives in
   src/shared/cosmetics.js (loaded before this file) so the settings preview and
   the tray menus describe exactly the same thing. Each entry is plain SVG, and
   `size` is a fraction of the bean's height. */

const COSMETICS = (window.BOBBY_COSMETICS && window.BOBBY_COSMETICS.COSMETICS) || {};

function paintCosmetic() {
  const c = state.cosmetic || {};
  const def = COSMETICS[c.id];
  if (!def) {
    cosmeticEl.classList.remove("on");
    cosmeticEl.innerHTML = "";
    return;
  }
  // Unscaled stage coordinates; #stage's transform scales this along with the bean.
  const px = Math.round(110 * def.size * (Number(c.scale) || 1));
  cosmeticEl.style.width = px + "px";
  cosmeticEl.style.height = px + "px";
  cosmeticEl.style.left = Math.round(156 * (c.cx ?? def.cx ?? 0.5)) + "px";
  cosmeticEl.style.top = Math.round(110 * (c.cy ?? def.cy ?? 0.8)) + "px";
  cosmeticEl.innerHTML = def.svg;
  cosmeticEl.classList.add("on");
}

/* ---------------- sounds ---------------- */

let audio = null;

function sound(kind) {
  if (!state.sounds) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    const t = audio.currentTime;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.connect(g);
    g.connect(audio.destination);

    if (kind === "pop") {
      o.type = "sine";
      o.frequency.setValueAtTime(680, t);
      o.frequency.exponentialRampToValueAtTime(300, t + 0.09);
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.start(t);
      o.stop(t + 0.11);
    } else if (kind === "happy") {
      o.type = "sine";
      o.frequency.setValueAtTime(520, t);
      o.frequency.setValueAtTime(780, t + 0.08);
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.start(t);
      o.stop(t + 0.23);
    } else if (kind === "boop") {
      o.type = "triangle";
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(140, t + 0.16);
      g.gain.setValueAtTime(0.09, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.start(t);
      o.stop(t + 0.19);
    }
  } catch {}
}

/* ---------------- interaction ---------------- */

let clickTimer = null;
let dragState = null;
let suppressClickUntil = 0;

ball.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  dragState = {
    id: e.pointerId,
    startX: e.screenX,
    startY: e.screenY,
    lastX: e.screenX,
    lastY: e.screenY,
    moved: false,
  };
  try { ball.setPointerCapture(e.pointerId); } catch {}
});

ball.addEventListener("pointermove", (e) => {
  const d = dragState;
  if (!d || e.pointerId !== d.id) return;
  if (d.moved) {
    document.body.classList.add("dragging");
    window.bobby.invoke("buddy:dragState", { dragging: true });
  }
  if (!d.moved) return;
  const dx = e.screenX - d.lastX;
  const dy = e.screenY - d.lastY;
  d.lastX = e.screenX;
  d.lastY = e.screenY;
  if (dx || dy) window.bobby.invoke("buddy:moveBy", { dx, dy });
});

function endDrag(e) {
  const d = dragState;
  if (!d || e.pointerId !== d.id) return;
  dragState = null;
  document.body.classList.remove("dragging");
  window.bobby.invoke("buddy:dragState", { dragging: false });
  try { ball.releasePointerCapture(e.pointerId); } catch {}
  if (d.moved) suppressClickUntil = Date.now() + 300;
}
ball.addEventListener("pointerup", endDrag);
ball.addEventListener("pointercancel", endDrag);

function pokeAnim() {
  stage.classList.remove("poke");
  void stage.offsetWidth;
  stage.classList.add("poke");
  setTimeout(() => stage.classList.remove("poke"), 520);
}

ball.addEventListener("click", () => {
  if (Date.now() < suppressClickUntil) return;
  if (clickTimer) return;
  clickTimer = setTimeout(async () => {
    clickTimer = null;
    pokeAnim();
    sound("pop");
    try { await window.bobby.invoke("buddy:poke"); } catch {}
  }, 210);
});

ball.addEventListener("dblclick", (e) => {
  e.preventDefault();
  if (Date.now() < suppressClickUntil) return;
  clearTimeout(clickTimer);
  clickTimer = null;
  sound("happy");
  window.bobby.invoke("app:openChat");
});

window.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  window.bobby.invoke("buddy:contextMenu");
});

/* ---------------- state from main ---------------- */

window.bobby.on("buddy:state", (s) => {
  if (!s) return;
  const prevMood = state.mood;
  Object.assign(state, s);
  stage.dataset.mood = state.mood || "idle";
  if (s.color) applyColor(s.color);
  if (s.scale) root.style.setProperty("--scale", String(s.scale));
  setGeometry();
  if (s.cosmetic !== undefined) {
    state.cosmetic = s.cosmetic && typeof s.cosmetic === "object" ? s.cosmetic : null;
    paintCosmetic();
  }
  if (s.name) {
    ball.title = `${s.name} — drag to move, click to poke, double-click to chat`;
    document.title = s.name;
  }
  if (s.mood === "happy" && prevMood !== "happy") sound("happy");
  if (s.mood === "error" && prevMood !== "error") sound("boop");
});

window.bobby.on("buddy:cosmetic", ({ cosmetic }) => {
  state.cosmetic = cosmetic && typeof cosmetic === "object" ? cosmetic : null;
  paintCosmetic();
});

applyColor(state.color);
setGeometry();
paintCosmetic();
