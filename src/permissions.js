"use strict";
/**
 * Consent gate. Nothing the buddy "does" on the device happens without passing
 * through execute() here. Every decision lands in the audit log.
 */
const crypto = require("crypto");
const cfgmod = require("./config");
const tools = require("./tools");

const WEB_TOOLS = new Set(["fetch_url", "web_search", "open_url"]);
const pending = new Map();

function applyAutonomy(level, cfg) {
  if (level === "danger") return "danger";
  if (cfg.autonomy === "strict") return "ask";
  if (cfg.autonomy === "loose") return "auto";
  return level; // balanced
}

function hasToolAllow(name, cfg) {
  return (cfg.alwaysAllowTools || []).includes(name);
}

/**
 * @param {string} name
 * @param {object} args
 * @param {(req: object) => Promise<'once'|'always'|'deny'>} ask
 */
async function authorize(name, args, ask) {
  const tool = tools.get(name);
  if (!tool) throw new Error(`unknown tool: ${name}`);
  const cfg = cfgmod.get();

  if (!cfg.toolsEnabled) {
    throw new Error("My tools are switched off (kill switch). Turn them back on first.");
  }
  if (WEB_TOOLS.has(name) && !cfg.webEnabled) {
    throw new Error("Internet access is switched off in settings.");
  }

  const base = tool.policy(args) || { level: "ask" };
  let level = applyAutonomy(base.level, cfg);
  if (level !== "danger" && hasToolAllow(name, cfg)) level = "auto";
  if (name === "append_notes" || name === "read_notes") level = "auto";

  if (level === "auto") return { level, decision: "auto", tool, base };

  const req = {
    id: crypto.randomUUID(),
    tool: name,
    summary: tool.summarize(args),
    danger: level === "danger",
    allow: level === "danger" ? null : base.allow || null,
  };
  const decision = await ask(req); // 'once' | 'always' | 'deny'
  return { level, decision, tool, base, req };
}

/**
 * Run a tool call end-to-end: authorize -> execute -> audit.
 * Throws on deny/failure; the agent turns that into text for the model.
 */
async function execute(name, args, ask) {
  const started = Date.now();
  const tool = tools.get(name);
  const summary = tool ? tool.summarize(args || {}) : name;
  let decision = "n/a";
  try {
    const auth = await authorize(name, args, ask);
    decision = auth.decision;
    if (decision === "deny") throw new Error("You didn't approve that one.");
    const result = await tool.run(args || {});
    const text = typeof result === "string" ? result : JSON.stringify(result);
    cfgmod.appendAudit({
      tool: name,
      args: summary,
      argsRaw: args,
      decision,
      ok: true,
      ms: Date.now() - started,
      result: text.slice(0, 400),
    });
    return text;
  } catch (e) {
    cfgmod.appendAudit({
      tool: name,
      args: summary,
      argsRaw: args,
      decision,
      ok: false,
      ms: Date.now() - started,
      error: e.message,
    });
    throw e;
  }
}

/* ---------- consent request plumbing (used by main) ---------- */

function createAsker(sendToUi) {
  return function ask(req) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(req.id);
        resolve("deny");
      }, 90_000);
      pending.set(req.id, {
        req,
        resolve: (d) => {
          clearTimeout(timer);
          pending.delete(req.id);
          resolve(d);
        },
      });
      sendToUi(req);
    });
  };
}

function answer(id, decision) {
  const item = pending.get(id);
  if (!item) return false;
  item.resolve(decision === "always" ? "always" : decision === "once" ? "once" : "deny");
  return true;
}

function hasPending() {
  return pending.size > 0;
}

module.exports = { execute, createAsker, answer, hasPending, pending };
