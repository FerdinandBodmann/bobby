#!/usr/bin/env node
"use strict";
/**
 * Poke a running Bobby from the shell: change what he looks like, put him to
 * sleep, wake him, make him say something — without digging through settings.
 *
 * It rides the DevTools port that BOBBY_DEBUG opens, so Bobby has to be up as:
 *
 *   BOBBY_DEBUG=1 npx electron . --remote-debugging-port=9222
 *
 * Commands run left to right and are sent to the app in one go:
 *
 *   node scripts/trigger.js nap 4                    # watch him doze off alone
 *   node scripts/trigger.js color '#E4A24C' cosmetic star mood sleeping
 *   node scripts/trigger.js restore info
 *
 * Run with no arguments (or --help) for the full list.
 */
const { connect } = require("./cdp");
const { ORDER, LABELS } = require("../src/shared/cosmetics");

// `trigger.js … | head` closes the pipe early; exit quietly instead of
// spraying a stack trace at a reader that has already gone away.
process.stdout.on("error", (e) => {
  if (e && e.code === "EPIPE") process.exit(0);
  throw e;
});

const MOODS = ["idle", "thinking", "talking", "happy", "error", "sleeping"];
const COSMETICS = ["none", ...ORDER];

const USAGE = `usage: node scripts/trigger.js <command> [args] [...]

looks (saved to config.json like the settings window would — \`restore\` puts them back):
  color <#hex>           repaint him          (e.g. color '#E0708F')
  scale <n>              1 = normal, 0.5 = small, 2 = big
  cosmetic <id>          ${COSMETICS.join(" | ")}
  name <text>            what the speech bubble calls him
  sounds <on|off>        his little blips and bounces
  restore                undo the look changes from this session

states (instant, leave no trace):
  mood <name> [--for ms] ${MOODS.join(" | ")}
  sleep                  shortcut for: mood sleeping
  wake                   wake him and restart the nap clock
  nap <seconds|off>      shorten his real nap clock, then stay quiet and watch him
                         doze off on his own; off = the normal five minutes
  poke                   poke him — quip + happy bounce
  bubble <text>          say something in the speech bubble
  info                   mood, look, window bounds, data dir

examples:
  node scripts/trigger.js nap 4
  node scripts/trigger.js wake mood idle
  node scripts/trigger.js mood happy --for 2500
  node scripts/trigger.js color '#E4A24C' cosmetic star scale 1.4
  node scripts/trigger.js poke bubble 'hi!'`;

/** Turn argv into one dev:trigger action list. Throws on nonsense input. */
function parse(argv) {
  const actions = [];
  let wantInfo = false;
  const die = (msg) => {
    const e = new Error(msg);
    e.usage = true;
    throw e;
  };
  const value = (i, flag) => {
    const v = argv[i + 1];
    if (v === undefined) die(`\`${flag}\` needs a value`);
    return v;
  };
  // Consecutive look commands collapse into one action (one config write).
  const look = (patch) => {
    const last = actions[actions.length - 1];
    if (last && last.t === "look") Object.assign(last, patch);
    else actions.push({ t: "look", ...patch });
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "mood": {
        const mood = value(i++, a);
        if (!MOODS.includes(mood)) die(`unknown mood "${mood}" (have: ${MOODS.join(", ")})`);
        actions.push({ t: "mood", mood });
        break;
      }
      case "--for":
      case "for": {
        const ms = Number(value(i++, a));
        if (!Number.isFinite(ms) || ms < 0) die(`${a} wants a number of milliseconds`);
        const last = actions[actions.length - 1];
        if (!last || last.t !== "mood") die(`\`${a}\` only follows a mood command`);
        last.ms = ms;
        break;
      }
      case "sleep":
        actions.push({ t: "mood", mood: "sleeping" });
        break;
      case "wake":
        actions.push({ t: "wake" });
        break;
      case "nap": {
        const v = value(i++, a);
        if (v === "off" || v === "default") actions.push({ t: "nap" });
        else {
          const s = Number(v);
          if (!Number.isFinite(s) || s <= 0) die(`\`nap\` wants seconds (nap 5) or \`off\``);
          actions.push({ t: "nap", ms: Math.round(s * 1000) });
        }
        break;
      }
      case "poke":
        actions.push({ t: "poke" });
        break;
      case "bubble":
        actions.push({ t: "bubble", text: value(i++, a) });
        break;
      case "color":
      case "colour": {
        const v = value(i++, a);
        if (!/^#[0-9a-f]{3,8}$/i.test(v)) die(`\`color\` wants a hex value like '#E4A24C'`);
        look({ color: v });
        break;
      }
      case "scale": {
        const s = Number(value(i++, a));
        if (!Number.isFinite(s) || s < 0.3 || s > 4) die(`\`scale\` wants a number between 0.3 and 4`);
        look({ scale: s });
        break;
      }
      case "cosmetic": {
        const v = value(i++, a);
        if (!COSMETICS.includes(v)) die(`unknown cosmetic "${v}" (have: ${COSMETICS.join(", ")})`);
        look({ cosmetic: v });
        break;
      }
      case "name":
        look({ name: value(i++, a) });
        break;
      case "sounds": {
        const v = value(i++, a);
        if (!["on", "off", "true", "false"].includes(v)) die(`\`sounds\` wants on or off`);
        look({ sounds: v === "on" || v === "true" });
        break;
      }
      case "restore":
        actions.push({ t: "restore" });
        break;
      case "info":
        wantInfo = true;
        break;
      case "-h":
      case "--help":
      case "help":
        return { actions: null, wantInfo: false, help: true };
      default:
        die(`unknown command "${a}"`);
    }
  }
  return { actions, wantInfo, help: false };
}

async function evalJs(c, expression) {
  const r = await c.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (!r) throw new Error("the buddy window never answered");
  const d = r.result?.exceptionDetails;
  if (d) {
    const desc = d.exception?.description || d.text || "evaluation failed";
    throw new Error(String(desc).split("\n")[0]);
  }
  return r.result?.result?.value;
}

function invoke(c, channel, arg) {
  const expr = `window.bobby && window.bobby.invoke(${JSON.stringify(channel)}, ${JSON.stringify(
    arg === undefined ? null : arg
  )})`;
  return evalJs(c, expr);
}

function printLook(a) {
  if (!a) return;
  const cosmetic = a.cosmetic || {};
  console.log(
    `look: ${a.color} · scale ${a.scale} · ${LABELS[cosmetic.id] || "nothing"}` +
      ` · name "${a.name}" · sounds ${a.sounds ? "on" : "off"}`
  );
}

async function main() {
  const { actions, wantInfo, help } = parse(process.argv.slice(2));
  if (help || (!actions.length && !wantInfo)) {
    console.log(USAGE);
    process.exitCode = help ? 0 : 2;
    return;
  }

  const c = await connect("buddy");
  try {
    // An empty action list is a read-only fetch of mood + look.
    const state = await invoke(c, "dev:trigger", actions);
    if (!state || typeof state !== "object") {
      throw new Error("the buddy window has no bobby bridge — is this really Bobby?");
    }
    for (const step of state.applied || []) console.log("·", step);
    console.log(
      `mood: ${state.mood} · nap clock: ${
        state.napAfterMs ? state.napAfterMs + "ms" : "default (5 min)"
      }`
    );
    printLook(state.appearance);

    if (wantInfo) {
      const info = await invoke(c, "dev:info");
      const rendered = await evalJs(c, "window.buddyInfo ? window.buddyInfo() : null");
      const b = info?.buddyBounds;
      if (rendered) console.log(`box: ${rendered.ball.w}×${rendered.ball.h}px on a ${b ? `${b.width}×${b.height}` : "?"}px window`);
      if (b) console.log(`at: ${b.x},${b.y}`);
      console.log(`data: ${info?.userData}`);
    }
  } finally {
    c.close();
  }
}

module.exports = { parse, MOODS, COSMETICS };

if (require.main === module) {
  main().catch((e) => {
    let msg = String((e && e.message) || e);
    if (e && e.usage) {
      console.error(`error: ${msg}\n\n${USAGE}`);
      process.exitCode = 2;
    } else if (/no handler registered/i.test(msg)) {
      console.error("Bobby is up but not in debug mode — start him with:");
      console.error("  BOBBY_DEBUG=1 npx electron . --remote-debugging-port=9222");
      process.exitCode = 1;
    } else if (/error invoking remote method/i.test(msg)) {
      // the handler ran and objected (bad cosmetic, unknown action, …)
      console.error("error:", msg.replace(/^.*?invoking remote method '[^']+':\s*/, ""));
      process.exitCode = 1;
    } else if (/no target matching|fetch failed|ECONNREFUSED|never answered/i.test(msg)) {
      console.error("can't reach the DevTools port — start him with:");
      console.error("  BOBBY_DEBUG=1 npx electron . --remote-debugging-port=9222");
      process.exitCode = 1;
    } else {
      console.error(msg);
      process.exitCode = 1;
    }
  });
}
