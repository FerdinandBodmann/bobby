"use strict";
const path = require("path");
const {
  app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, screen, nativeImage, dialog,
  Notification,
} = require("electron");
const cfgmod = require("./config");
const permissions = require("./permissions");
const reminders = require("./reminders");
const { Agent } = require("./agent");
const { Overlay, PEEK } = require("./overlay");

app.commandLine.appendSwitch("enable-transparent-visuals");
app.commandLine.appendSwitch("ozone-platform-hint", "auto");

const ASSETS = path.join(__dirname, "..", "assets");
const PRELOAD = path.join(__dirname, "preload.js");
const GLOBAL_TOGGLE_BUDDY = "CommandOrControl+Alt+B";
const GLOBAL_KILL_SWITCH = "CommandOrControl+Alt+K";
const GLOBAL_OPEN_CHAT = "CommandOrControl+Alt+Space";

let chatWin = null;
let settingsWin = null;
let tray = null;
let overlay = null;
let agent = null;
let idleTimer = null;
let bubbleThrottle = null;
let lastBubbleAt = 0;
const pendingConsent = new Map();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => openChat());
}

/* ---------------- boot ---------------- */

app.whenReady().then(() => {
  cfgmod.init();
  overlay = new Overlay();
  overlay.attach(cfgmod);
  overlay.create();

  agent = new Agent(permissions.createAsker(sendConsentRequest));
  agent.on("event", onAgentEvent);

  createTray();
  registerShortcuts();
  wireIpc();
  applyAutostart(cfgmod.get().autostart);
  reminders.init(fireReminder);

  if (cfgmod.get().firstRun) {
    cfgmod.update({ firstRun: false });
    openSettings();
  } else if (!cfgmod.isConfigured()) {
    openSettings();
  }

  screen.on("display-added", () => overlay.applyPosition());
  screen.on("display-removed", () => overlay.applyPosition());
  screen.on("display-metrics-changed", () => overlay.applyPosition());
});

app.on("window-all-closed", () => {
  // It's a tray buddy. It stays.
});

app.on("activate", () => openChat());

app.on("before-quit", () => {
  globalShortcut.unregisterAll();
});

/* ---------------- windows ---------------- */

function watchWindow(w, name) {
  w.on("closed", () => console.log(`[win] ${name} closed`));
  w.webContents.on("render-process-gone", (_e, details) =>
    console.error(`[win] ${name} renderer gone:`, JSON.stringify(details))
  );
  w.on("unresponsive", () => console.warn(`[win] ${name} unresponsive`));
}

if (process.env.BOBBY_DEBUG) {
  setInterval(() => {
    const list = BrowserWindow.getAllWindows().map((w) => `${w.id}:${w.getTitle() || "?"}:${w.isDestroyed() ? "dead" : "alive"}`);
    console.log("[win] open:", list.join(" | "));
  }, 3000);
}

function openChat() {
  if (!chatWin || chatWin.isDestroyed()) createChatWindow();
  if (!chatWin.isVisible()) chatWin.show();
  chatWin.focus();
  pushStatus();
}

function createChatWindow() {
  const cfg = cfgmod.get();
  const bounds = cfg.chatBounds || defaultChatBounds();
  chatWin = new BrowserWindow({
    ...bounds,
    minWidth: 380,
    minHeight: 420,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    show: false,
    skipTaskbar: false,
    title: "Bobby",
    icon: path.join(ASSETS, "icon-256.png"),
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: ["--window=chat"],
    },
  });
  chatWin.loadFile(path.join(__dirname, "renderer", "chat", "index.html"));
  watchWindow(chatWin, "chat");
  chatWin.once("ready-to-show", () => {
    chatWin.show();
    pushStatus();
  });
  chatWin.on("moved", saveChatBounds);
  chatWin.on("resized", saveChatBounds);
  chatWin.on("closed", () => (chatWin = null));
}

function defaultChatBounds() {
  const wa = screen.getPrimaryDisplay().workArea;
  const w = 440, h = 640;
  return {
    width: w,
    height: h,
    x: Math.round(wa.x + wa.width - w - 24),
    y: Math.round(wa.y + 28),
  };
}

let chatSaveTimer = null;
function saveChatBounds() {
  if (!chatWin || chatWin.isDestroyed()) return;
  clearTimeout(chatSaveTimer);
  chatSaveTimer = setTimeout(() => {
    if (!chatWin || chatWin.isDestroyed()) return;
    cfgmod.update({ chatBounds: chatWin.getBounds() });
  }, 400);
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 660,
    height: 760,
    minWidth: 560,
    minHeight: 520,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    show: false,
    title: "Bobby settings",
    icon: path.join(ASSETS, "icon-256.png"),
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: ["--window=settings"],
    },
  });
  settingsWin.loadFile(path.join(__dirname, "renderer", "settings", "index.html"));
  watchWindow(settingsWin, "settings");
  settingsWin.once("ready-to-show", () => settingsWin.show());
  settingsWin.on("closed", () => (settingsWin = null));
}

/* ---------------- tray + shortcuts ---------------- */

function createTray() {
  const icon = nativeImage.createFromPath(path.join(ASSETS, "icon-32.png"));
  try {
    tray = new Tray(icon.resize({ width: 22, height: 22 }));
  } catch {
    tray = new Tray(icon);
  }
  tray.setToolTip("Bobby");
  refreshTrayMenu();
  tray.on("click", () => openChat());
}

function refreshTrayMenu() {
  if (!tray) return;
  const cfg = cfgmod.get();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open chat", click: () => openChat() },
    { label: "Settings…", click: () => openSettings() },
    { type: "separator" },
    {
      label: "Tools enabled",
      type: "checkbox",
      checked: cfg.toolsEnabled,
      click: () => toggleTools(),
    },
    {
      label: "Show buddy",
      type: "checkbox",
      checked: overlay.visible,
      click: () => overlay.toggleVisible(),
    },
    { label: "Reset buddy position", click: () => overlay.resetPosition() },
    { type: "separator" },
    { label: "Quit Bobby", click: () => app.quit() },
  ]));
}

function registerShortcuts() {
  try {
    globalShortcut.register(GLOBAL_TOGGLE_BUDDY, () => {
      const vis = overlay.toggleVisible();
      refreshTrayMenu();
      if (vis) overlay.bubble("i'm back!", {});
    });
    globalShortcut.register(GLOBAL_KILL_SWITCH, () => toggleTools());
    globalShortcut.register(GLOBAL_OPEN_CHAT, () => openChat());
  } catch (e) {
    console.warn("shortcut registration failed", e.message);
  }
}

function toggleTools() {
  const next = !cfgmod.get().toolsEnabled;
  cfgmod.update({ toolsEnabled: next });
  refreshTrayMenu();
  pushStatus();
  overlay.bubble(next ? "tools are back on." : "hands off! tools disabled.", {});
  overlay.setMood(next ? "happy" : "sleeping");
  setTimeout(() => overlay.setMood("idle"), 2600);
  return next;
}

function applyAutostart(enabled) {
  try {
    app.setLoginItemSettings({ openAtLogin: !!enabled, openAsHidden: true });
  } catch (e) {
    console.warn("autostart not supported:", e.message);
  }
}

/* ---------------- agent events ---------------- */

function chatSend(channel, data) {
  if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send(channel, data);
}

function stripMd(s) {
  return String(s)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scheduleIdle(ms) {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!agent?.busy) overlay.setMood("idle");
  }, ms);
}

function fireReminder(r) {
  const name = cfgmod.get().appearance.name || "Bobby";
  const text = `⏰ ${r.text}`;
  overlay.bubble(text, { sticky: true });
  if (!agent?.busy) {
    overlay.setMood("happy");
    setTimeout(() => {
      if (!agent?.busy && overlay.mood === "happy") overlay.setMood("idle");
    }, 3000);
  }
  // let it linger longer than a normal line, then clear it
  setTimeout(() => {
    if (overlay.mood !== "thinking" && overlay.mood !== "talking") overlay.hideBubble();
  }, 20000);
  try {
    if (Notification.isSupported()) new Notification({ title: name, body: r.text }).show();
  } catch (err) {
    console.warn("[reminders] notification failed:", err.message);
  }
}

function onAgentEvent(e) {
  switch (e.type) {
    case "user":
      chatSend("chat:event", e);
      break;
    case "thinking":
      overlay.setMood("thinking");
      overlay.bubble("thinking…", { sticky: true, typing: true });
      chatSend("chat:event", e);
      break;
    case "assistant-start":
      overlay.setMood("talking");
      chatSend("chat:event", e);
      break;
    case "delta": {
      chatSend("chat:event", e);
      const now = Date.now();
      if (now - lastBubbleAt > 110) {
        lastBubbleAt = now;
        clearTimeout(bubbleThrottle);
        bubbleThrottle = setTimeout(() => {
          const entry = agent.view().find((m) => m.id === e.id);
          if (entry) overlay.bubble(stripMd(entry.text).slice(-150), { sticky: true });
        }, 60);
      }
      break;
    }
    case "tool":
      overlay.setMood("thinking");
      overlay.bubble(`using ${e.tool.name}…`, { sticky: true, typing: true });
      chatSend("chat:event", e);
      break;
    case "tool-done":
      chatSend("chat:event", e);
      overlay.setMood(e.tool.status === "error" ? "error" : "thinking");
      break;
    case "done":
      overlay.setMood("happy");
      overlay.bubble(stripMd(e.text) || "done!", {});
      scheduleIdle(4200);
      chatSend("chat:event", e);
      pushStatus();
      break;
    case "error":
      overlay.setMood("error");
      overlay.bubble(e.error, {});
      scheduleIdle(6500);
      chatSend("chat:event", e);
      break;
    case "stopped":
      overlay.setMood("idle");
      overlay.bubble("ok, stopped.");
      chatSend("chat:event", e);
      break;
    case "idle":
      chatSend("chat:event", e);
      break;
    case "cleared":
      chatSend("chat:event", e);
      break;
  }
}

/* ---------------- consent ---------------- */

const consentTimers = new Map();

function sendConsentRequest(req) {
  pendingConsent.set(req.id, req);
  chatSend("chat:consent", req);
  overlay.showConsent(req, (request, decision) => answerConsent(request.id, decision));
  const timer = setTimeout(() => {
    consentTimers.delete(req.id);
    if (!pendingConsent.has(req.id)) return;
    pendingConsent.delete(req.id);
    chatSend("chat:consent-closed", { id: req.id });
    overlay.hideConsent();
    permissions.answer(req.id, "deny");
    overlay.bubble("no answer, so i didn't do it.", {});
  }, 90_000);
  consentTimers.set(req.id, timer);
}

function answerConsent(id, decision) {
  const req = pendingConsent.get(id);
  if (!req) return false;
  clearTimeout(consentTimers.get(id));
  consentTimers.delete(id);
  pendingConsent.delete(id);
  if (decision === "always" && req.allow) {
    const cfg = cfgmod.get();
    const { kind, value } = req.allow;
    if (kind === "dir") {
      if (!cfg.approvedDirs.includes(value)) cfgmod.update({ approvedDirs: [...cfg.approvedDirs, value] });
    } else if (kind === "cmd") {
      if (!cfg.allowCommands.includes(value)) cfgmod.update({ allowCommands: [...cfg.allowCommands, value] });
    } else if (kind === "tool") {
      if (!cfg.alwaysAllowTools.includes(value)) cfgmod.update({ alwaysAllowTools: [...cfg.alwaysAllowTools, value] });
    }
    pushStatus();
  }
  permissions.answer(id, decision);
  chatSend("chat:consent-closed", { id });
  overlay.hideConsent();
  if (decision === "deny") overlay.bubble("okay, i won't.", {});
  return true;
}

/* ---------------- ipc ---------------- */

function publicSettings() {
  const cfg = cfgmod.get();
  return {
    ...cfg,
    apiKeyEnc: undefined,
    hasKey: !!cfgmod.getApiKey(),
    keyBackend: cfgmod.keyBackend(),
    providers: Object.fromEntries(
      Object.entries(cfgmod.PROVIDERS).map(([k, v]) => [
        k,
        {
          label: v.label,
          baseUrl: v.baseUrl,
          model: v.model,
          needsKey: v.needsKey,
          local: !!v.local,
          hint: v.hint || "",
        },
      ])
    ),
    effective: cfgmod.providerSettings(),
    configured: cfgmod.isConfigured(),
    platform: process.platform,
    userData: cfgmod.dir(),
  };
}

function pushStatus() {
  const cfg = cfgmod.get();
  const p = cfgmod.providerSettings();
  const status = {
    toolsEnabled: cfg.toolsEnabled,
    webEnabled: cfg.webEnabled,
    configured: cfgmod.isConfigured(),
    provider: cfg.provider,
    model: p.model,
    buddyName: cfg.appearance.name,
    color: cfg.appearance.color,
    autonomy: cfg.autonomy,
    hasKey: !!cfgmod.getApiKey(),
  };
  chatSend("app:status", status);
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send("app:status", status);
}

function wireIpc() {
  ipcMain.handle("app:info", () => ({
    configured: cfgmod.isConfigured(),
    firstRun: false,
    keyBackend: cfgmod.keyBackend(),
    platform: process.platform,
    userData: cfgmod.dir(),
    home: require("os").homedir(),
  }));

  ipcMain.handle("app:openChat", () => openChat());
  ipcMain.handle("app:openSettings", () => openSettings());
  ipcMain.handle("app:quit", () => app.quit());
  ipcMain.handle("app:status", () => {
    const cfg = cfgmod.get();
    return {
      toolsEnabled: cfg.toolsEnabled,
      webEnabled: cfg.webEnabled,
      configured: cfgmod.isConfigured(),
      model: cfgmod.providerSettings().model,
      buddyName: cfg.appearance.name,
      color: cfg.appearance.color,
      autonomy: cfg.autonomy,
      hasKey: !!cfgmod.getApiKey(),
    };
  });
  ipcMain.handle("app:toggleTools", () => toggleTools());
  ipcMain.handle("app:toggleBuddy", () => {
    const vis = overlay.toggleVisible();
    refreshTrayMenu();
    return vis;
  });

  ipcMain.handle("chat:send", (_e, { text }) => {
    agent.send(text);
    return { ok: true };
  });
  ipcMain.handle("chat:stop", () => {
    agent.stop();
    return { ok: true };
  });
  ipcMain.handle("chat:clear", () => {
    agent.clear();
    return { ok: true };
  });
  ipcMain.handle("chat:history", () => agent.view());

  ipcMain.handle("buddy:poke", () => {
    const q = overlay.quip();
    overlay.bubble(q, {});
    overlay.setMood("happy");
    setTimeout(() => {
      if (!agent?.busy) overlay.setMood("idle");
    }, 1600);
    return q;
  });
  ipcMain.handle("buddy:wake", () => {
    overlay.wake();
    return overlay.mood;
  });
  ipcMain.handle("buddy:moveBy", (_e, { dx, dy } = {}) => {
    const win = overlay.buddy;
    if (!win || win.isDestroyed()) return false;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
    // Dragging him off the top edge is how you un-park him.
    if (overlay.peek.enabled && dy > 0 && !overlay.peek.dragging) overlay.undock();
    const [x, y] = win.getPosition();
    win.setPosition(Math.round(x + dx), Math.round(y + dy));
    return true;
  });
  ipcMain.handle("buddy:peek", (_e, { on } = {}) => {
    overlay.setRevealed(!!on);
    return { revealed: overlay.peek.revealed, enabled: overlay.peek.enabled };
  });
  ipcMain.handle("buddy:dockTop", () => {
    overlay.dockToTop();
    return { ok: true, mode: (cfgmod.get().placement||{}).mode };
  });
  ipcMain.handle("buddy:peekState", () => ({
    enabled: overlay.peek.enabled,
    revealed: overlay.peek.revealed,
    y: overlay.buddy ? overlay.buddy.getBounds().y : null,
    target: overlay.peek.enabled
      ? overlay.revealY(overlay.peek.revealed ? PEEK.revealFull : PEEK.reveal)
      : null,
    visible: overlay.visible,
  }));
  ipcMain.handle("buddy:dragState", (_e, { dragging } = {}) => {
    const was = overlay.peek.dragging;
    overlay.peek.dragging = !!dragging;
    if (was && !overlay.peek.dragging) overlay.onMoved();
    return overlay.peek.dragging;
  });
  ipcMain.handle("buddy:contextMenu", () => {
    const cfg = cfgmod.get();
    Menu.buildFromTemplate([
      { label: "Open chat", click: () => openChat() },
      { label: "Settings…", click: () => openSettings() },
      { type: "separator" },
      { label: "Tools enabled", type: "checkbox", checked: cfg.toolsEnabled, click: () => toggleTools() },
      { label: "Show buddy", type: "checkbox", checked: overlay.visible, click: () => overlay.toggleVisible() },
      {
        label: "Hide at the top of the screen",
        type: "checkbox",
        checked: cfg.placement?.mode === "top",
        click: () => (cfg.placement?.mode === "top" ? overlay.undock() : overlay.dockToTop()),
      },
      { label: "Reset position", click: () => overlay.resetPosition() },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]).popup({ window: overlay.buddy });
    return { ok: true };
  });

  ipcMain.handle("consent:answer", (_e, { id, decision }) => answerConsent(id, decision));
  ipcMain.handle("consent:pending", () => (overlay.consent && overlay.consent.req) || null);

  ipcMain.handle("settings:get", () => publicSettings());

  ipcMain.handle("settings:save", (_e, patch) => {
    const clean = { ...patch };
    if ("apiKey" in clean) {
      const key = clean.apiKey;
      delete clean.apiKey;
      cfgmod.setApiKey(key || "");
    }
    if (clean.placement?.reset) {
      clean.placement = { mode: "notch", displayId: null, x: null, y: null };
    }
    if (clean.provider && !cfgmod.PROVIDERS[clean.provider]) {
      throw new Error("unknown provider");
    }
    cfgmod.update(clean);
    if ("appearance" in clean) overlay.applyAppearance();
    if ("placement" in clean) {
      overlay.refreshPeekMode();
      overlay.applyPosition();
      overlay.normalizePeek();
    }
    if ("toolsEnabled" in clean || "webEnabled" in clean) pushStatus();
    if ("autostart" in clean) applyAutostart(clean.autostart);
    pushStatus();
    refreshTrayMenu();
    return publicSettings();
  });

  ipcMain.handle("settings:test", async (_e, { apiKey, useSaved, provider, baseUrl, model }) => {
    const cfg = cfgmod.get();
    const def = cfgmod.PROVIDERS[provider] || cfgmod.PROVIDERS.custom;
    const settings = {
      kind: def.kind,
      baseUrl: (baseUrl || def.baseUrl).replace(/\/+$/, ""),
      model: model || def.model,
      apiKey: apiKey || (useSaved ? cfgmod.getApiKey() : ""),
    };
    const llm = require("./llm");
    return llm.testConnection(settings);
  });

  ipcMain.handle("settings:models", async (_e, { baseUrl, provider }) => {
    const def = cfgmod.PROVIDERS[provider] || cfgmod.PROVIDERS.custom;
    const base = (baseUrl || def.baseUrl || "").replace(/\/+$/, "");
    if (!base) return [];
    const key = cfgmod.getApiKey();
    const timeout = AbortSignal.timeout(9000);
    try {
      if (def.kind === "anthropic") {
        const res = await fetch(`${base}/v1/models`, {
          headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
          signal: timeout,
        });
        if (!res.ok) return [];
        const j = await res.json();
        return (j.data || []).map((m) => m.id).filter(Boolean).slice(0, 300);
      }
      if (base.includes("11434")) {
        const res = await fetch(`${base.replace(/\/v1$/, "")}/api/tags`, { signal: timeout });
        if (!res.ok) return [];
        const j = await res.json();
        return (j.models || []).map((m) => m.name).filter(Boolean);
      }
      const res = await fetch(`${base}/models`, {
        headers: key ? { Authorization: `Bearer ${key}` } : {},
        signal: timeout,
      });
      if (!res.ok) return [];
      const j = await res.json();
      return (j.data || []).map((m) => m.id || m.name).filter(Boolean).slice(0, 300);
    } catch {
      return [];
    }
  });

  ipcMain.handle("audit:get", () => cfgmod.readAudit(150));  ipcMain.handle("audit:path", () => cfgmod.file("audit.log"));
  ipcMain.handle("settings:openAudit", () => {
    require("electron").shell.showItemInFolder(cfgmod.file("audit.log"));
    return true;
  });
  ipcMain.handle("settings:openDataDir", () => {
    require("electron").shell.openPath(cfgmod.dir());
    return true;
  });
  ipcMain.handle("settings:resetPosition", () => {
    overlay.resetPosition();
    return true;
  });
  ipcMain.handle("settings:pickFolder", async () => {
    const res = await dialog.showOpenDialog(settingsWin, {
      properties: ["openDirectory", "createDirectory"],
      title: "Let Bobby work in this folder",
    });
    return res.canceled ? null : res.filePaths[0] || null;
  });

  if (process.env.BOBBY_DEBUG) {
    ipcMain.handle("dev:runTool", (_e, { name, args }) =>
      permissions.execute(name, args || {}, permissions.createAsker(sendConsentRequest))
    );
    ipcMain.handle("dev:setTools", (_e, v) => {
      cfgmod.update({ toolsEnabled: !!v });
      pushStatus();
      refreshTrayMenu();
      return cfgmod.get().toolsEnabled;
    });
    ipcMain.handle("dev:info", () => ({
      userData: cfgmod.dir(),
      config: cfgmod.file("config.json"),
      notes: cfgmod.notesPath(),
      buddyBounds:
        overlay.buddy && !overlay.buddy.isDestroyed() ? overlay.buddy.getBounds() : null,
      consentVisible: !!(
        overlay.consentWin &&
        !overlay.consentWin.isDestroyed() &&
        overlay.consentWin.isVisible()
      ),
    }));
    // Screenshot the buddy (or bubble/chat) for design review. `mood`, `scale`
    // and `cosmetic` temporarily override appearance so one run can capture a
    // whole contact sheet.
    ipcMain.handle("dev:shot", async (_e, { path: out, target = "buddy", size = 2, mood, scale, cosmetic } = {}) => {
      if (!out) throw new Error("dev:shot needs a path");
      const fs = require("fs");
      const os = require("os");
      const dir = path.dirname(out);
      fs.mkdirSync(dir, { recursive: true });

      const applied = [];
      let restoreAppearance = null;
      if (target === "buddy" && (scale != null || cosmetic != null)) {
        const cur = cfgmod.get().appearance;
        restoreAppearance = structuredClone(cur);
        const next = { ...cur };
        if (scale != null) next.scale = scale;
        if (cosmetic != null) next.cosmetic = cosmetic;
        cfgmod.update({ appearance: next });
        overlay.applyAppearance();
        applied.push("appearance");
      }
      if (target === "buddy" && mood) {
        overlay.setMood(mood);
        applied.push("mood");
      }
      await new Promise((r) => setTimeout(r, 420));

      const win =
        target === "bubble"
          ? overlay.bubbleWin
          : target === "consent"
            ? overlay.consentWin
            : target === "chat"
              ? chatWin
              : overlay.buddy;
      if (!win || win.isDestroyed()) throw new Error(`no ${target} window`);
      if (!win.isVisible()) win.showInactive();
      await new Promise((r) => setTimeout(r, 260));

      const wc = win.webContents;
      if (size && size !== 1) wc.setZoomFactor(size);
      await new Promise((r) => setTimeout(r, 120));
      const img = await wc.capturePage();
      if (size && size !== 1) wc.setZoomFactor(1);
      const png = img.toPNG();
      fs.writeFileSync(out, png);

      if (restoreAppearance) {
        cfgmod.update({ appearance: restoreAppearance });
        overlay.applyAppearance();
      }
      if (applied.includes("mood")) overlay.setMood("idle");
      return { path: out, bytes: png.length, applied, screen: { w: img.getSize().width, h: img.getSize().height } };
    });
  }
}
