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
<<<<<<< HEAD
=======
  shared/
    cosmetics.js the wardrobe: every cosmetic's SVG and where it sits on the bean
>>>>>>> 28c608d (0.1)
  renderer/
    buddy/       the bean itself: shape, moods, blink, eye tracking, sounds
    bubble/      speech bubble (separate always-click-through window)
    chat/        chat with streaming text and tool/consent cards
    settings/    brain / persona / look / freedom / placement / data tabs
    consent/     the little "Bobby needs your ok" card
scripts/
  cdp.js         drive the running app over the DevTools protocol (testing)
<<<<<<< HEAD
=======
  trigger.js     poke a running instance: looks, moods, naps (testing)
>>>>>>> 28c608d (0.1)
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

<<<<<<< HEAD
=======
## Where he sits

Drag him anywhere and he remembers, per monitor. If you'd rather he wasn't taking up
room, turn on **Hide at the top of the screen** (right-click him, or the tray menu):
he parks at the top-middle of the display so only a sliver of his head shows, and
slides down when your mouse reaches that edge. Anything you do — a bubble, a
question, a cosmetic change — brings him out too. Drag him down and he stays put.

## Looks

His colour, size and wardrobe are in **Settings → Look**. Click a card and he tries it
on immediately (he'll slide down to show you); nothing is kept until you press
**Save**. The same list lives in his right-click menu and the tray, under *What he
wears* — that's the one-click way to change it.

The wardrobe is `src/shared/cosmetics.js`. Each cosmetic is a small inline SVG pinned
to the bean by fractions of his own box — `cx`/`cy` (0.5, 0.13 = top-middle) at a
`size` that's a fraction of his height — so it scales and stays put at every size,
mood and colour. One decoration at a time, and the default is nothing.

>>>>>>> 28c608d (0.1)
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

<<<<<<< HEAD
=======
`main.js` pins this path explicitly (`app.setPath("userData", …)`) rather than letting
Electron derive it from the app name. Packaging renames the app, and without the pin a
packaged build would come up as a blank first-run profile with your provider, key, chat
and reminders all missing.

>>>>>>> 28c608d (0.1)
`PROMPT.md` is the original build brief; this README describes what actually got built.

## Regenerating the icons

```bash
npm run icons
```

`scripts/gen-icon.js` draws the bean from `art/booby.svg` (body proportions, eye geometry,
palette `#9797B4` → `#726FCF` → `#4C47EA`, eyes at 42% black) into `assets/icon-*.png` with no image
libraries — just zlib.

<<<<<<< HEAD
=======
## Building an app you can double-click

```bash
npm install          # once, to get electron-builder
npm run dist         # AppImage + .deb into dist/
```

| script | what you get |
| --- | --- |
| `npm run dist` | both targets below |
| `npm run dist:appimage` | `dist/Bobby-0.1.0-x86_64.AppImage` — one file, no install. `chmod +x` it and double-click, or drop it in `~/.local/bin`. |
| `npm run dist:deb` | `dist/bobby_0.1.0_amd64.deb` — installs a menu entry and icon system-wide (`sudo dpkg -i` or your software centre). |

The AppImage needs FUSE. On distros that dropped `libfuse2` (Ubuntu 24.04 and friends)
either install it, or run the AppImage with `--appimage-extract-and-run`. The `.deb` has
no such dependency, which is also why it's probably the nicer option if you want him in
your application menu.

Packaged and unpackaged builds share the same `~/.config/notch-buddy` config, so a
settings change made in one shows up in the other. That also means only one of them can
run at a time — Electron's single-instance lock makes the second one hand over to the
first and exit rather than starting a second Bobby.

### If you have AppImageLauncher

On a machine with AppImageLauncher installed (this one), double-clicking the AppImage
does not run it in place: the launcher *moves* it to `~/Applications/` under a
content-ish name, adds an application-menu entry for it, and runs the copy. After that
the menu entry is how you launch him — you can delete `dist/` and he'll still be there.

Two things that follow from that, both worth knowing:

- The AppImage is no longer in `dist/` once you've double-clicked it. Rebuild, or copy
  the new one to `~/Applications/` under the same name, to update the menu entry.
- The launcher relaunches the copy with its own environment, so anything you passed on
  the command line (including an isolated profile, below) is not carried over.

### Testing against a throwaway profile

Setting `BOBBY_USER_DATA` keeps a run away from your real settings, chat log and
reminders — handy for trying something without risking the buddy you actually use:

```bash
BOBBY_USER_DATA=/tmp/bobby-test npm start
BOBBY_USER_DATA=/tmp/bobby-test ./dist/Bobby-0.1.0-x86_64.AppImage
```

An explicitly requested profile also gets its own single-instance lock, so a test
instance can run alongside the real one.

>>>>>>> 28c608d (0.1)
## Developing / testing the running app

```bash
BOBBY_DEBUG=1 npx electron . --remote-debugging-port=9222
node scripts/cdp.js --list                       # which windows are up
node scripts/cdp.js buddy --eval 'document.title'
node scripts/cdp.js buddy --shot /tmp/bobby.png  # screenshots of the overlay
```

`BOBBY_DEBUG` adds dev-only IPC: `dev:runTool` (run a tool through the real consent gate),
<<<<<<< HEAD
`dev:setTools`, `dev:info` (window bounds, data paths).
=======
`dev:setTools`, `dev:info` (window bounds, data paths), `dev:trigger` (looks, moods, naps).

### Poking his looks, moods and naps from the shell

`scripts/trigger.js` drives a running instance over that same port — the quick way to
watch a mood, a cosmetic or a nap behave without digging through the settings UI:

```bash
node scripts/trigger.js sleep                 # doze off right now
node scripts/trigger.js wake                  # wake him + restart the nap clock
node scripts/trigger.js nap 5                 # stay quiet: he naps on his own after 5s
node scripts/trigger.js mood happy --for 3000 # bounce, back to idle after 3s
node scripts/trigger.js color '#E0708F' cosmetic bow scale 1.4
node scripts/trigger.js poke bubble "hi!"     # chained — commands run left to right
node scripts/trigger.js restore               # put the look back the way it was
node scripts/trigger.js info                  # mood, look, window bounds, data dir
```

Moods, pokes and bubbles are instant and leave no trace. Colour, scale, cosmetic, name and
sounds go through `config.json` exactly as the settings window would — the first look change
of a run is remembered, so `restore` puts your old look back (or fix it in Settings → Look).
`nap <seconds>` shortens his real nap clock so you can watch him doze off through the genuine
"left alone" path (he has to be visible and idle); `nap off` puts the five-minute delay back.
Run `node scripts/trigger.js --help` for everything, with examples.
>>>>>>> 28c608d (0.1)

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
