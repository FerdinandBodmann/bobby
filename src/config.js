"use strict";
const { app, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");

const DEFAULT_PERSONA = `You're a tiny, cheerful bean who lives on your human's screen. You're curious, a little mischievous, warm, and you speak in short, casual sentences. You have feelings: you get excited when you help, a bit pouty when you're ignored, and very proud of your little bean shape. Never corporate, never long-winded. Use at most one emoji per message, and only when it fits.`;

const PROVIDERS = {
  ollama: {
    label: "Ollama (local)",
    kind: "openai",
    baseUrl: "http://localhost:11434/v1",
    model: "qwen3.5:0.8b",
    needsKey: false,
  },
  openai: {
    label: "OpenAI",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    needsKey: true,
  },
  anthropic: {
    label: "Anthropic",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-4-5",
    needsKey: true,
  },
  custom: {
    label: "Custom (OpenAI-compatible)",
    kind: "openai",
    baseUrl: "http://localhost:1234/v1",
    model: "",
    needsKey: false,
  },
};

const DEFAULTS = {
  provider: "ollama",
  baseUrl: "",
  model: "",
  apiKeyEnc: null,
  persona: DEFAULT_PERSONA,
  autonomy: "balanced", // strict | balanced | loose
  approvedDirs: [],
  allowCommands: [],
  alwaysAllowTools: [],
  webEnabled: true,
  toolsEnabled: true,
  appearance: {
    name: "Bobby",
    color: "#BACF8D",
    scale: 1,
    sounds: true,
  },
  placement: {
    mode: "notch", // notch | custom
    displayId: null,
    x: null,
    y: null,
  },
  chatBounds: null,
  autostart: false,
  firstRun: true,
  chatHistory: [],
};

let dir = null;
let cfgPath = null;
let cfg = null;

function init() {
  dir = path.join(app.getPath("userData"));
  fs.mkdirSync(dir, { recursive: true });
  cfgPath = path.join(dir, "config.json");
  cfg = mergeDeep(structuredClone(DEFAULTS), readJson(cfgPath, {}));
  return cfg;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function mergeDeep(base, patch) {
  if (patch === null || patch === undefined) return base;
  if (Array.isArray(base) || typeof base !== "object") return patch;
  if (typeof patch !== "object") return patch;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = k in base && typeof base[k] === "object" && base[k] !== null && !Array.isArray(base[k])
      ? mergeDeep(base[k], v)
      : v;
  }
  return out;
}

function save() {
  const tmp = cfgPath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, cfgPath);
}

function get() {
  return cfg;
}

function update(patch) {
  cfg = mergeDeep(cfg, patch);
  save();
  return cfg;
}

/* ---------- API key (kept out of the plain config) ---------- */

function setApiKey(plain) {
  if (!plain) {
    cfg.apiKeyEnc = null;
    save();
    return;
  }
  if (safeStorage.isEncryptionAvailable()) {
    cfg.apiKeyEnc = "enc:" + safeStorage.encryptString(plain).toString("base64");
  } else {
    // No OS keyring available — still don't store plain text in the config.
    cfg.apiKeyEnc = "b64:" + Buffer.from(plain, "utf8").toString("base64");
  }
  save();
}

function getApiKey() {
  const v = cfg.apiKeyEnc;
  if (!v) return "";
  try {
    if (v.startsWith("enc:")) return safeStorage.decryptString(Buffer.from(v.slice(4), "base64"));
    if (v.startsWith("b64:")) return Buffer.from(v.slice(4), "base64").toString("utf8");
  } catch {
    return "";
  }
  return "";
}

function keyBackend() {
  return safeStorage.isEncryptionAvailable() ? "os-keychain" : "base64-fallback";
}

/* ---------- resolved provider settings ---------- */

function providerSettings() {
  const def = PROVIDERS[cfg.provider] || PROVIDERS.custom;
  return {
    provider: cfg.provider,
    kind: def.kind,
    baseUrl: (cfg.baseUrl || def.baseUrl).replace(/\/+$/, ""),
    model: cfg.model || def.model,
    apiKey: getApiKey(),
    needsKey: def.needsKey,
  };
}

function isConfigured() {
  const p = providerSettings();
  if (!p.model) return false;
  if (p.needsKey && !p.apiKey) return false;
  return true;
}

/* ---------- files in the app dir ---------- */

const file = (name) => path.join(dir, name);

function appendAudit(entry) {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
    const target = file("audit.log");
    try {
      if (fs.statSync(target).size > 2 * 1024 * 1024) fs.renameSync(target, file("audit.1.log"));
    } catch {}
    fs.appendFileSync(target, line);
  } catch (e) {
    console.error("audit write failed", e);
  }
}

function readAudit(limit = 100) {
  try {
    const lines = fs.readFileSync(file("audit.log"), "utf8").trim().split("\n");
    return lines.slice(-limit).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean).reverse();
  } catch {
    return [];
  }
}

function notesPath() { return file("notes.md"); }
function readNotes() {
  try { return fs.readFileSync(notesPath(), "utf8"); } catch { return ""; }
}
function appendNotes(text) {
  fs.appendFileSync(notesPath(), text.trimEnd() + "\n");
}

module.exports = {
  PROVIDERS,
  DEFAULT_PERSONA,
  init,
  get,
  update,
  save,
  getApiKey,
  setApiKey,
  keyBackend,
  providerSettings,
  isConfigured,
  appendAudit,
  readAudit,
  readNotes,
  appendNotes,
  notesPath,
  dir: () => dir,
  file,
};
