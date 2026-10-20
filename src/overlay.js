"use strict";
/**
 * Window wrangling for the buddy: the ball overlay, its speech bubble,
 * and the little consent card.
 */
const path = require("path");
const { BrowserWindow, screen } = require("electron");

const PRELOAD = path.join(__dirname, "preload.js");
const BASE_W = 200;
const BASE_H = 160;
// The bean's own CSS box inside the window (it is not centred: left 22, w 156).
const BALL_CSS_LEFT = 22;
const BALL_CSS_TOP = 26;
const BALL_CSS_W = 156;
const BALL_CSS_H = 110;
// The bean is not centred in its window: CSS puts it at left 22px with a width
// of 156px. Everything that points at the buddy — bubble, consent card, face —
// has to use the same anchor.
const BALL_LEFT = BALL_CSS_LEFT;

/* ---- peek-at-the-top behaviour ----
   In "top" mode he lives centred at the very top edge of the screen with only
   the crown of the bean showing. Reach up there and he slides all the way down
   in front of you; walk away and he tucks back up, leaving the sliver. */
const PEEK = {
  reveal: 9, // px of bean crown on screen while he's parked
  revealFull: 136, // ...and once he's slid out (whole bean, sitting just below the edge)
  slideMs: 240,
  graceMs: 260, // keep him out while the pointer hops between sliver and bean
  hoverSlop: 6, // window px around the on-screen part that still counts as "on him"
  pollMs: 140,
  settleMs: 160, // let the slide finish before we judge where he is on screen
};

// Speech-bubble window: bigger than the visible pill so it has room to grow
// (4 clamped lines) and so the tail can reach sideways to the bean.
const BUBBLE = {
  w: 300,
  h: 140,
  scale: 1.35,
  gapBelow: 3,
  gapAbove: 6,
  marginTop: 10,
  marginBottom: 12,
  tipAbove: 18,
  tipBelow: 34,
  side: 18,
};

const QUIPS = [
  "boop!",
  "hehe.",
  "yes?",
  "i'm awake!",
  "that tickles.",
  "hi hi!",
  "you poked me.",
  "*happy jiggle*",
  "i was napping…",
  "whatcha doin?",
  "again! again!",
];

const NAP_AFTER_MS = Number(process.env.BOBBY_NAP_MS) || 5 * 60 * 1000; // quiet this long and he dozes off

class Overlay {
  constructor({ onContextMenu } = {}) {
    this.cfg = null;
    this.onContextMenu = onContextMenu || (() => {});
    this.buddy = null;
    this.bubbleWin = null;
    this.consentWin = null;
    this.consent = null;
    this.bubbleTimer = null;
    this.bubbleSticky = false;
    this.saveTimer = null;
    this.idleTimer = null;
    // Quiet time before a nap. A test can shorten it (scripts/trigger.js) and
    // set it back to null; touch() falls back to NAP_AFTER_MS.
    this.napAfterMs = null;
    this.peek = {
      enabled: false,
      revealed: false,
      resting: true,
      hideTimer: null,
      moveTimer: null,
      settleTimer: null,
      settleUntil: 0,
      poll: null,
      win: null,
      winProbe: null,
      pinned: false,
    };
    this.visible = true;
  }

  attach(config) {
    this.cfg = config;
    this.refreshPeekMode();
  }

  /* ---------------- peek at the top ---------------- */

  size() {
    const s = this.cfg?.get().appearance.scale || 1;
    return { w: Math.round(BASE_W * s), h: Math.round(BASE_H * s), s };
  }

  /** Is the buddy parked at the top edge (top mode) or sitting wherever you put him? */
  refreshPeekMode() {
    const p = this.cfg.get().placement || {};
    const wasEnabled = this.peek.enabled;
    const wants = p.mode === "top";
    if (this.peek.enabled === wants) {
      if (!wants) return;
      if (!this.peek.poll) this.watch();
      return;
    }
    this.peek.enabled = wants;
    if (!wants) {
      this.stopWatching();
      clearTimeout(this.peek.hideTimer);
      clearTimeout(this.peek.moveTimer);
      this.peek.revealed = true;
      this.peek.resting = false;
      return;
    }
    this.peek.revealed = false;
    this.peek.resting = true;
    if (!this.peek.poll) this.watch();
  }

  /** The screen he peeks from. */
  peekDisplay() {
    return this.displayFor(this.cfg.get().placement || {});
  }

  /** Window y that leaves exactly `reveal` px of the bean's crown on screen. The
   *  bean sits `ball.top` px into the window, so hiding the rest pushes the
   *  window above the top edge by (height - reveal). */
  revealY(reveal) {
    const display = this.peekDisplay();
    const ball = this.ballBox();
    return Math.round(display.bounds.y + reveal - ball.top - ball.h);
  }

  /** Where the bean actually is on screen, as the compositor has it. */
  async beanScreenRect() {
    if (!this.buddy || this.buddy.isDestroyed()) return null;
    const win = await this.reportedWindow();
    if (!win) return null;
    const ball = this.ballBox();
    return {
      left: Math.round(win.x + ball.left / BASE_W * win.w),
      top: Math.round(win.y + ball.top / BASE_H * win.h),
      w: Math.round(ball.w / BASE_W * win.w),
      h: Math.round(ball.h / BASE_H * win.h),
    };
  }

  /** Just the part of him that is on screen — the only part you can hover. */
  async visibleZone() {
    const r = await this.beanScreenRect();
    if (!r) return null;
    const display = this.peekDisplay();
    const b = display.bounds;
    const slop = PEEK.hoverSlop;
    const top = Math.max(r.top - slop, b.y);
    const bottom = Math.min(r.top + r.h + slop, b.y + b.height);
    if (bottom <= top) return null;
    return {
      left: Math.max(r.left - slop, b.x),
      right: Math.min(r.left + r.w + slop, b.x + b.width),
      top,
      bottom,
    };
  }

  /** The window rect as the window system has it (Wayland lies to us otherwise). */
  reportedWindow() {
    if (!this.buddy || this.buddy.isDestroyed()) return Promise.resolve(null);
    if (this.peek.win) return Promise.resolve(this.peek.win);
    if (this.peek.winProbe) return this.peek.winProbe;
    this.peek.winProbe = new Promise((resolve) => {
      let settled = false;
      const finish = (v) => {
        if (settled) return;
        settled = true;
        this.peek.winProbe = null;
        if (v) this.peek.win = v;
        resolve(v);
      };
      const onMove = () => finish(this.buddy.getBounds());
      this.buddy.once("move", onMove);
      const b = this.buddy.getBounds();
      // a 1px nudge is enough to make the window system report the real rect
      this.buddy.setBounds({ x: b.x + 1, y: b.y, width: b.width, height: b.height });
      setTimeout(() => finish(null), 300);
    });
    return this.peek.winProbe;
  }

  async pointerAt() {
    try {
      return screen.getCursorScreenPoint();
    } catch {
      return null;
    }
  }

  /** Slide to wherever he should be right now. */
  movePeek({ force = false } = {}) {
    if (!this.buddy || this.buddy.isDestroyed()) return;
    if (!this.peek.enabled && !force) return;
    clearTimeout(this.peek.moveTimer);
    const y = this.revealY(this.peek.revealed ? PEEK.revealFull : PEEK.reveal);
    const b = this.buddy.getBounds();
    if (b.y === y) return;
    const glide = () => {
      if (!this.buddy || this.buddy.isDestroyed()) return;
      const cur = this.buddy.getBounds();
      const dy = y - cur.y;
      this.peek.settleUntil = Date.now() + PEEK.settleMs;
      if (Math.abs(dy) <= 1) {
        this.buddy.setBounds({ x: cur.x, y, width: cur.w || b.width, height: cur.h || b.height });
        this.peek.win = null; // the reported rect changed; probe again
        this.syncBubble();
        return;
      }
      const step = Math.sign(dy) * Math.max(1, Math.min(Math.abs(dy), Math.round(Math.abs(dy) * 0.34)));
      this.buddy.setBounds({ x: cur.x, y: cur.y + step, width: cur.w || b.width, height: cur.h || b.height });
      this.peek.moveTimer = setTimeout(glide, 16);
    };
    glide();
  }

  /** He's granted an audience (or finished with one). */
  setRevealed(on) {
    if (!this.peek.enabled) return;
    clearTimeout(this.peek.hideTimer);
    const next = !!on;
    if (this.peek.revealed === next) return;
    this.peek.revealed = next;
    this.peek.resting = !next;
    this.peek.settleUntil = Date.now() + PEEK.settleMs;
    this.movePeek();
    this.syncBubble();
    if (!next && this.bubbleWin && !this.bubbleWin.isDestroyed() && !this.bubbleSticky) this.bubbleWin.hide();
  }

  /** Does he need to be in front of you right now? */
  busyPeeking() {
    if (this.mood && this.mood !== "idle" && this.mood !== "sleeping") return true;
    if (this.consent) return true;
    if (this.bubbleWin && !this.bubbleWin.isDestroyed() && this.bubbleWin.isVisible()) return true;
    return false;
  }

  /** Poll the cursor: no dependency on the renderer receiving mouse events for
   *  a window that is mostly above the screen. */
  watch() {
    clearInterval(this.peek.poll);
    this.peek.poll = setInterval(() => this.tick(), PEEK.pollMs);
  }

  stopWatching() {
    clearInterval(this.peek.poll);
    this.peek.poll = null;
    this.peek.win = null;
    this.peek.winProbe = null;
    clearTimeout(this.peek.settleTimer);
  }

  async tick() {
    if (!this.peek.enabled || !this.buddy || this.buddy.isDestroyed() || !this.visible) return;
    const pt = await this.pointerAt();
    if (!pt) return;
    const zone = await this.visibleZone();
    if (!zone) return;
    const on = pt.x >= zone.left && pt.x <= zone.right && pt.y >= zone.top && pt.y <= zone.bottom;
    // Nudge the reported window rect back in line; setBounds is cheap and the
    // compositor forgets an always-on-top window's position otherwise.
    if (!this.peek.settleTimer && Date.now() > (this.peek.settleUntil || 0) && Math.abs(this.buddy.getBounds().y - this.revealY(this.peek.revealed ? PEEK.revealFull : PEEK.reveal)) > 30) {
      this.peek.win = null;
    }
    if (on) {
      clearTimeout(this.peek.hideTimer);
      this.setRevealed(true);
    } else if (this.peek.revealed && !this.busyPeeking()) {
      if (!this.peek.hideTimer) {
        this.peek.hideTimer = setTimeout(() => {
          this.peek.hideTimer = null;
          this.setRevealed(false);
        }, PEEK.graceMs);
      }
    }
  }

  /** The window that raw mouse coordinates are measured against. On Wayland this
   *  is not always the same as our own idea of where the buddy is. */
  async pointerWindow() {
    if (this.peek.enabled) {
      const win = await this.reportedWindow();
      if (win) return win;
    }
    return {
      x: this.buddy.getBounds().x,
      y: this.buddy.getBounds().y,
      w: this.buddy.getBounds().width,
      h: this.buddy.getBounds().height,
    };
  }

  /** The renderer owns the little cosmetic slot; tell it where the centre is. */
  applyCosmetic() {
    if (!this.buddy || this.buddy.isDestroyed()) return;
    const c = this.cfg.get().appearance.cosmetic || {};
    this.buddy.webContents.send("buddy:cosmetic", { cosmetic: c });
  }

  /** Show a cosmetic that hasn't been saved yet (settings live preview). */
  previewCosmetic(cosmetic) {
    if (!this.buddy || this.buddy.isDestroyed()) return;
    this.buddy.webContents.send("buddy:cosmetic", { cosmetic: cosmetic || null });
    // Bring him out so you can actually see what you just picked.
    if (this.peek.enabled) this.setRevealed(true);
    this.touch();
  }

  /** The bean's actual box inside the window (CSS px, unscaled). */
  ballBox(size) {
    const s = size?.s || this.size().s;
    return {
      left: Math.round(BALL_CSS_LEFT * s),
      top: Math.round(BALL_CSS_TOP * s),
      w: Math.round(BALL_CSS_W * s),
      h: Math.round(BALL_CSS_H * s),
      cx: Math.round((BALL_CSS_LEFT + BALL_CSS_W / 2) * s),
      bottom: Math.round((BALL_CSS_TOP + BALL_CSS_H) * s),
    };
  }

  ballBottom(size) {
    return this.ballBox(size).bottom;
  }

  create() {
    if (this.buddy) return this.buddy;
    const size = this.size();
    this.buddy = new BrowserWindow({
      width: size.w,
      height: size.h,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      acceptFirstMouse: true,
      webPreferences: {
        preload: PRELOAD,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
        additionalArguments: ["--window=buddy"],
      },
    });
    this.buddy.setAlwaysOnTop(true, "screen-saver");
    this.buddy.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.applyPosition();
    this.buddy.loadFile(path.join(__dirname, "renderer", "buddy", "index.html"));
    this.buddy.once("ready-to-show", () => {
      this.buddy.showInactive();
      this.pushState();
      this.applyCosmetic();
      this.refreshPeekMode();
      this.normalizePeek();
    });
    this.buddy.on("move", () => this.onMoved());
    this.buddy.on("closed", () => (this.buddy = null));
    // Keep focus where it belongs; the buddy is a click target, not a window.
    this.buddy.on("focus", () => {
      setTimeout(() => {
        if (this.buddy && !this.buddy.isDestroyed()) this.buddy.blur();
      }, 120);
    });
    return this.buddy;
  }

  displayFor(cfgPlacement) {
    const displays = screen.getAllDisplays();
    if (cfgPlacement?.displayId) {
      const d = displays.find((x) => String(x.id) === String(cfgPlacement.displayId));
      if (d) return d;
    }
    return screen.getPrimaryDisplay();
  }

  defaultSpot(display, size) {
    const b = display.bounds;
    const wa = display.workArea;
    const safeTop = display.safeAreaInsets?.top || 0;
    const inset = Math.max(wa.y - b.y, safeTop);
    return {
      x: Math.round(b.x + (b.width - size.w) / 2),
      y: Math.round(b.y + (inset > 4 ? inset : 2)),
    };
  }

  /** Park him properly for the current mode. Safe to call before the window exists. */
  normalizePeek() {
    if (!this.buddy || this.buddy.isDestroyed()) return;
    if (!this.cfg || !this.cfg.get().placement) return;
    this.refreshPeekMode();
    if (!this.peek.enabled) return;
    this.peek.win = null;
    this.peek.pinned = false;
    this.movePeek({ force: true });
    if (!this.peek.poll) this.watch();
  }

  async applyPosition() {
    if (!this.buddy) return;
    const cfg = this.cfg.get();
    const placement = cfg.placement || {};
    const size = this.size();
    if (placement.mode === "custom" && Number.isFinite(placement.x) && Number.isFinite(placement.y)) {
      const display = this.displayFor(placement);
      const b = display.bounds;
      const x = Math.min(Math.max(placement.x, b.x - size.w + 60), b.x + b.width - 60);
      const y = Math.min(Math.max(placement.y, b.y), b.y + b.height - 60);
      this.buddy.setBounds({ x: Math.round(x), y: Math.round(y), width: size.w, height: size.h });
    } else if (placement.mode === "top") {
      const display = this.peekDisplay();
      this.buddy.setBounds({
        x: Math.round(display.bounds.x + (display.bounds.width - size.w) / 2),
        y: this.revealY(PEEK.reveal),
        width: size.w,
        height: size.h,
      });
      this.peek.revealed = false;
      this.peek.resting = true;
      this.peek.win = null;
      this.peek.enabled = true;
      this.stopWatching();
      this.watch();
      this.movePeek({ force: true });
    } else {
      const display = screen.getPrimaryDisplay();
      const spot = this.defaultSpot(display, size);
      this.buddy.setBounds({ x: spot.x, y: spot.y, width: size.w, height: size.h });
      this.refreshPeekMode();
    }
    this.syncBubble();
  }

  onMoved() {
    if (!this.buddy) return;
    // While he's parked at the top his own sliding is not a user drag.
    if (this.peek.enabled && Date.now() < (this.peek.settleUntil || 0) + 60) {
      this.syncBubble();
      return;
    }
    this.syncBubble();
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.savePosition(), 450);
  }

  savePosition() {
    // In peek mode the window's y is ours, not the user's — never persist it.
    if (!this.buddy || !this.cfg || this.peek.enabled) return;
    const bounds = this.buddy.getBounds();
    // "move" also fires for moves that are not the user's: his first placement
    // at boot, and the compositor re-mapping the window on Wayland. Before he
    // has ever been shown those bounds are (0,0), and saving them strands him in
    // the corner — so only trust a window we can actually see.
    if (!this.buddy.isVisible() || bounds.width < 40 || bounds.height < 40) return;
    const display = screen.getDisplayMatching(bounds);
    const size = this.size();
    const spot = this.defaultSpot(display, size);
    const nearDefault =
      Math.abs(bounds.x - spot.x) < 48 && Math.abs(bounds.y - spot.y) < 40;
    if (nearDefault) {
      this.cfg.update({ placement: { mode: "notch", displayId: null, x: null, y: null } });
      this.refreshPeekMode();
    } else {
      this.cfg.update({
        placement: {
          mode: "custom",
          displayId: String(display.id),
          x: bounds.x,
          y: bounds.y,
        },
      });
      this.refreshPeekMode();
    }
  }

  resetPosition() {
    this.cfg.update({ placement: { mode: "notch", displayId: null, x: null, y: null } });
    this.refreshPeekMode();
    this.applyPosition();
    this.movePeek({ force: true });
  }

  /** Tuck him up against the top edge, centred, in peek mode. */
  dockToTop() {
    const p = this.cfg.get().placement || {};
    // Suppress the reveal-on-bubble for our own confirmation, or he slides
    // straight back out and nothing is parked.
    this.peek.suppressReveal = true;
    this.cfg.update({
      placement: { mode: "top", displayId: p.displayId || null, x: null, y: null },
    });
    this.peek.enabled = true;
    this.peek.revealed = false;
    this.peek.resting = true;
    this.peek.win = null;
    this.stopWatching();
    this.watch();
    this.applyPosition();
    this.movePeek({ force: true });
    this.bubble("peeking from up here now.");
    this.peek.suppressReveal = false;
  }

  /** Let him sit wherever he is, normally. */
  undock() {
    if (!this.peek.enabled) return;
    const b = this.buddy.getBounds();
    // Same trap as savePosition: undocking a window that was never placed would
    // persist (0,0). Send him home instead of stranding him in the corner.
    if (!this.buddy.isVisible() || b.width < 40 || b.height < 40) {
      this.cfg.update({ placement: { mode: "notch", displayId: null, x: null, y: null } });
      this.peek.revealed = false;
      this.peek.enabled = false;
      this.stopWatching();
      this.applyPosition();
      return;
    }
    this.cfg.update({ placement: { mode: "custom", displayId: null, x: b.x, y: b.y } });
    this.peek.revealed = true;
    this.peek.enabled = false;
    this.stopWatching();
    this.syncBubble();
  }

  /* ---------------- bubble ---------------- */

  ensureBubble() {
    if (this.bubbleWin && !this.bubbleWin.isDestroyed()) return this.bubbleWin;
    this.bubbleWin = new BrowserWindow({
      width: 340,
      height: 128,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: PRELOAD,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        additionalArguments: ["--window=bubble"],
      },
    });
    this.bubbleWin.setAlwaysOnTop(true, "screen-saver");
    this.bubbleWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.bubbleWin.setIgnoreMouseEvents(true);
    this.bubbleWin.loadFile(path.join(__dirname, "renderer", "bubble", "index.html"));
    this.bubbleWin.on("closed", () => (this.bubbleWin = null));
    return this.bubbleWin;
  }

  syncBubble() {
    if (!this.bubbleWin || !this.buddy || this.bubbleWin.isDestroyed()) return;
    const bb = this.buddy.getBounds();
    const size = this.size();
    const ball = this.ballBox(size);
    const display = screen.getDisplayMatching(bb);
    const b = display.workArea;
    const B = BUBBLE;
    const w = B.w * B.scale, h = B.h * B.scale;
    // aim the tail at the middle of the bean, not the middle of the window
    const tipOffset = Math.round((ball.cx - bb.x) * B.scale);
    let x = Math.round(bb.x + ball.cx - w / 2);
    let y = Math.round(bb.y + ball.bottom + B.gapBelow * B.scale);
    let above = false;
    if (y + h > b.y + b.height - 8) {
      y = Math.round(bb.y + ball.top - h - B.gapAbove * B.scale);
      above = true;
    }
    x = Math.min(Math.max(x, b.x + 6), b.x + b.width - w - 6);
    this.bubbleWin.setBounds({ x, y, width: Math.round(w), height: Math.round(h) });
    const tip = Math.min(Math.max(tipOffset, 18), Math.round(w) - 18);
    this.bubbleWin.webContents.send("bubble:placement", {
      above,
      tip,
      width: Math.round(w),
      scale: B.scale,
    });
  }

  bubble(text, { sticky = false, typing = false } = {}) {
    if (!this.visible) return;
    this.touch();
    const win = this.ensureBubble();
    clearTimeout(this.bubbleTimer);
    this.bubbleSticky = sticky;
    // Never let a bubble hang in mid-air: if he's tucked up at the top edge,
    // slide him out so the tail has something to point at.
    if (this.peek.enabled && !this.peek.suppressReveal) this.setRevealed(true);
    const send = () => {
      if (win.isDestroyed()) return;
      win.webContents.send("bubble:show", { text, typing, name: this.cfg.get().appearance.name });
      win.showInactive();
      this.syncBubble();
    };
    if (win.webContents.isLoading()) win.webContents.once("did-finish-load", send);
    else send();
    if (!sticky) {
      this.bubbleTimer = setTimeout(() => this.hideBubble(), Math.max(3500, Math.min(11000, text.length * 90)));
    }
  }

  hideBubble() {
    clearTimeout(this.bubbleTimer);
    this.bubbleSticky = false;
    if (this.bubbleWin && !this.bubbleWin.isDestroyed()) this.bubbleWin.hide();
  }

  /* ---------------- state ---------------- */

  pushState(mood) {
    if (!this.buddy || this.buddy.isDestroyed()) return;
    const a = this.cfg.get().appearance;
    this.buddy.webContents.send("buddy:state", {
      mood: mood || this.mood || "idle",
      name: a.name,
      color: a.color,
      scale: a.scale,
      cosmetic: a.cosmetic,
      sounds: a.sounds,
    });
    this.mood = mood || this.mood || "idle";
  }

  setMood(mood) {
    this.mood = mood;
    if (mood !== "sleeping") this.touch();
    this.pushState(mood);
    // thinking / talking / happy / error all want to be seen, even from the top edge
    if (this.peek.enabled && mood && mood !== "idle" && mood !== "sleeping") {
      this.setRevealed(true);
    }
  }

  /* ---------------- naps ---------------- */

  // Any interaction pushes the nap clock back; after a long silence he dozes off.
  touch() {
    clearTimeout(this.idleTimer);
    if (!this.visible) return;
    this.idleTimer = setTimeout(() => {
      if (this.mood === "idle" && !this.consent) this.setMood("sleeping");
    }, this.napAfterMs || NAP_AFTER_MS);
  }

  wake() {
    const asleep = this.mood === "sleeping";
    if (asleep) this.setMood("idle");
    this.touch();
    return asleep;
  }

  applyAppearance() {
    if (!this.buddy || this.buddy.isDestroyed()) return;
    const size = this.size();
    const cur = this.buddy.getBounds();
    const cfg = this.cfg.get();
    if (cfg.placement?.mode === "custom") {
      this.buddy.setBounds({ ...cur, width: size.w, height: size.h });
    } else if (cfg.placement?.mode === "top") {
      const display = this.peekDisplay();
      this.buddy.setBounds({
        x: Math.round(display.bounds.x + (display.bounds.width - size.w) / 2),
        y: this.revealY(this.peek.revealed ? PEEK.revealFull : PEEK.reveal),
        width: size.w,
        height: size.h,
      });
    } else {
      this.buddy.setBounds({
        x: cur.x - Math.round((size.w - cur.width) / 2),
        y: cur.y,
        width: size.w,
        height: size.h,
      });
    }
    this.peek.win = null;
    this.pushState();
    this.applyCosmetic();
    this.syncBubble();
  }

  quip() {
    return QUIPS[Math.floor(Math.random() * QUIPS.length)];
  }

  /* ---------------- consent card ---------------- */

  showConsent(req, onAnswer) {
    this.consent = { req, onAnswer };
    if (!this.consentWin || this.consentWin.isDestroyed()) {
      this.consentWin = new BrowserWindow({
        width: 430,
        height: 236,
        frame: false,
        transparent: true,
        backgroundColor: "#00000000",
        resizable: false,
        minimizable: false,
        maximizable: false,
        skipTaskbar: true,
        hasShadow: false,
        show: false,
        alwaysOnTop: true,
        webPreferences: {
          preload: PRELOAD,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
          additionalArguments: ["--window=consent"],
        },
      });
      this.consentWin.setAlwaysOnTop(true, "screen-saver");
      this.consentWin.loadFile(path.join(__dirname, "renderer", "consent", "index.html"));
      this.consentWin.on("closed", () => (this.consentWin = null));
    }
    const place = () => {
      const w = 430, h = 236;
      let x, y;
      if (this.buddy && !this.buddy.isDestroyed()) {
        const bb = this.buddy.getBounds();
        const ball = this.ballBox();
        const display = screen.getDisplayMatching(bb);
        const wa = display.workArea;
        x = Math.round(bb.x + ball.cx - w / 2);
        y = Math.round(bb.y + ball.bottom + 24);
        if (y + h > wa.y + wa.height - 10) y = Math.round(bb.y + ball.top - h - 10);
        x = Math.min(Math.max(x, wa.x + 8), wa.x + wa.width - w - 8);
        y = Math.max(y, wa.y + 8);
      } else {
        const wa = screen.getPrimaryDisplay().workArea;
        x = Math.round(wa.x + wa.width / 2 - w / 2);
        y = Math.round(wa.y + wa.height / 2 - h / 2);
      }
      this.consentWin.setBounds({ x, y, width: w, height: h });
    };
    const show = () => {
      if (!this.consent || !this.consentWin || this.consentWin.isDestroyed()) return;
      place();
      this.consentWin.webContents.send("consent:request", this.consent.req);
      this.consentWin.show();
      this.consentWin.focus();
    };
    const wc = this.consentWin.webContents;
    if (wc.isLoading()) wc.once("did-finish-load", show);
    else if (!wc.getURL()) wc.once("did-finish-load", show);
    else show();
    // The renderer also pulls the pending request on boot, so this is belt and braces.
    setTimeout(show, 400);
    this.bubble(`need your ok: ${req.summary}`, { sticky: true });
  }

  hideConsent() {
    this.consent = null;
    if (this.consentWin && !this.consentWin.isDestroyed()) this.consentWin.hide();
  }

  answerConsent(decision) {
    if (!this.consent) return;
    const { req, onAnswer } = this.consent;
    this.consent = null;
    onAnswer(req, decision);
    if (this.consentWin && !this.consentWin.isDestroyed()) this.consentWin.hide();
  }

  /* ---------------- visibility ---------------- */

  toggleVisible(force) {
    this.visible = typeof force === "boolean" ? force : !this.visible;
    if (this.buddy && !this.buddy.isDestroyed()) {
      if (this.visible) {
        this.buddy.showInactive();
        this.peek.win = null;
        this.normalizePeek();
      } else {
        this.buddy.hide();
      }
    }
    if (!this.visible) {
      clearTimeout(this.idleTimer);
      this.hideBubble();
    } else {
      this.touch();
    }
    return this.visible;
  }
}

module.exports = { Overlay, PEEK };
