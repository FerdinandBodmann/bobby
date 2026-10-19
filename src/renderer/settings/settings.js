"use strict";

const $ = (id) => document.getElementById(id);
const providerEl = $("provider");
const baseUrlEl = $("baseUrl");
const modelEl = $("model");
const apiKeyEl = $("apiKey");
const nameEl = $("name");
const personaEl = $("persona");
const colorEl = $("color");
const scaleEl = $("scale");
const soundsEl = $("sounds");
const autonomyEl = $("autonomy");
const webEl = $("webEnabled");
const toolsEl = $("toolsEnabled");
const autostartEl = $("autostart");
const dirsEl = $("dirs");
const cmdsEl = $("cmds");
const auditEl = $("audit");
const saveState = $("saveState");
const testResult = $("testResult");
const keyBackend = $("keyBackend");

let data = null;
let dirs = [];
let cmds = [];
let apiKeyDirty = false;
let keyValue = "";

/* ---------------- boot ---------------- */

(async function boot() {
  try {
    data = await window.bobby.invoke("settings:get");
    applyToForm(data);
    await loadAudit();
  } catch (e) {
    flash("failed to load settings: " + e.message, "bad");
  }
})();

function applyToForm(d) {
  providerEl.value = d.provider || "ollama";
  const eff = d.effective || {};
  baseUrlEl.value = eff.baseUrl || "";
  modelEl.value = eff.model || "";
  if (d.hasKey) {
    apiKeyEl.placeholder = "•••••••• saved (" + (d.keyBackend === "os-keychain" ? "OS keychain" : "local fallback") + ")";
  } else {
    apiKeyEl.placeholder = "paste your key here";
  }
  keyBackend.textContent = d.keyBackend === "os-keychain" ? "in OS keychain" : "local fallback";
  nameEl.value = d.appearance?.name || "Bobby";
  personaEl.value = d.persona || "";
  colorEl.value = d.appearance?.color || "#BACF8D";
  scaleEl.value = d.appearance?.scale || 1;
  $("scaleVal").textContent = Math.round((d.appearance?.scale || 1) * 100) + "%";
  soundsEl.checked = !!d.appearance?.sounds;
  autonomyEl.value = d.autonomy || "balanced";
  webEl.checked = !!d.webEnabled;
  toolsEl.checked = !!d.toolsEnabled;
  autostartEl.checked = !!d.autostart;
  dirs = [...(d.approvedDirs || [])];
  cmds = [...(d.allowCommands || [])];
  renderChips();
  document.documentElement.style.setProperty("--accent", colorEl.value);
}

/* ---------------- chips ---------------- */

function renderChips() {
  fillChips(dirsEl, dirs, "no folders approved yet — ask bobby to look at one, or add it here");
  fillChips(cmdsEl, cmds, "nothing yet");
}

function fillChips(container, list, emptyText) {
  container.innerHTML = "";
  if (!list.length) {
    const e = document.createElement("div");
    e.className = "empty";
    e.textContent = emptyText;
    container.appendChild(e);
    return;
  }
  for (const item of list) {
    const chip = document.createElement("div");
    chip.className = "chip";
    const span = document.createElement("span");
    span.textContent = item;
    span.title = item;
    const x = document.createElement("button");
    x.textContent = "×";
    x.title = "remove";
    x.onclick = () => {
      dirs = dirs.filter((d) => d !== item);
      cmds = cmds.filter((c) => c !== item);
      renderChips();
    };
    chip.append(span, x);
    container.appendChild(chip);
  }
}

/* ---------------- provider helpers ---------------- */

providerEl.addEventListener("change", () => {
  const def = data?.providers?.[providerEl.value];
  if (!def) return;
  const oldDefaults = Object.values(data.providers).map((p) => p.baseUrl);
  const oldModels = Object.values(data.providers).map((p) => p.model);
  if (!baseUrlEl.value || oldDefaults.includes(baseUrlEl.value)) baseUrlEl.value = def.baseUrl;
  if (!modelEl.value || oldModels.includes(modelEl.value)) modelEl.value = def.model;
});

colorEl.addEventListener("input", () => {
  document.documentElement.style.setProperty("--accent", colorEl.value);
});
scaleEl.addEventListener("input", () => {
  $("scaleVal").textContent = Math.round(Number(scaleEl.value) * 100) + "%";
});

apiKeyEl.addEventListener("input", () => {
  apiKeyDirty = true;
  keyValue = apiKeyEl.value;
});
$("btnClearKey").onclick = () => {
  apiKeyDirty = true;
  keyValue = "";
  apiKeyEl.value = "";
  apiKeyEl.placeholder = "(key cleared when you save)";
};

/* ---------------- models ---------------- */

$("btnModels").onclick = async () => {
  const btn = $("btnModels");
  btn.disabled = true;
  btn.textContent = "…";
  try {
    const list = await window.bobby.invoke("settings:models", {
      baseUrl: baseUrlEl.value,
      provider: providerEl.value,
    });
    const dl = $("modelList");
    dl.innerHTML = "";
    for (const m of list) {
      const opt = document.createElement("option");
      opt.value = m;
      dl.appendChild(opt);
    }
    if (list.length) {
      testResult.className = "result ok";
      testResult.textContent = `${list.length} model${list.length > 1 ? "s" : ""} found — pick one above`;
    } else {
      testResult.className = "result bad";
      testResult.textContent = "no models found (is the provider running?)";
    }
  } catch (e) {
    testResult.className = "result bad";
    testResult.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "list";
  }
};

/* ---------------- test ---------------- */

$("btnTest").onclick = async () => {
  const btn = $("btnTest");
  btn.disabled = true;
  testResult.className = "result";
  testResult.textContent = "testing…";
  try {
    const res = await window.bobby.invoke("settings:test", {
      provider: providerEl.value,
      baseUrl: baseUrlEl.value,
      model: modelEl.value,
      apiKey: apiKeyDirty ? keyValue : "",
      useSaved: !apiKeyDirty,
    });
    if (res.ok) {
      testResult.className = "result ok";
      testResult.textContent = "connected ✓  " + (res.reply ? `“${res.reply}”` : "");
    } else {
      testResult.className = "result bad";
      testResult.textContent = res.error || "connection failed";
    }
  } catch (e) {
    testResult.className = "result bad";
    testResult.textContent = e.message;
  } finally {
    btn.disabled = false;
  }
};

/* ---------------- folders ---------------- */

$("btnAddDir").onclick = async () => {
  try {
    const dir = await window.bobby.invoke("settings:pickFolder");
    if (dir && !dirs.includes(dir)) {
      dirs.push(dir);
      renderChips();
    }
  } catch (e) {
    flash(e.message, "bad");
  }
};

/* ---------------- save ---------------- */

$("btnSave").onclick = async () => {
  const btn = $("btnSave");
  btn.disabled = true;
  saveState.className = "";
  saveState.textContent = "saving…";
  try {
    const patch = {
      provider: providerEl.value,
      baseUrl: baseUrlEl.value.trim(),
      model: modelEl.value.trim(),
      persona: personaEl.value,
      autonomy: autonomyEl.value,
      webEnabled: webEl.checked,
      toolsEnabled: toolsEl.checked,
      autostart: autostartEl.checked,
      approvedDirs: dirs,
      allowCommands: cmds,
      appearance: {
        name: nameEl.value.trim() || "Bobby",
        color: colorEl.value,
        scale: Number(scaleEl.value),
        sounds: soundsEl.checked,
      },
    };
    if (apiKeyDirty) patch.apiKey = keyValue;
    data = await window.bobby.invoke("settings:save", patch);
    apiKeyDirty = false;
    apiKeyEl.value = "";
    applyToForm(data);
    flash("saved ✓", "ok");
    await loadAudit();
  } catch (e) {
    flash(e.message || "could not save", "bad");
  } finally {
    btn.disabled = false;
  }
};

/* ---------------- data ---------------- */

$("btnDataDir").onclick = () => window.bobby.invoke("settings:openDataDir");
$("btnAudit").onclick = () => window.bobby.invoke("settings:openAudit");
$("btnClearChat").onclick = async () => {
  if (!confirm("Clear the chat history? The buddy will forget this conversation.")) return;
  await window.bobby.invoke("chat:clear");
  flash("chat cleared", "ok");
};

/* ---------------- audit ---------------- */

async function loadAudit() {
  try {
    const rows = await window.bobby.invoke("audit:get");
    auditEl.innerHTML = "";
    if (!rows?.length) {
      const e = document.createElement("div");
      e.className = "empty";
      e.textContent = "nothing has happened yet";
      auditEl.appendChild(e);
      return;
    }
    for (const r of rows.slice(0, 25)) {
      const row = document.createElement("div");
      row.className = "arow";
      const time = document.createElement("time");
      time.textContent = new Date(r.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const tool = document.createElement("span");
      tool.className = "tool";
      tool.textContent = r.tool || "—";
      const args = document.createElement("span");
      args.className = "args";
      args.textContent = r.args || r.error || "";
      args.title = args.textContent;
      const badge = document.createElement("span");
      badge.className = "badge " + (r.ok ? "ok" : "bad");
      badge.textContent = r.ok ? r.decision || "done" : "failed";
      row.append(time, tool, args, badge);
      auditEl.appendChild(row);
    }
  } catch {}
}

/* ---------------- misc ---------------- */

function flash(text, kind) {
  saveState.textContent = text;
  saveState.className = kind || "";
  if (kind === "ok") setTimeout(() => (saveState.textContent = ""), 2600);
}

$("btnClose").onclick = () => window.close();
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.close();
});
$("btnResetPos").onclick = async () => {
  await window.bobby.invoke("settings:resetPosition");
  flash("buddy moved home", "ok");
};
