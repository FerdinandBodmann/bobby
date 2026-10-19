"use strict";
/**
 * Little timers the buddy can set for the user ("remind me in 20 minutes").
 * Reminders live in the config so they survive a restart, and fire a speech
 * bubble plus a desktop notification through a callback that main.js wires up.
 */
const cfgmod = require("./config");

const MAX_TIMEOUT = 2147483647; // setTimeout's ceiling, ~24.8 days
let fire = () => {};
const timers = new Map();

function listAll() {
  const v = cfgmod.get().reminders;
  return Array.isArray(v) ? v : [];
}

function write(list) {
  cfgmod.update({ reminders: list });
}

function schedule(r) {
  const existing = timers.get(r.id);
  if (existing) clearTimeout(existing);
  if (r.done) return;
  const delay = Math.max(0, r.due - Date.now());
  timers.set(r.id, setTimeout(() => tick(r.id), Math.min(delay, MAX_TIMEOUT)));
}

// A timer may wake up early when the due date is very far away; re-arm if so.
function tick(id) {
  const r = listAll().find((x) => x.id === id);
  if (!r || r.done) {
    timers.delete(id);
    return;
  }
  if (r.due - Date.now() > 60000) {
    schedule(r);
    return;
  }
  timers.delete(id);
  write(listAll().map((x) => (x.id === id ? { ...x, done: true, firedAt: Date.now() } : x)));
  try {
    fire(r);
  } catch (err) {
    console.error("[reminders] fire failed:", err);
  }
}

function add({ text, due }) {
  const r = {
    id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    text: String(text || "reminder").trim().slice(0, 300),
    due,
    created: Date.now(),
    done: false,
  };
  write([...listAll(), r]);
  schedule(r);
  return r;
}

function pending() {
  return listAll().filter((r) => !r.done).sort((a, b) => a.due - b.due);
}

function cancel(id) {
  const r = listAll().find((x) => x.id === id);
  if (!r || r.done) return false;
  const t = timers.get(id);
  if (t) clearTimeout(t);
  timers.delete(id);
  write(listAll().map((x) => (x.id === id ? { ...x, done: true, cancelled: true } : x)));
  return true;
}

// Convenience for when the model only remembers what the reminder said.
function cancelByText(fragment) {
  const needle = String(fragment || "").trim().toLowerCase();
  if (!needle) return null;
  const hit = pending().find((r) => r.text.toLowerCase().includes(needle));
  if (!hit) return null;
  cancel(hit.id);
  return hit;
}

function init(onFire) {
  if (typeof onFire === "function") fire = onFire;
  for (const r of listAll()) {
    if (!r.done) schedule(r);
  }
}

module.exports = { init, add, pending, cancel, cancelByText };
