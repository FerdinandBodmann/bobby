"use strict";

const stage = document.getElementById("stage");
const ball = document.getElementById("ball");
const root = document.documentElement;

const state = {
  mood: "idle",
  name: "Bobby",
  color: "#BACF8D",
  scale: 1,
  sounds: true,
};

/* ---------------- colours ---------------- */

function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return { r: 186, g: 207, b: 141 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const toHex = (r, g, b) =>
  "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

function mix(rgb, target, t) {
  return {
    r: rgb.r + (target.r - rgb.r) * t,
    g: rgb.g + (target.g - rgb.g) * t,
    b: rgb.b + (target.b - rgb.b) * t,
  };
}

function applyColor(hex) {
  const base = hexToRgb(hex);
  const light = mix(base, { r: 255, g: 255, b: 255 }, 0.55);
  const dark = mix(base, { r: 20, g: 40, b: 36 }, 0.38);
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

window.addEventListener("mousemove", (e) => {
  const r = ball.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const dx = Math.max(-1, Math.min(1, (e.clientX - cx) / (r.width / 2)));
  const dy = Math.max(-1, Math.min(1, (e.clientY - cy) / (r.height / 2)));
  setLook(dx * 5, dy * 4);
  lastMove = Date.now();
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
  if (!d.moved && Math.hypot(e.screenX - d.startX, e.screenY - d.startY) > 4) {
    d.moved = true;
    document.body.classList.add("dragging");
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
  if (s.name) {
    ball.title = `${s.name} — drag to move, click to poke, double-click to chat`;
    document.title = s.name;
  }
  if (s.mood === "happy" && prevMood !== "happy") sound("happy");
  if (s.mood === "error" && prevMood !== "error") sound("boop");
});

applyColor(state.color);
