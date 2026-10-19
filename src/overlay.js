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
const BALL_TOP = 26;
const BALL_SIZE = 110;

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

class Overlay {
  constructor({ onContextMenu } = {}) {
    this.cfg = null;
    this.onContextMenu = onContextMenu || (() => {});
    this.buddy = null;
    this.bubbleWin = null;
    this.consentWin = null;
    this.consent = null;
    this.bubbleTimer = null;
    this.saveTimer = null;
    this.visible = true;
  }

  attach(config) {
    this.cfg = config;
  }

  size() {
    const s = this.cfg?.get().appearance.scale || 1;
    return { w: Math.round(BASE_W * s), h: Math.round(BASE_H * s), s };
  }

  ballBottom(size) {
    const s = size?.s || this.size().s;
    return Math.round((BALL_TOP + BALL_SIZE) * s);
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

  applyPosition() {
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
    } else {
      const display = screen.getPrimaryDisplay();
      const spot = this.defaultSpot(display, size);
      this.buddy.setBounds({ x: spot.x, y: spot.y, width: size.w, height: size.h });
    }
    this.syncBubble();
  }

  onMoved() {
    if (!this.buddy) return;
    this.syncBubble();
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.savePosition(), 450);
  }

  savePosition() {
    if (!this.buddy || !this.cfg) return;
    const bounds = this.buddy.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const size = this.size();
    const spot = this.defaultSpot(display, size);
    const nearDefault =
      Math.abs(bounds.x - spot.x) < 48 && Math.abs(bounds.y - spot.y) < 40;
    if (nearDefault) {
      this.cfg.update({ placement: { mode: "notch", displayId: null, x: null, y: null } });
    } else {
      this.cfg.update({
        placement: {
          mode: "custom",
          displayId: String(display.id),
          x: bounds.x,
          y: bounds.y,
        },
      });
    }
  }

  resetPosition() {
    this.cfg.update({ placement: { mode: "notch", displayId: null, x: null, y: null } });
    this.applyPosition();
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
    const display = screen.getDisplayMatching(bb);
    const b = display.workArea;
    const w = 340, h = 128;
    let x = Math.round(bb.x + bb.width / 2 - w / 2);
    let y = Math.round(bb.y + this.ballBottom(size) + 2);
    let above = false;
    if (y + h > b.y + b.height - 8) {
      y = Math.round(bb.y - h + 18);
      above = true;
    }
    x = Math.min(Math.max(x, b.x + 6), b.x + b.width - w - 6);
    this.bubbleWin.setBounds({ x, y, width: w, height: h });
    this.bubbleWin.webContents.send("bubble:placement", { above });
  }

  bubble(text, { sticky = false, typing = false } = {}) {
    if (!this.visible) return;
    const win = this.ensureBubble();
    clearTimeout(this.bubbleTimer);
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
      sounds: a.sounds,
    });
    this.mood = mood || this.mood || "idle";
  }

  setMood(mood) {
    this.mood = mood;
    this.pushState(mood);
  }

  applyAppearance() {
    if (!this.buddy || this.buddy.isDestroyed()) return;
    const size = this.size();
    const cur = this.buddy.getBounds();
    const cfg = this.cfg.get();
    if (cfg.placement?.mode === "custom") {
      this.buddy.setBounds({ ...cur, width: size.w, height: size.h });
    } else {
      this.buddy.setBounds({
        x: cur.x - Math.round((size.w - cur.width) / 2),
        y: cur.y,
        width: size.w,
        height: size.h,
      });
    }
    this.pushState();
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
        const display = screen.getDisplayMatching(bb);
        const wa = display.workArea;
        x = Math.round(bb.x + bb.width / 2 - w / 2);
        y = Math.round(bb.y + this.ballBottom() + 24);
        if (y + h > wa.y + wa.height - 10) y = Math.round(bb.y - h - 10);
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
      if (this.visible) this.buddy.showInactive();
      else this.buddy.hide();
    }
    if (!this.visible) this.hideBubble();
    return this.visible;
  }
}

module.exports = { Overlay };
