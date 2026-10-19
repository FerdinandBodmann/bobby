# bobby

A tiny bean who lives at the top of your screen. He looks like `art/booby.svg` (that's the
artwork this build is based on: grey-to-blue body ramp, two dark oval eyes), watches your cursor with
his eyes, blinks, bobs, and talks back through a speech bubble.

He has a real brain — your API key, your choice of provider (OpenAI, Anthropic, OpenRouter, Groq,
Mistral, Gemini, DeepSeek, xAI, Together, Perplexity, or your own local server) — and hands: files,
shell, web, clipboard, volume/brightness/media, reminders, notifications, and his own memory file.
Nothing he does on your device happens without passing a consent gate first.

```
npm install
npm start
```

On first run the settings window opens: pick a provider, set a key (or leave it empty for local
Ollama), hit **Test**, save. Then double-click Bobby to open the chat.

He'll also nap if you leave him alone for a few minutes (hover or poke to wake him), and you can
ask him things like *"remind me to stretch in 20 minutes"* or *"how much disk space do I have
left?"*.

---

## What's in the box

```
src/
  main.js        app lifecycle, windows, tray, global shortcuts, IPC
  overlay.js     the buddy window, speech bubble, consent card, placement
  agent.js       the tool-calling loop, chat history, system prompt
  llm.js         streaming clients: OpenAI-compatible + Anthropic
  tools.js       every tool: schema, safety policy, implementation
  permissions.js the consent gate — approve once / always / deny, audit log
  config.js      settings, API key storage, audit + notes files
  preload.js     the only bridge between windows and main
  renderer/
    buddy/       the bean itself: shape, moods, blink, eye tracking, sounds
    bubble/      speech bubble (separate always-click-through window)
    chat/        chat with streaming text and tool/consent cards
    settings/    brain / persona / look / freedom / placement / data tabs
    consent/     the little "Bobby needs your ok" card
scripts/
  cdp.js         drive the running app over the DevTools protocol (testing)
  gen-icon.js    regenerate app + tray icons from the artwork (pure Node)
```

## Using Bobby

| gesture | result |
|---|---|
| drag the bean | move him (position is remembered, per monitor) |
| click | poke — he reacts with a quip |
| double-click | open the chat |
| right-click | tray-style menu |

Global shortcuts (also in the tray menu):

| shortcut | result |
|---|---|
| `Ctrl/Cmd+Alt+B` | show/hide the bean |
| `Ctrl/Cmd+Alt+K` | kill switch — turn all tools off/on |
| `Ctrl/Cmd+Alt+Space` | open the chat |

## Providers

- **Ollama (local)** — `http://localhost:11434/v1`, no key needed. `qwen2.5:0.5b` and
  `granite4:latest` work well; tools need a model that emits real tool calls.
- **LM Studio / llama.cpp / vLLM** — local presets, no key, just point them at the port.
- **OpenAI**, **Anthropic** — key required.
- **OpenRouter**, **Groq**, **Mistral**, **Google Gemini**, **DeepSeek**, **xAI**, **Together**,
  **Perplexity** — cloud presets with a key.
- **Custom (OpenAI-compatible)** / **Custom (Anthropic-compatible)** — anything else, including
  proxies.

The **list** button next to *Model* asks whichever provider you've picked for its model list
(`/models`, Anthropic's `/v1/models`, or Ollama's `/api/tags`) using your saved key, and drops
them into the datalist so you can pick instead of typing.

Keys are stored with Electron's `safeStorage`. If the OS keyring isn't available (common on
minimal Wayland boxes) it falls back to base64 with a `b64:` prefix — that's obfuscation, not
encryption. Treat `config.json` as containing a secret if you're on the fallback.

## Safety model

1. Every tool call goes through `permissions.execute()`. There is no other path to the device.
2. Autonomy level decides what happens before the call:
   - **strict** — ask for everything
   - **balanced** (default) — the tool's own policy decides: reads of approved folders and a
     few harmless reads run automatically, anything that writes or executes asks
   - **loose** — auto-run everything that isn't marked dangerous
3. "Always allow" persists the grant: a folder (`approvedDirs`), a command prefix
   (`allowCommands`), or a whole tool (`alwaysAllowTools`).
4. Dangerous tools (e.g. `write_file`) always ask, no matter the mode. Internet tools are
   gated separately by **web access** in settings.
5. Consent times out after 90s and denies. `Ctrl/Cmd+Alt+K` or the ✋ button is a hard kill
   switch: `toolsEnabled: false` blocks everything instantly.
6. Every decision — auto, approved, denied, failure — is written to `audit.log` with the
   arguments, outcome and duration. Settings has a tab to read it.

## Tools

| group | tools | notes |
|---|---|---|
| files | `list_dir`, `read_file`, `write_file`, `search_files` | writes limited to approved folders unless approved once |
| shell | `run_command` | prefix allowlisted; always asks otherwise |
| web | `fetch_url`, `web_search`, `open_url` | search goes through DuckDuckGo lite; needs web access on |
| system | `volume`, `brightness`, `media`, `clipboard` | Linux backends: `wpctl`, `brightnessctl`, `playerctl`, `wl-clipboard` |
| apps | `notify`, `open_url` | `notify-send` |
| memory | `read_notes`, `append_notes` | his own `notes.md`, always allowed |
| time | `set_reminder`, `list_reminders`, `cancel_reminder` | fires a speech bubble + desktop notification; reminders persist across restarts |
| machine | `system_info` | battery, memory, disk, CPU load, uptime (Node's `os` + `df`, so it's portable) |

Linux is where this was built and tested. The file, shell, web and notes tools are
cross-platform; the system tools are wired to Wayland/Linux commands and will fail cleanly
elsewhere. Screenshot/screen-reading is deliberately not in v1.

## Where things live

```
~/.config/notch-buddy/
  config.json   settings, placement, always-allow grants, chat history, encrypted key
  audit.log     one JSON line per tool call
  notes.md      Bobby's own memory
```

`PROMPT.md` is the original build brief; this README describes what actually got built.

## Regenerating the icons

```bash
npm run icons
```

`scripts/gen-icon.js` draws the bean from `art/booby.svg` (body proportions, eye geometry,
palette `#9797B4` → `#726FCF` → `#4C47EA`, eyes at 42% black) into `assets/icon-*.png` with no image
libraries — just zlib.

## Developing / testing the running app

```bash
BOBBY_DEBUG=1 npx electron . --remote-debugging-port=9222
node scripts/cdp.js --list                       # which windows are up
node scripts/cdp.js buddy --eval 'document.title'
node scripts/cdp.js buddy --shot /tmp/bobby.png  # screenshots of the overlay
```

`BOBBY_DEBUG` adds dev-only IPC: `dev:runTool` (run a tool through the real consent gate),
`dev:setTools`, `dev:info` (window bounds, data paths).

### Troubleshooting

- **`npm install` finishes but `npx electron .` can't find the binary** — the Electron postinstall
  download sometimes fails silently. Fix it manually:
  ```bash
  node node_modules/electron/install.js
  unzip ~/.cache/electron/*/electron-v33.4.11-linux-x64.zip -d node_modules/electron/dist
  printf 'electron' > node_modules/electron/path.txt
  ```
- **Nothing renders / transparent window is blank** — you need a compositor for the transparent,
  always-on-top overlay. On Wayland it runs natively; on X11 make sure XWayland compositing is on.
- **Key stored as `b64:`** — no keyring available; see the `safeStorage` note above.
- **He never uses tools with a tiny local model** — the model has to support tool calls.
  `granite4:latest` does; a 0.5B model may just answer in prose.
