# bobby — Coucou, from scratch

A fresh implementation of the Coucou spec in `PROMPT.md`. Linux-first (this box
is Arch/CachyOS with webkit2gtk-4.1 and gtk-layer-shell available); the layout
leaves room for Windows and the other platforms later without reshuffling.

## Layout

```
bobby/
  PROMPT.md         source of truth (the user's brief)
  windows/          Tauri 2 app for Linux + Windows (name kept to match PROMPT.md)
    src/            front end: no framework, Canvas 2D for Mochi
    src-tauri/      Rust backend: window, layer-shell on Linux, hook socket
    hook/           coucou-hook: the ~300 ms relay the agents' hooks call
    package.json
    Cargo.toml      workspace
  README.md
```

## Build

```bash
cd windows
npm install
# on this Arch box only, so the Debian-style linker name doesn't trip rustc:
export CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER=cc
npm run tauri dev
```

## Hard rules (from PROMPT.md, kept literally)

1. Never block the agent CLI — the hook has a ~300 ms budget and exits `{}`
   (or `"ask"` for Copilot) when the island isn't listening.
2. Never overwrite user config blindly: dated backup → merge → diff → confirm.
3. No silent actions: every approval needs an explicit click.
4. Secrets in Secret Service (Linux) / Credential Manager (Windows), never on
   disk, never in git, never in the front end.
5. 0 % CPU when the island is hidden.
6. Bundle id `fr.louisraille.coucou`, pill IDs are stable contracts.
7. No restyling what ships; new views only.
8. Mochi is drawn in code (Canvas + requestAnimationFrame), no images.
