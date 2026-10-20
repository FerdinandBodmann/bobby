#!/usr/bin/env node
"use strict";
/**
 * Tiny CDP driver for testing the app.
 *   node scripts/cdp.js <target-substr> --eval "<js>"
 *   node scripts/cdp.js <target-substr> --shot /tmp/out.png
 *   node scripts/cdp.js --list
 */
const fs = require("fs");

async function targets() {
  const port = process.env.BOBBY_CDP_PORT || "9222";
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  return res.json();
}

async function connect(match) {
  const list = await targets();
  const t = list.find(
    (x) => x.type === "page" && (x.url.includes(match) || (x.title || "").toLowerCase().includes(match.toLowerCase()))
  );
  if (!t) throw new Error(`no target matching "${match}" in: ${list.map((x) => x.title).join(", ")}`);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  };
  const send = (method, params = {}, timeoutMs = 15000) =>
    new Promise((resolve) => {
      const i = ++id;
      const timer = setTimeout(() => {
        if (pending.has(i)) {
          pending.delete(i);
          resolve(null);
        }
      }, timeoutMs);
      pending.set(i, (m) => {
        clearTimeout(timer);
        resolve(m);
      });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  return { send, close: () => ws.close(), target: t };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === "--list") {
    const list = await targets();
    for (const t of list) console.log(`${t.type}\t${t.title}\t${t.url}`);
    return;
  }
  const match = argv[0];
  const flag = argv[1];
  const arg = argv.slice(2).join(" ");

  const c = await connect(match);
  try {
    if (flag === "--eval") {
      const r = await c.send("Runtime.evaluate", {
        expression: arg,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      });
      if (r.result?.exceptionDetails) {
        console.error("JS exception:", JSON.stringify(r.result.exceptionDetails, null, 2));
        process.exitCode = 1;
      } else {
        const v = r.result?.result?.value;
        console.log(typeof v === "string" ? v : JSON.stringify(v, null, 2));
      }
    } else if (flag === "--shot") {
      // just ask the compositor for whatever it last drew; if it never drew a
      // frame, fall back to a plain screenshot instead of hanging forever
      let r = await c.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }, 3000);
      if (!r || !r.result?.data) {
        console.log("no frame captured — buddy window has nothing composited right now");
        return;
      }
      fs.writeFileSync(arg, Buffer.from(r.result.data, "base64"));
      console.log("wrote", arg);
    } else {
      console.error("usage: cdp.js <target> --eval <js> | --shot <file> | --list");
      process.exitCode = 2;
    }
  } finally {
    c.close();
  }
}

module.exports = { targets, connect };

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
