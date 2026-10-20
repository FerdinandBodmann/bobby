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

<<<<<<< HEAD
=======
/* The wardrobe is shared with the buddy renderer and the tray menus. */
const WARDROBE = (window.BOBBY_COSMETICS || { COSMETICS: {}, ORDER: [], LABELS: {} });
const COSMETICS = WARDROBE.COSMETICS;
const COSMETIC_ORDER = WARDROBE.ORDER;
const COSMETIC_LABELS = WARDROBE.LABELS;
let cosmetic = { id: "", cx: null, cy: null, scale: 1 };

>>>>>>> 28c608d (0.1)
/* ---------------- boot ---------------- */

(async function boot() {
  try {
    data = await window.bobby.invoke("settings:get");
    populateProviders(data);
    applyToForm(data);
    updateProviderHint();
    await loadAudit();
  } catch (e) {
    flash("failed to load settings: " + e.message, "bad");
  }
})();

function populateProviders(d) {
  const providers = d.providers || {};
  const local = document.createElement("optgroup");
  local.label = "On this machine";
  const cloud = document.createElement("optgroup");
  cloud.label = "Cloud providers";
  for (const [key, def] of Object.entries(providers)) {
    const o = document.createElement("option");
    o.value = key;
    o.textContent = def.label + (def.needsKey ? "" : " · no key needed");
    (def.local ? local : cloud).appendChild(o);
  }
  providerEl.innerHTML = "";
  if (local.children.length) providerEl.appendChild(local);
  if (cloud.children.length) providerEl.appendChild(cloud);
}

function updateProviderHint(d = data) {
  const def = d?.providers?.[providerEl.value];
  const hintEl = $("providerHint");
  const hint = def?.hint || "";
  hintEl.textContent = hint;
  hintEl.hidden = !hint;
}

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
  colorEl.value = d.appearance?.color || "#726FCF";
  scaleEl.value = d.appearance?.scale || 1;
  $("scaleVal").textContent = Math.round((d.appearance?.scale || 1) * 100) + "%";
  soundsEl.checked = !!d.appearance?.sounds;
  autonomyEl.value = d.autonomy || "balanced";
  webEl.checked = !!d.webEnabled;
  toolsEl.checked = !!d.toolsEnabled;
  autostartEl.checked = !!d.autostart;
  dirs = [...(d.approvedDirs || [])];
  cmds = [...(d.allowCommands || [])];
<<<<<<< HEAD
  renderChips();
  renderSwatches();
=======
  const c = d.appearance?.cosmetic || {};
  // Keep any hand-placed position; the picker only ever changes which one he wears.
  cosmetic = {
    id: typeof c.id === "string" ? c.id : "",
    cx: c.cx ?? null,
    cy: c.cy ?? null,
    scale: Number(c.scale) || 1,
  };
  renderChips();
  renderSwatches();
  renderLooks();
  setWearHint(false);
>>>>>>> 28c608d (0.1)
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
  updateProviderHint();
  if (!def) return;
  const oldDefaults = Object.values(data.providers).map((p) => p.baseUrl);
  const oldModels = Object.values(data.providers).map((p) => p.model);
  if (!baseUrlEl.value || oldDefaults.includes(baseUrlEl.value)) baseUrlEl.value = def.baseUrl;
  if (!modelEl.value || oldModels.includes(modelEl.value)) modelEl.value = def.model;
});

/* ---------------- colour presets ---------------- */

const PRESET_COLORS = [
  { hex: "#726FCF", name: "bobby blue" },
  { hex: "#BACF8D", name: "sage" },
  { hex: "#6EE7C8", name: "mint" },
  { hex: "#9BD3F0", name: "sky" },
  { hex: "#C9B8F0", name: "lilac" },
  { hex: "#FFD98A", name: "butter" },
  { hex: "#FFB39B", name: "peach" },
  { hex: "#FF9EB0", name: "coral" },
  { hex: "#8C97AC", name: "slate" },
];

function renderSwatches() {
  const box = $("swatches");
  if (!box) return;
  const current = String(colorEl.value || "").toLowerCase();
  box.innerHTML = "";
  for (const p of PRESET_COLORS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch" + (current === p.hex.toLowerCase() ? " active" : "");
    b.style.setProperty("--sw", p.hex);
    b.title = p.name;
    b.setAttribute("aria-label", p.name);
    b.onclick = () => {
      colorEl.value = p.hex;
      colorEl.dispatchEvent(new Event("input"));
      renderSwatches();
    };
    box.appendChild(b);
  }
}

<<<<<<< HEAD
=======
/* ---------------- what he wears ---------------- */

const WEAR_DEFAULT_HINT = "— click one and he tries it on right away";

function setWearHint(pending) {
  const el = $("wearHint");
  if (!el) return;
  el.textContent = pending ? "— he's trying it on. press Save to keep it" : WEAR_DEFAULT_HINT;
}

function renderLooks() {
  const box = $("looks");
  if (!box) return;
  box.innerHTML = "";
  for (const id of ["", ...COSMETIC_ORDER]) {
    const def = id ? COSMETICS[id] : null;
    if (id && !def) continue;

    const card = document.createElement("button");
    card.type = "button";
    card.className = "look" + (cosmetic.id === id ? " active" : "");
    card.title = id ? `let him wear the ${COSMETIC_LABELS[id] || id}` : "wear nothing";
    card.setAttribute("aria-pressed", String(cosmetic.id === id));

    const mini = document.createElement("div");
    mini.className = "mini";
    const inner = document.createElement("div");
    inner.className = "miniinner";
    const bean = document.createElement("div");
    bean.className = "miniball";
    inner.appendChild(bean);

    if (def) {
      // Same placement maths as the real bean: 156x110 design box, cx/cy fractions
      // relative to the bean itself (the slot lives inside .ball on the buddy too).
      const span = Math.round(110 * def.size);
      const deco = document.createElement("div");
      deco.className = "minicosmetic";
      deco.style.width = span + "px";
      deco.style.height = span + "px";
      deco.style.left = Math.round(156 * (def.cx ?? 0.5)) + "px";
      deco.style.top = Math.round(110 * (def.cy ?? 0.8)) + "px";
      deco.innerHTML = def.svg;
      bean.appendChild(deco);
    }
    mini.appendChild(inner);

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = COSMETIC_LABELS[id] || id || "nothing";

    card.append(mini, name);
    card.onclick = () => {
      cosmetic.id = id;
      renderLooks();
      setWearHint(true);
      // Show it on the real bean straight away — not saved until you press Save.
      window.bobby.invoke("appearance:preview", { cosmetic: id ? { ...cosmetic } : null }).catch(() => {});
    };
    box.appendChild(card);
  }
}

>>>>>>> 28c608d (0.1)
colorEl.addEventListener("input", () => {
  document.documentElement.style.setProperty("--accent", colorEl.value);
  renderSwatches();
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
<<<<<<< HEAD
=======
        // Keep cx/cy so a hand-placed cosmetic isn't reset by saving.
        cosmetic: { ...cosmetic, scale: cosmetic.scale || 1 },
>>>>>>> 28c608d (0.1)
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
