"use strict";
/**
 * Everything the buddy can do on the device.
 * Each tool declares:
 *   name, description, parameters (JSON Schema)
 *   summarize(args)  -> one line for the consent card
 *   policy(args)     -> { level: 'auto'|'ask'|'danger', allow? }
 *   run(args)        -> Promise<string>
 */
const { execFile, spawn } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const cfgmod = require("./config");
const reminders = require("./reminders");

const HOME = os.homedir();
const IS_MAC = process.platform === "darwin";
const IS_WIN = process.platform === "win32";

/* ---------------- helpers ---------------- */

function sh(cmd, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, {
      timeout: opts.timeout ?? 30000,
      maxBuffer: 8 * 1024 * 1024,
      cwd: opts.cwd || HOME,
      env: { ...process.env, ...(opts.env || {}) },
    }, (err, stdout, stderr) => {
      if (err && err.code === "ENOENT") return reject(new Error(`${cmd} is not installed`));
      if (err && err.killed) return reject(new Error("command timed out"));
      const out = `${stdout || ""}${stderr && !stdout ? stderr : ""}`.trim();
      if (err) {
        return reject(new Error(out || err.message));
      }
      resolve((stdout || "").trim());
    });
  });
}

function shInput(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err || `exit ${code}`))));
    p.stdin.end(input ?? "");
  });
}

function has(cmd) {
  const paths = (process.env.PATH || "").split(path.delimiter);
  return paths.some((p) => {
    try { return fs.existsSync(path.join(p, cmd)); } catch { return false; }
  });
}

function expand(p) {
  if (typeof p !== "string" || !p.trim()) throw new Error("path is required");
  if (p.includes("\0")) throw new Error("invalid path");
  let out = p.trim();
  if (out === "~") out = HOME;
  else if (out.startsWith("~/")) out = path.join(HOME, out.slice(2));
  return path.resolve(out);
}

function inside(dir, p) {
  const rel = path.relative(dir, p);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function approvedPath(p) {
  return (cfgmod.get().approvedDirs || []).some((d) => {
    try { return inside(expand(d), p); } catch { return false; }
  });
}

function trimText(s, n = 20000) {
  s = String(s ?? "");
  return s.length > n ? s.slice(0, n) + `\n… [truncated ${s.length - n} chars]` : s;
}

/* ---------------- reminders + system facts ---------------- */

function parseWhen(a) {
  const now = Date.now();
  const mins = Number(a.in_minutes);
  if (Number.isFinite(mins) && mins >= 0) return now + Math.round(mins * 60000);
  const raw = String(a.at || "").trim();
  if (raw) {
    let m = /^(\d{1,2}):(\d{2})$/.exec(raw);
    if (m && Number(m[1]) < 24 && Number(m[2]) < 60) {
      const d = new Date();
      d.setHours(Number(m[1]), Number(m[2]), 0, 0);
      if (d.getTime() <= now + 10000) d.setDate(d.getDate() + 1);
      return d.getTime();
    }
    m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i.exec(raw);
    if (m) {
      let h = Number(m[1]) % 12;
      if (m[3].toLowerCase() === "pm") h += 12;
      const d = new Date();
      d.setHours(h, Number(m[2] || 0), 0, 0);
      if (d.getTime() <= now + 10000) d.setDate(d.getDate() + 1);
      return d.getTime();
    }
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) return t;
  }
  throw new Error('Tell me when — pass in_minutes, or at like "15:30".');
}

function fmtWhen(ms) {
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function whenLabel(a) {
  try {
    return ` (${fmtWhen(parseWhen(a))})`;
  } catch {
    return "";
  }
}

async function batteryInfo() {
  try {
    const base = "/sys/class/power_supply";
    const names = fs.readdirSync(base).filter((n) => n.startsWith("BAT"));
    if (names.length) {
      const read = (n) => {
        try { return fs.readFileSync(path.join(base, names[0], n), "utf8").trim(); } catch { return ""; }
      };
      const cap = read("capacity");
      const st = read("status");
      return `Battery: ${cap || "?"}%${st ? ` (${st.toLowerCase()})` : ""}`;
    }
  } catch {
    /* not linux, or no sysfs */
  }
  if (IS_MAC) {
    try {
      const out = await sh("pmset", ["-g", "batt"]);
      const m = /(\d+)%;\s*([^;)]+)/.exec(out);
      if (m) return `Battery: ${m[1]}%${m[2] ? ` (${m[2].trim().toLowerCase()})` : ""}`;
    } catch { /* ignore */ }
  }
  return "Battery: no battery here.";
}

function memoryInfo() {
  const gb = (n) => (n / 1024 ** 3).toFixed(1);
  const used = os.totalmem() - os.freemem();
  return `Memory: ${gb(used)} GB used of ${gb(os.totalmem())} GB (${gb(os.freemem())} GB free).`;
}

async function diskInfo() {
  if (IS_WIN) return "Disk: open Explorer to check free space.";
  try {
    const out = await sh("df", ["-h", "/", HOME]);
    const rows = [];
    const seen = new Set();
    for (const line of out.trim().split("\n").slice(1)) {
      const parts = line.trim().split(/\s+/);
      const mount = parts[parts.length - 1];
      if (!parts[1] || seen.has(mount)) continue;
      seen.add(mount);
      rows.push(`${mount}: ${parts[3]} free of ${parts[1]} (${parts[4]} used)`);
    }
    return `Disk: ${rows.join(" · ")}`;
  } catch {
    return "Disk: could not read free space.";
  }
}

function cpuInfo() {
  const cpus = os.cpus();
  const load = os.loadavg().map((n) => n.toFixed(2)).join(" / ");
  return `CPU: ${(cpus[0]?.model || "unknown").trim()} ×${cpus.length}, load ${load}.`;
}

function uptimeInfo() {
  let s = Math.round(os.uptime());
  const d = Math.floor(s / 86400);
  s %= 86400;
  const h = Math.floor(s / 3600);
  s %= 3600;
  return `Uptime: ${d ? `${d}d ` : ""}${h ? `${h}h ` : ""}${Math.floor(s / 60)}m.`;
}

const DANGEROUS_CMD = new RegExp(
  [
    "(^|[\\s;&|])(sudo|su|doas|rm|rmdir|shred|dd|mkfs(\\.\\w+)?|fdisk|parted|wipefs|",
    "poweroff|reboot|shutdown|halt|kill|killall|pkill|chmod|chown|chattr|",
    "systemctl|pacman|apt|apt-get|dnf|yum|zypper|snap|flatpak|docker|podman|",
    "iptables|nft|ufw|mount|umount|git)\\b",
    "|(curl|wget)[^|]*\\|\\s*(ba|z|da)?sh\\b",
    "|>\\s*\\/(dev|etc|boot|usr|bin|sbin)\\b",
    "|git\\s+(reset\\s+--hard|clean\\s+-[a-z]*f|push\\s+.*--force)",
  ].join(""),
  "i"
);

function cmdPrefix(command) {
  const words = command.trim().split(/\s+/);
  return words.slice(0, Math.min(3, words.length)).join(" ");
}

function matchAllowedCommand(command) {
  return (cfgmod.get().allowCommands || []).some(
    (prefix) => command === prefix || command.startsWith(prefix + " ")
  );
}

/* ---------------- file tools ---------------- */

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".cache", ".local", ".mozilla", ".config", "dist", "build",
  "target", ".venv", "venv", "__pycache__", ".next", ".nuxt", "coverage", "Trash",
  ".Trash", "vendor", ".gradle", ".cargo", "snap", "proc", "sys", "dev", "run",
]);

async function walk(root, maxDepth) {
  const out = [];
  async function rec(dir, depth) {
    if (out.length > 6000) return;
    let entries;
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length > 6000) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < maxDepth && !SKIP_DIRS.has(e.name)) await rec(full, depth + 1);
      } else if (e.isFile()) {
        out.push(full);
      }
    }
  }
  await rec(root, 0);
  return out;
}

async function isProbablyBinary(file) {
  try {
    const fh = await fsp.open(file, "r");
    const buf = Buffer.alloc(4096);
    const { bytesRead } = await fh.read(buf, 0, 4096, 0);
    await fh.close();
    return buf.subarray(0, bytesRead).includes(0);
  } catch {
    return true;
  }
}

/* ---------------- html / web helpers ---------------- */

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

function htmlToText(html) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  s = decodeEntities(s)
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title: decodeEntities(title).trim(), text: s };
}

async function fetchText(url) {
  let u;
  try { u = new URL(url); } catch { throw new Error("that doesn't look like a valid URL"); }
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("only http/https URLs are supported");
  const res = await fetch(u.href, {
    redirect: "follow",
    signal: AbortSignal.timeout(25000),
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      "Accept-Language": "en",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${u.hostname}`);
  const type = res.headers.get("content-type") || "";
  const raw = await res.text();
  return { type, raw: raw.slice(0, 1_500_000), finalUrl: res.url };
}

async function duckSearch(query) {
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  const { raw } = await fetchText(url);
  const results = [];
  const linkRe = /<a[^>]+class=['"]result-link['"][^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<td[^>]+class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/gi;
  const snippets = [];
  let m;
  while ((m = snippetRe.exec(raw))) snippets.push(m[1]);
  let i = 0;
  while ((m = linkRe.exec(raw))) {
    const snippet = snippets[i++] || "";
    results.push({
      title: htmlToText(m[2]).text,
      url: decodeEntities(m[1]),
      snippet: htmlToText(snippet).text.slice(0, 300),
    });
    if (results.length >= 8) break;
  }
  return results;
}

/* ---------------- tools ---------------- */

const tools = [
  {
    name: "list_dir",
    description: "List the files and folders inside a directory on the user's device.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path. Use ~ for the home directory." },
        depth: { type: "integer", minimum: 1, maximum: 3, description: "How deep to recurse (default 1)." },
      },
      required: ["path"],
    },
    summarize: (a) => `Look inside ${a.path}`,
    policy(a) {
      const p = expand(a.path);
      if (approvedPath(p)) return { level: "auto" };
      return { level: "ask", allow: { kind: "dir", value: p, label: `Always allow in ${p}` } };
    },
    async run(a) {
      const root = expand(a.path);
      const st = await fsp.stat(root).catch(() => null);
      if (!st) throw new Error(`no such folder: ${a.path}`);
      if (!st.isDirectory()) throw new Error(`not a folder: ${a.path}`);
      const depth = Math.max(1, Math.min(3, a.depth || 1));
      const lines = [];
      async function rec(dir, d, prefix) {
        const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
        entries.sort((x, y) => Number(y.isDirectory()) - Number(x.isDirectory()));
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            lines.push(`${prefix}${e.name}/`);
            if (d < depth && !SKIP_DIRS.has(e.name)) await rec(full, d + 1, prefix + "  ");
          } else {
            const s = await fsp.stat(full).catch(() => null);
            lines.push(`${prefix}${e.name}${s ? `  (${s.size} B)` : ""}`);
          }
          if (lines.length > 400) { lines.push("… [more entries not shown]"); return; }
        }
      }
      await rec(root, 1, "");
      return `${root}\n${lines.join("\n") || "(empty)"}`;
    },
  },
  {
    name: "read_file",
    description: "Read a text file from the user's device.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path. Use ~ for the home directory." },
        offset: { type: "integer", description: "Start at this line (1-based)." },
        limit: { type: "integer", description: "Number of lines to read (default 2000)." },
      },
      required: ["path"],
    },
    summarize: (a) => `Read ${a.path}${a.offset ? ` from line ${a.offset}` : ""}`,
    policy(a) {
      const p = expand(a.path);
      if (approvedPath(p)) return { level: "auto" };
      return { level: "ask", allow: { kind: "dir", value: path.dirname(p), label: `Always allow in ${path.dirname(p)}` } };
    },
    async run(a) {
      const p = expand(a.path);
      if (await isProbablyBinary(p)) throw new Error("that looks like a binary file");
      const text = await fsp.readFile(p, "utf8");
      const lines = text.split("\n");
      const offset = Math.max(1, a.offset || 1);
      const limit = Math.max(1, Math.min(4000, a.limit || 2000));
      const slice = lines.slice(offset - 1, offset - 1 + limit);
      return trimText(
        `${p} (${lines.length} lines, showing ${offset}-${offset - 1 + slice.length})\n` +
          slice.map((l, i) => `${offset + i}\t${l}`).join("\n"),
        60000
      );
    },
  },
  {
    name: "write_file",
    description:
      "Create or overwrite a text file on the user's device. Parent folders are created automatically.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to write." },
        content: { type: "string", description: "Full file content." },
      },
      required: ["path", "content"],
    },
    summarize: (a) => `Write ${a.content?.length || 0} chars to ${a.path}`,
    policy(a) {
      const p = expand(a.path);
      const sensitive = /(^|\/)(\.ssh|\.gnupg|\.config|\.local\/share\/keyrings)(\/|$)/.test(p);
      if (sensitive || !inside(HOME, p)) {
        return { level: "danger" };
      }
      if (approvedPath(p)) return { level: "auto" };
      return { level: "ask", allow: { kind: "dir", value: path.dirname(p), label: `Always allow in ${path.dirname(p)}` } };
    },
    async run(a) {
      const p = expand(a.path);
      const content = String(a.content ?? "");
      if (content.length > 600_000) throw new Error("content is too large (600 KB max)");
      await fsp.mkdir(path.dirname(p), { recursive: true });
      await fsp.writeFile(p, content, "utf8");
      return `wrote ${content.length} chars to ${p}`;
    },
  },
  {
    name: "search_files",
    description:
      "Search file names and contents under a folder. Useful for 'where is my X' questions.",
    parameters: {
      type: "object",
      properties: {
        root: { type: "string", description: "Folder to search in." },
        pattern: { type: "string", description: "Text or regular expression to look for." },
        glob: { type: "string", description: "Only search files whose name matches this (e.g. *.md)." },
      },
      required: ["root", "pattern"],
    },
    summarize: (a) => `Search for "${a.pattern}" under ${a.root}`,
    policy(a) {
      const p = expand(a.root);
      if (approvedPath(p)) return { level: "auto" };
      return { level: "ask", allow: { kind: "dir", value: p, label: `Always allow in ${p}` } };
    },
    async run(a) {
      const root = expand(a.root);
      const st = await fsp.stat(root).catch(() => null);
      if (!st || !st.isDirectory()) throw new Error(`no such folder: ${a.root}`);
      let re;
      try { re = new RegExp(a.pattern, "i"); } catch { re = new RegExp(a.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); }
      const glob = a.glob ? new RegExp("^" + a.glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i") : null;
      const files = await walk(root, 8);
      const hits = [];
      for (const file of files) {
        if (glob && !glob.test(path.basename(file))) continue;
        if (re.test(path.basename(file))) {
          hits.push(`${file}  [name match]`);
        }
        if (hits.length >= 80) break;
        if (file.includes("/.") && !file.includes("/.config/")) continue;
        let s;
        try { s = await fsp.stat(file); } catch { continue; }
        if (s.size > 2_000_000) continue;
        if (await isProbablyBinary(file)) continue;
        let text;
        try { text = await fsp.readFile(file, "utf8"); } catch { continue; }
        const lines = text.split("\n");
        for (let i = 0; i < lines.length && hits.length < 80; i++) {
          if (re.test(lines[i])) hits.push(`${file}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
        }
        if (hits.length >= 80) break;
      }
      return hits.length ? hits.join("\n") : `No matches for "${a.pattern}" under ${root}`;
    },
  },
  {
    name: "run_command",
    description:
      "Run a shell command on the user's device and return its output. Use for things the other tools can't do.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The command line to run." },
        timeout: { type: "integer", description: "Timeout in seconds (max 120)." },
      },
      required: ["command"],
    },
    summarize: (a) => a.command,
    policy(a) {
      const c = String(a.command || "").trim();
      if (!c) return { level: "danger" };
      if (DANGEROUS_CMD.test(c)) return { level: "danger" };
      if (matchAllowedCommand(c)) return { level: "auto" };
      return { level: "ask", allow: { kind: "cmd", value: cmdPrefix(c), label: `Always allow commands starting with "${cmdPrefix(c)}"` } };
    },
    async run(a) {
      const command = String(a.command || "").trim();
      if (!command) throw new Error("empty command");
      const timeout = Math.min(120, Math.max(1, a.timeout || 30)) * 1000;
      const shell = IS_WIN ? "cmd.exe" : "/bin/bash";
      const args = IS_WIN ? ["/d", "/s", "/c", command] : ["-lc", command];
      return new Promise((resolve, reject) => {
        execFile(shell, args, { timeout, maxBuffer: 8 * 1024 * 1024, cwd: HOME }, (err, stdout, stderr) => {
          const out = trimText(`${stdout || ""}${stderr ? (stdout ? "\n[stderr]\n" : "") + stderr : ""}`, 20000);
          if (err && err.killed) return reject(new Error(`command timed out after ${timeout / 1000}s\n${out}`));
          if (err) return reject(new Error(out || err.message));
          resolve(out || "(no output)");
        });
      });
    },
  },
  {
    name: "fetch_url",
    description: "Fetch a web page and return its readable text. Use this to read articles, docs, etc.",
    parameters: {
      type: "object",
      properties: { url: { type: "string", description: "The http(s) URL to read." } },
      required: ["url"],
    },
    summarize: (a) => `Fetch ${a.url}`,
    policy: () => ({ level: "auto" }),
    async run(a) {
      const { type, raw, finalUrl } = await fetchText(a.url);
      if (type.includes("application/json")) return trimText(raw, 15000);
      if (!type.includes("html") && !type.includes("text") && !type.includes("xml")) {
        throw new Error(`unsupported content type: ${type || "unknown"}`);
      }
      const { title, text } = htmlToText(raw);
      return trimText(`# ${title || finalUrl}\n${finalUrl}\n\n${text}`, 15000);
    },
  },
  {
    name: "web_search",
    description: "Search the web and return the top results (title, URL, snippet).",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Search query." } },
      required: ["query"],
    },
    summarize: (a) => `Search the web for "${a.query}"`,
    policy: () => ({ level: "auto" }),
    async run(a) {
      const results = await duckSearch(a.query);
      if (!results.length) return "No results found.";
      return results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join("\n\n");
    },
  },
  {
    name: "volume",
    description: "Get or change the system volume, or mute it.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["get", "set", "up", "down", "mute"] },
        value: { type: "integer", description: "Volume percent (for action=set)." },
      },
      required: ["action"],
    },
    summarize: (a) => (a.action === "set" ? `Set volume to ${a.value}%` : `${a.action} volume`),
    policy: () => ({ level: "auto" }),
    async run(a) {
      if (IS_MAC) {
        if (a.action === "get") return (await sh("osascript", ["-e", "output volume of (get volume settings)"])) + "%";
        if (a.action === "mute") return await sh("osascript", ["-e", "set volume output muted not (output muted of (get volume settings))"]);
        let v = a.value;
        if (a.action === "up" || a.action === "down") {
          v = Number(await sh("osascript", ["-e", "output volume of (get volume settings)"])) + (a.action === "up" ? 10 : -10);
        }
        await sh("osascript", ["-e", `set volume output volume ${Math.max(0, Math.min(100, v))}`]);
        return `volume set to ${Math.max(0, Math.min(100, v))}%`;
      }
      if (!has("wpctl")) throw new Error("wpctl (PipeWire) not found");
      const sink = "@DEFAULT_AUDIO_SINK@";
      if (a.action === "get") {
        const out = await sh("wpctl", ["get-volume", sink]);
        const m = out.match(/([\d.]+)/);
        return `${m ? Math.round(Number(m[1]) * 100) : "?"}%${/MUTED/i.test(out) ? " (muted)" : ""}`;
      }
      if (a.action === "set") {
        const v = Math.max(0, Math.min(150, Number(a.value || 50)));
        await sh("wpctl", ["set-volume", sink, `${v}%`]);
        return `volume set to ${v}%`;
      }
      if (a.action === "up") { await sh("wpctl", ["set-volume", sink, "5%+"]); return "volume up"; }
      if (a.action === "down") { await sh("wpctl", ["set-volume", sink, "5%-"]); return "volume down"; }
      await sh("wpctl", ["set-mute", sink, "toggle"]);
      return "toggled mute";
    },
  },
  {
    name: "media",
    description: "Control media playback (play/pause, next, previous) or see what's playing.",
    parameters: {
      type: "object",
      properties: { action: { type: "string", enum: ["play-pause", "next", "previous", "status"] } },
      required: ["action"],
    },
    summarize: (a) => `${a.action} media`,
    policy: () => ({ level: "auto" }),
    async run(a) {
      if (IS_MAC) {
        if (a.action === "status") return await sh("osascript", ["-e", 'tell application "System Events" to (name of processes) contains "Music"']);
        const verb = { "play-pause": "playpause", next: "next track", previous: "previous track" }[a.action];
        return (await sh("osascript", ["-e", `tell application "Music" to ${verb}`])) || `${a.action} ok`;
      }
      if (!has("playerctl")) throw new Error("playerctl not found");
      if (a.action === "status") {
        try {
          return await sh("playerctl", ["metadata", "--format", "{{status}}: {{artist}} — {{title}}"]);
        } catch { return "nothing is playing"; }
      }
      await sh("playerctl", [a.action]);
      return `media ${a.action} ok`;
    },
  },
  {
    name: "brightness",
    description: "Get or set the screen brightness.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["get", "set", "up", "down"] },
        value: { type: "integer", description: "Brightness percent (for action=set)." },
      },
      required: ["action"],
    },
    summarize: (a) => (a.action === "set" ? `Set brightness to ${a.value}%` : `${a.action} brightness`),
    policy: () => ({ level: "auto" }),
    async run(a) {
      if (!has("brightnessctl")) throw new Error("brightnessctl not found (install it or set brightness manually)");
      if (a.action === "get") {
        const out = await sh("brightnessctl", ["-m"]);
        const parts = out.split(",");
        return `${parts[parts.length - 1]} brightness`;
      }
      if (a.action === "set") {
        const v = Math.max(1, Math.min(100, Number(a.value || 50)));
        await sh("brightnessctl", ["-q", "set", `${v}%`]);
        return `brightness set to ${v}%`;
      }
      await sh("brightnessctl", ["-q", "set", a.action === "up" ? "+10%" : "10%-"]);
      return `brightness ${a.action}`;
    },
  },
  {
    name: "clipboard",
    description: "Read from or write to the system clipboard.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["read", "write"] },
        text: { type: "string", description: "Text to copy (for action=write)." },
      },
      required: ["action"],
    },
    summarize: (a) => (a.action === "write" ? `Copy ${a.text?.length || 0} chars to the clipboard` : "Read the clipboard"),
    policy: (a) => ({ level: a.action === "write" ? "ask" : "auto", allow: { kind: "tool", value: "clipboard", label: "Always allow clipboard writes" } }),
    async run(a) {
      if (a.action === "read") {
        if (IS_MAC) return (await sh("pbcopy".replace("copy", "paste"))) || "(clipboard is empty)";
        if (has("wl-paste")) {
          try { return (await sh("wl-paste", ["--no-newline"])) || "(clipboard is empty)"; }
          catch { return "(clipboard is empty)"; }
        }
        if (has("xclip")) return (await sh("xclip", ["-selection", "clipboard", "-o"])) || "(clipboard is empty)";
        throw new Error("no clipboard tool found");
      }
      if (IS_MAC) { await shInput("pbcopy", [], a.text || ""); return "copied"; }
      if (has("wl-copy")) { await shInput("wl-copy", [], a.text || ""); return "copied"; }
      if (has("xclip")) { await shInput("xclip", ["-selection", "clipboard"], a.text || ""); return "copied"; }
      throw new Error("no clipboard tool found");
    },
  },
  {
    name: "notify",
    description: "Show a desktop notification to the user.",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "Notification body." },
        title: { type: "string", description: "Notification title (defaults to the buddy's name)." },
      },
      required: ["message"],
    },
    summarize: (a) => `Show a notification: ${a.message?.slice(0, 60)}`,
    policy: () => ({ level: "auto" }),
    async run(a) {
      const title = a.title || cfgmod.get().appearance.name || "Bobby";
      if (IS_MAC) {
        const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        await sh("osascript", ["-e", `display notification "${esc(a.message)}" with title "${esc(title)}"`]);
        return "notification shown";
      }
      await sh("notify-send", ["-a", title, title, a.message]);
      return "notification shown";
    },
  },
  {
    name: "open_url",
    description: "Open a URL in the user's default browser.",
    parameters: {
      type: "object",
      properties: { url: { type: "string", description: "http(s) URL to open." } },
      required: ["url"],
    },
    summarize: (a) => `Open ${a.url}`,
    policy: (a) => {
      try {
        const u = new URL(a.url);
        return ["http:", "https:"].includes(u.protocol) ? { level: "auto" } : { level: "danger" };
      } catch { return { level: "danger" }; }
    },
    async run(a) {
      const u = new URL(a.url);
      if (!["http:", "https:"].includes(u.protocol)) throw new Error("only http(s) URLs can be opened");
      if (IS_MAC) await sh("open", [u.href]);
      else if (IS_WIN) await sh("cmd", ["/c", "start", "", u.href]);
      else await sh("xdg-open", [u.href]);
      return `opened ${u.hostname}`;
    },
  },
  {
    name: "read_notes",
    description: "Read your own long-term notes/memory file.",
    parameters: { type: "object", properties: {} },
    summarize: () => "Read my own notes",
    policy: () => ({ level: "auto" }),
    async run() {
      return trimText(cfgmod.readNotes() || "(my notes are empty)", 20000);
    },
  },
  {
    name: "append_notes",
    description: "Append something to your own long-term notes/memory file. Use it to remember things for later.",
    parameters: {
      type: "object",
      properties: { text: { type: "string", description: "Text to remember." } },
      required: ["text"],
    },
    summarize: (a) => `Remember: ${a.text?.slice(0, 80)}`,
    policy: () => ({ level: "auto" }),
    async run(a) {
      cfgmod.appendNotes(String(a.text || ""));
      return "noted";
    },
  },
  {
    name: "set_reminder",
    description:
      "Set a reminder for the user. It fires later as a speech bubble plus a desktop notification. Give in_minutes (a number) or at (a clock time).",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "What to remind the user about." },
        in_minutes: { type: "number", description: "Fire this many minutes from now." },
        at: { type: "string", description: 'Local time: "15:30", "3pm", or an ISO date-time like "2026-10-20T09:00".' },
      },
      required: ["text"],
    },
    summarize: (a) => `Remind me${whenLabel(a)}: ${a.text?.slice(0, 70)}`,
    policy: () => ({ level: "auto" }),
    async run(a) {
      const due = parseWhen(a);
      const r = reminders.add({ text: a.text, due });
      return `Reminder set for ${fmtWhen(due)} (id ${r.id}): ${r.text}`;
    },
  },
  {
    name: "list_reminders",
    description: "List the user's pending reminders with their ids and due times.",
    parameters: { type: "object", properties: {} },
    summarize: () => "Check my reminders",
    policy: () => ({ level: "auto" }),
    async run() {
      const list = reminders.pending();
      if (!list.length) return "No reminders waiting.";
      return list.map((r) => `${r.id} · ${fmtWhen(r.due)} · ${r.text}`).join("\n");
    },
  },
  {
    name: "cancel_reminder",
    description: "Cancel a pending reminder — pass the id from list_reminders, or some of its text.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Reminder id, if you know it." },
        text: { type: "string", description: "Text to match a reminder by." },
      },
    },
    summarize: (a) => `Cancel reminder ${a.id || a.text || ""}`.trim(),
    policy: () => ({ level: "auto" }),
    async run(a) {
      if (a.id && reminders.cancel(a.id)) return "reminder cancelled";
      if (a.text) {
        const hit = reminders.cancelByText(a.text);
        if (hit) return `cancelled reminder "${hit.text}"`;
      }
      throw new Error("no matching reminder found — try list_reminders");
    },
  },
  {
    name: "system_info",
    description: "Facts about this computer: battery, memory, disk space, CPU load, uptime.",
    parameters: {
      type: "object",
      properties: {
        what: {
          type: "string",
          enum: ["battery", "memory", "disk", "cpu", "uptime", "all"],
          description: "Which fact to look up (default all).",
        },
      },
    },
    summarize: (a) => `Check ${a.what || "all"}`,
    policy: () => ({ level: "auto" }),
    async run(a) {
      const what = a.what || "all";
      const out = [];
      if (what === "battery" || what === "all") out.push(await batteryInfo());
      if (what === "memory" || what === "all") out.push(memoryInfo());
      if (what === "disk" || what === "all") out.push(await diskInfo());
      if (what === "cpu" || what === "all") out.push(cpuInfo());
      if (what === "uptime" || what === "all") out.push(uptimeInfo());
      return out.join("\n");
    },
  },
];

const byName = new Map(tools.map((t) => [t.name, t]));

function schemas() {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

function get(name) {
  return byName.get(name);
}

module.exports = { tools, get, schemas };
