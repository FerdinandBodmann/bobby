# Coucou — AI agent project prompt

You are an AI coding agent working on **Coucou** (repo: `Louis-CFM/coucou`). Paste this
prompt at the start of a session to get full context. Read `CLAUDE.md` in the repo root for
the canonical short version — this prompt expands it.

## What the project is

Coucou is an open-source (MIT code) desktop companion: **Mochi**, a small animated character
who lives in the MacBook notch — or at the top edge of the screen on Windows and Linux — and
surfaces AI coding-agent sessions (Claude Code, Codex, Gemini CLI, Copilot CLI, OpenCode, Amp,
Hermes, Cursor, Muse Code…). From the island the user can approve/deny permissions, answer
`AskUserQuestion`, watch live diffs and steps, chat with AI providers, drop files, and watch
service integrations (GitHub, Stripe, Vercel, Spotify…). Extras: Flow dictation + Notetaker
(Parakeet offline via sherpa-onnx), « OK Coucou » voice assistant, weekly recap, 10 languages,
iPhone app (CloudKit + Live Activities), Android app (local TLS phone link).

Privacy is a feature: no telemetry, no account, secrets only in Keychain / Windows Credential
Manager / Linux Secret Service, network calls only to user-configured services.

## Repo layout

- `NotchBuddy/` — native macOS app (Swift 6, SwiftUI + AppKit, zero third-party deps).
  - `Sources/App/` Mac-only code · `Sources/CoucouKit/` shared with iPhone (BotEngine, outfits,
    pills, diff, models) · `Sources/Phone/`, `Sources/Widgets/`, `Sources/NotificationContent/`
    iPhone app · `Resources/sounds/` the WAV sounds · `project.yml` XcodeGen project
    (**never edit the `.xcodeproj` by hand**).
  - `Sources/CoucouKit/PillCatalog.swift` — single source of truth for pills (IDs, colors,
    categories). Pill IDs are stable contract values.
- `windows/` — the Tauri 2 app (Rust + TypeScript) for **Windows and Linux**:
  `src/` island front end (no framework, Canvas 2D for Mochi) · `src-tauri/` Rust backend
  (window, pipes/sockets, Claude API, pollers, `platform/` for Linux differences) ·
  `hook/` the `coucou-hook` relay that agents' hooks shell out to · `README.md` documents every
  Windows/Linux difference, shortcuts, and the Linux section (layer-shell, portals, MPRIS).
- `linux/arch/` — the Arch packaging: `PKGBUILD` (builds `coucou-git` from the GitHub repo
  with `makepkg`), `coucou.desktop`, and `src/coucou/` (a checkout used as reference).
- `android/` — native Kotlin/Jetpack Compose app, phone link protocol in `docs/ANDROID_LINK.md`.
- `relay/` — stateless Cloudflare Worker forwarding iPhone Live Activity pushes (holds the
  APNs key; must never ship in an app).
- `docs/` — `SPEC.md` and `INTEGRATIONS.md` (French, behaviour source), `AGENTS.md` (generic
  hook integration), HTML pages for GitHub Pages (privacy, terms).
- `design/prototype/notch-buddy.html` — the visual source of truth;
  `design/captures/` — target screenshots.
- `scripts/`, `tests/`, `.github/` — dev tooling, tests, release workflows.

Key docs: root `CLAUDE.md` (agent rules), `README.md` (user-facing + version tables),
`CHANGELOG.md` (release notes), `CONTRIBUTING.md`, `windows/README.md` (differences).

## Build

```bash
# macOS (15+, Xcode 16+, XcodeGen)
cd NotchBuddy && xcodegen && xcodebuild -scheme NotchBuddy -configuration Debug build
./scripts/dev-install.sh          # day-to-day signed install to /Applications

# Windows / Linux (Rust + Node 20+; Linux needs webkit2gtk-4.1, gtk-layer-shell,
# libayatana-appindicator dev packages — see windows/README.md#linux)
cd windows && npm install
npm run tauri dev                 # live-reload dev
npm run pack                      # installers land in windows/release/
npm run dev                       # front end in a browser (island looks only)
npm run icons                     # regenerate icons from scripts/gen-icons.mjs

# Arch package
cd linux/arch && makepkg -si      # options=('!lto' '!debug') — LTO makes the Rust build very slow

# Android (JDK 17, SDK 35)
cd android && ./gradlew assembleDebug
```

i18n: translations live in `NotchBuddy/Resources/Localizable.xcstrings`; for the Tauri app run
`node windows/scripts/gen-strings.mjs` to regenerate `windows/src/i18n/strings.json`, with
`windows/src/i18n/extra.json` for strings only Windows/Linux show. Strings are keyed by the
English text.

## Hard rules (never break these)

1. **Never block the agent CLI.** `coucou-hook` has a ~300 ms budget; if Coucou is closed or
   slow it exits with no decision (`{}`, `"ask"` for Copilot) so the agent asks in its own
   terminal exactly as without Coucou.
2. **Never overwrite the user's config blindly.** `~/.claude/settings.json` (and the other
   agents' files): dated backup → merge → show the diff → write only after explicit
   confirmation. Uninstall removes only Coucou's entries. Symlinked configs (dotfiles) are
   written through to the target, permissions kept.
3. **No silent actions.** Never send an email, post a message, or approve a Claude Code/Codex
   permission without an explicit user click. Approvals are bound to the exact request the
   app is waiting on.
4. **Privacy.** Secrets only in Keychain / Credential Manager / Secret Service — never on disk,
   never in git, never in the UI (the front end may only ask whether a key exists). No
   telemetry. No network except to services the user configured. Never log keys or file
   contents.
5. **Performance.** 0 % CPU when the island is hidden; pollers paused when nobody is watching;
   sleeping Mochi costs a few frames per second.
6. **Stability contracts.** Keep bundle IDs (`fr.louisraille.NotchBuddy`, portal name
   `fr.louisraille.coucou` on Linux). Never rename an existing pill ID (Keychain, UserDefaults,
   hook routing depend on them).
7. **Don't restyle what ships.** Existing pills, cards, Settings and chat stay as they are in
   `main` (the App Store build). New views follow the app style, using
   `design/prototype/notch-buddy.html` and `design/captures/` as reference — never as excuse
   to change existing views.
8. **macOS stack.** Swift 6, SwiftUI + AppKit, no third-party dependencies unless truly
   unavoidable. Mochi is drawn in code (`Canvas` + `TimelineView`), no Rive/Lottie/images —
   the Tauri and Android ports mirror the same shapes and timings.
9. **Releases.** Each release adds a `CHANGELOG.md` section, a row in the README Versions
   tables (macOS `v*`, Windows `windows-v*` + Linux `linux-v*`, Android `android-v*`), and
   commits the regenerated Info.plist with the new version.

## Platform notes you'll hit

- **Linux**: island is a gtk-layer-shell overlay on COSMIC/KDE/Hyprland/Sway; GNOME falls back
  to an XWayland dock window (`COUCOU_X11`, `COUCOU_DOCK`, `COUCOU_LAYER_SHELL` env overrides).
  Global shortcuts use X11 key grabs or the XDG GlobalShortcuts portal on Wayland. Hooks go
  over a Unix socket at `$XDG_RUNTIME_DIR/coucou.sock`; the relay binary is copied to
  `~/.local/share/coucou/bin/` at launch. Spotify via MPRIS. Files: config in
  `~/.config/coucou/`, log and `recap.json` in `~/.local/share/coucou/`.
- **Arch packaging** (`linux/arch/PKGBUILD`): `pkgname=coucou-git`, version derived from
  `windows/Cargo.toml` + git rev-count, builds `npx tauri build --no-bundle`, installs
  `/usr/bin/coucou`, `/usr/bin/coucou-hook`, the `.desktop` file and icons. Depends on
  webkit2gtk-4.1, gtk3, gtk-layer-shell, libayatana-appindicator, gstreamer plugins.
- **Windows**: hooks via `coucou-hook.exe` + named pipe to `%LOCALAPPDATA%\Coucou\bin\`;
  keys in Credential Manager; shortcuts are `Ctrl+Alt+*` chosen to avoid AltGr collisions on
  European layouts.
- **Agent integrations** are hook-based (Claude Code, Codex, Copilot, Muse, Gemini, Antigravity,
  Cursor) or plugin-based (OpenCode → `~/.config/opencode/plugins/coucou.js`, Amp, Hermes). The
  relay maps each agent's event names onto Claude Code's and answers in each agent's expected
  format. See `docs/AGENTS.md` and `windows/README.md#supported-agents`.

## How to work

1. Read `CLAUDE.md`, then the platform README for the code you're touching
   (`windows/README.md`, `docs/SPEC.md`, `docs/AGENTS.md`).
2. Match the existing style exactly — this project values handcrafted, dependency-light,
   privacy-first code with detailed prose comments in commits/docs (the maintainer writes in
   English; `docs/SPEC.md` is in French).
3. Before changing UI, check `design/prototype/notch-buddy.html` and `design/captures/`.
4. Test the failure path: what happens when Coucou is closed, slow, or the user never clicks?
   The answer must always be "the agent CLI continues exactly as before".
5. For releases, follow rule 9 and update every affected table.
