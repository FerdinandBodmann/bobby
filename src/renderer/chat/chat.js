"use strict";

const messages = document.getElementById("messages");
const input = document.getElementById("input");
const btnSend = document.getElementById("btnSend");
const btnStop = document.getElementById("btnStop");
const statusline = document.getElementById("statusline");
const statusText = document.getElementById("statusText");
const banner = document.getElementById("banner");
const bannerText = document.getElementById("bannerText");
const nameEl = document.getElementById("name");
const subEl = document.getElementById("sub");
const dot = document.getElementById("dot");
const btnTools = document.getElementById("btnTools");

const entries = new Map(); // id -> { el, textEl, toolsEl, toolEls }
const consents = new Map(); // id -> { el, decision }
let currentId = null;
let currentStatus = null;
let configured = true;
let busy = false;

/* ---------------- tiny dom helpers ---------------- */

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function nearBottom() {
  return messages.scrollHeight - messages.scrollTop - messages.clientHeight < 90;
}
function scrollDown(force) {
  if (force || nearBottom()) messages.scrollTop = messages.scrollHeight;
}

function setStatus(text) {
  currentStatus = text;
  if (!text) {
    statusline.hidden = true;
    return;
  }
  statusText.textContent = text;
  statusline.hidden = false;
}

/* ---------------- rendering ---------------- */

function clearWelcome() {
  const w = messages.querySelector(".welcome");
  if (w) w.remove();
}

function renderWelcome() {
  if (messages.children.length) return;
  const w = el("div", "welcome");
  const big = el("span", "big", "◕‿◕");
  w.appendChild(big);
  w.appendChild(el("div", "", "hi, i'm bobby. i live up top."));
  w.appendChild(el("div", "hintline", "ask me to do something, or double-click the ball to open this chat."));
  messages.appendChild(w);
}

function makeEntry(id, role) {
  const wrap = el("div", `msg ${role}`);
  const textEl = el("div", "text");
  wrap.appendChild(textEl);
  const toolsEl = el("div", "tools");
  wrap.appendChild(toolsEl);
  messages.appendChild(wrap);
  const rec = { el: wrap, textEl, toolsEl, toolEls: new Map() };
  entries.set(id, rec);
  scrollDown(true);
  return rec;
}

function renderEntry(entry) {
  if (!entry || !entry.id) return;
  if (entry.role === "user") {
    clearWelcome();
    const rec = makeEntry(entry.id, "user");
    rec.textEl.textContent = entry.text || "";
    currentId = null;
    return;
  }
  if (entry.role === "assistant") {
    clearWelcome();
    const rec = makeEntry(entry.id, "assistant");
    rec.textEl.textContent = entry.text || "";
    for (const t of entry.tools || []) addTool(entry.id, t, t.status, t.result);
    currentId = entry.id;
  }
}

function ensureAssistant(id) {
  if (entries.has(id)) return entries.get(id);
  clearWelcome();
  return makeEntry(id, "assistant");
}

function addDelta(id, text) {
  const rec = ensureAssistant(id);
  rec.textEl.textContent += text;
  scrollDown(false);
}

const TOOL_LABEL = {
  list_dir: "📁 list_dir",
  read_file: "📄 read_file",
  write_file: "✏️ write_file",
  search_files: "🔎 search_files",
  run_command: "❯ run_command",
  fetch_url: "🌐 fetch_url",
  web_search: "🌐 web_search",
  volume: "🔊 volume",
  media: "🎵 media",
  brightness: "☀️ brightness",
  clipboard: "📋 clipboard",
  notify: "🔔 notify",
  open_url: "↗ open_url",
  read_notes: "🧠 read_notes",
  append_notes: "🧠 append_notes",
};

function addTool(entryId, tool, status, result) {
  const rec = ensureAssistant(entryId);
  let node = rec.toolEls.get(tool.id);
  if (!node) {
    node = el("div", "tool");
    const head = el("div", "tool-head");
    const spin = el("span", "spinner");
    const nm = el("span", "tool-name", TOOL_LABEL[tool.name] || tool.name);
    const st = el("span", "tool-state", "running");
    head.append(spin, nm, st);
    node.appendChild(head);

    const args = tool.args && Object.keys(tool.args).length
      ? el("pre", "args", formatArgs(tool.args))
      : null;
    if (args) node.appendChild(args);

    const details = el("details");
    const summary = el("summary", "", "result");
    const pre = el("pre", "result", "");
    details.append(summary, pre);
    details.hidden = true;
    node.appendChild(details);
    node._details = details;
    node._result = pre;
    node._state = st;
    node._spin = spin;

    rec.toolsEl.appendChild(node);
    rec.toolEls.set(tool.id, node);
  }

  if (status) {
    node.dataset.status = status;
    node._state.textContent = status === "ok" ? "done" : status === "error" ? "failed" : "running";
    node._spin.style.display = status === "running" ? "" : "none";
  }
  if (result !== undefined) {
    node._details.hidden = false;
    node._result.textContent = String(result || "").slice(0, 3000);
  }
  scrollDown(false);
}

function formatArgs(args) {
  if (typeof args !== "object" || !args) return String(args);
  if (args.command) return String(args.command);
  if (args.path && Object.keys(args).length === 1) return String(args.path);
  if (args.url && Object.keys(args).length === 1) return String(args.url);
  if (args.query && Object.keys(args).length === 1) return String(args.query);
  const slim = { ...args };
  delete slim._raw;
  return JSON.stringify(slim, null, 2).slice(0, 1200);
}

function addSystemError(text) {
  const wrap = el("div", "msg assistant");
  const err = el("div", "error", text);
  wrap.appendChild(err);
  messages.appendChild(wrap);
  scrollDown(false);
}

/* ---------------- consent cards ---------------- */

function showConsent(req) {
  const card = el("div", `consent${req.danger ? " danger" : ""}`);
  const title = el("div", "consent-title");
  const b = el("b", "", req.summary);
  title.append(`${nameEl.textContent || "Bobby"} wants to `, b);
  card.appendChild(title);
  card.appendChild(
    el(
      "div",
      "consent-warn",
      req.danger
        ? "This one can change things on your device. It always asks."
        : "You can allow just this once, or remember the choice."
    )
  );

  const actions = el("div", "consent-actions");
  const deny = el("button", "deny", "Deny");
  const once = el("button", "primary", "Approve once");
  let always = null;
  if (req.allow && req.allow.label) {
    always = el("button", "ghost", req.allow.label);
  }

  deny.onclick = () => answerConsent(req.id, "deny");
  once.onclick = () => answerConsent(req.id, "once");
  if (always) always.onclick = () => answerConsent(req.id, "always");
  actions.append(deny);
  if (always) actions.append(always);
  actions.append(once);
  card.appendChild(actions);

  messages.appendChild(card);
  consents.set(req.id, { el: card, decision: null });
  clearWelcome();
  scrollDown(true);
}

async function answerConsent(id, decision) {
  const rec = consents.get(id);
  if (!rec || rec.decision) return;
  rec.decision = decision;
  rec.el.classList.add("resolved");
  rec.el.querySelectorAll("button").forEach((b) => (b.disabled = true));
  const note = el(
    "div",
    "consent-warn",
    decision === "deny" ? "denied" : decision === "always" ? "allowed (remembered)" : "approved once"
  );
  rec.el.appendChild(note);
  try {
    await window.bobby.invoke("consent:answer", { id, decision });
  } catch {}
}

function closeConsent(id) {
  const rec = consents.get(id);
  if (!rec) return;
  if (!rec.decision) {
    rec.el.classList.add("resolved");
    rec.el.querySelectorAll("button").forEach((b) => (b.disabled = true));
    rec.el.appendChild(el("div", "consent-warn", "dismissed"));
  }
}

/* ---------------- header / status ---------------- */

function updateStatus(s) {
  if (!s) return;
  configured = !!s.configured;
  if (s.buddyName) nameEl.textContent = s.buddyName;
  const bits = [];
  if (s.model) bits.push(s.model);
  else bits.push("no model");
  bits.push(s.toolsEnabled ? "hands on" : "hands off");
  if (!s.webEnabled) bits.push("offline");
  if (!s.configured) bits.unshift("not connected");
  subEl.textContent = bits.join(" · ");
  if (s.color) {
    document.documentElement.style.setProperty("--accent", s.color);
  }
  btnTools.classList.toggle("off", !s.toolsEnabled);
  banner.hidden = configured;
  if (!configured) {
    bannerText.textContent = "Bobby needs a brain before it can think. Add your provider + API key.";
  }
}

/* ---------------- events ---------------- */

function onAgentEvent(e) {
  switch (e.type) {
    case "user":
      renderEntry(e.entry);
      break;

    case "thinking":
      busy = true;
      setStatus("thinking…");
      btnSend.disabled = true;
      btnStop.hidden = false;
      break;

    case "assistant-start": {
      const rec = ensureAssistant(e.entry.id);
      rec.el.classList.add("streaming");
      setStatus("talking…");
      break;
    }

    case "delta": {
      addDelta(e.id, e.text);
      break;
    }

    case "tool":
      addTool(e.id, e.tool, "running");
      setStatus(`running ${e.tool.name}…`);
      break;

    case "tool-done":
      addTool(e.id, e.tool, e.tool.status, e.tool.result);
      break;

    case "done": {
      const rec = entries.get(e.id);
      if (rec) {
        rec.el.classList.remove("streaming");
        if (!rec.textEl.textContent && !rec.toolEls.size) rec.el.remove();
      }
      currentId = e.id;
      setStatus(null);
      busy = false;
      btnSend.disabled = false;
      btnStop.hidden = true;
      break;
    }

    case "error":
      addSystemError(e.error || "something went wrong");
      if (!e.soft) {
        busy = false;
        btnSend.disabled = false;
        btnStop.hidden = true;
        setStatus(null);
      }
      break;

    case "stopped":
      setStatus(null);
      busy = false;
      btnSend.disabled = false;
      btnStop.hidden = true;
      addSystemError("stopped.");
      break;

    case "idle":
      setStatus(null);
      busy = false;
      btnSend.disabled = false;
      btnStop.hidden = true;
      break;

    case "cleared":
      entries.clear();
      consents.clear();
      messages.innerHTML = "";
      currentId = null;
      renderWelcome();
      break;
  }
  scrollDown(false);
}

window.bobby.on("chat:event", onAgentEvent);
window.bobby.on("chat:consent", showConsent);
window.bobby.on("chat:consent-closed", ({ id }) => closeConsent(id));
window.bobby.on("app:status", updateStatus);

/* ---------------- input ---------------- */

async function send() {
  const text = input.value.trim();
  if (!text || busy) return;
  input.value = "";
  autosize();
  autosize();
  busy = true;
  btnSend.disabled = true;
  btnStop.hidden = false;
  setStatus("thinking…");
  try {
    await window.bobby.invoke("chat:send", { text });
  } catch (e) {
    addSystemError(e.message || "could not send");
  }
}

function autosize() {
  input.style.height = "auto";
  input.style.height = Math.min(150, input.scrollHeight) + "px";
}

input.addEventListener("input", autosize);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

btnSend.onclick = send;
btnStop.onclick = () => window.bobby.invoke("chat:stop");

document.getElementById("btnSettings").onclick = () => window.bobby.invoke("app:openSettings");
document.getElementById("btnClose").onclick = () => window.close();
document.getElementById("bannerBtn").onclick = () => window.bobby.invoke("app:openSettings");
btnTools.onclick = async () => {
  await window.bobby.invoke("app:toggleTools");
};

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.close();
});

/* ---------------- boot ---------------- */

(async function boot() {
  try {
    const status = await window.bobby.invoke("app:status");
    updateStatus(status);
    const history = await window.bobby.invoke("chat:history");
    if (Array.isArray(history) && history.length) {
      for (const entry of history) renderEntry(entry);
    }
    if (!messages.children.length) renderWelcome();
    scrollDown(true);
  } catch (e) {
    addSystemError(e.message || "failed to load");
  }
  setTimeout(() => input.focus(), 150);
})();
