# bobby
## My mental model: four parts

```
   ┌─────────────┐   always-on-top, click-through overlay window
   │  1. HOME    │   placement, notch-snapping, profiles, multi-monitor
   └──────┬──────┘
          │
   ┌──────▼──────┐   eyes, expressions, states (idle/thinking/talking/...)
   │  2. FACE    │   the entire reason this project exists
   └──────┬──────┘
          │
   ┌──────▼──────┐   my API key → streaming LLM → persona + memory
   │  3. BRAIN   │   keychain storage, provider swap, local model support
   └──────┬──────┘
          │
   ┌──────▼──────┐   tools: files, shell, system, apps, screenshots, web
   │  4. HANDS   │   approve-once / always-allow / deny + kill switch + audit log
   └─────────────┘
```

The face is what you see, the brain is what it thinks with, the hands are how it changes
anything, and the home is where it sits. Every feature in `PROMPT.md` maps to one of those.

## Decisions I made on your behalf (challenge any of them)

1. **Tauri over Electron** — a widget that's on screen all day shouldn't eat 300MB of RAM.
   Electron is fine too if speed-to-working matters more.
2. **Consent cards for every device action** — "do stuff on my device" is powerful and scary.
   I made the permission layer first-class (approve once / always allow / deny, plus a kill
   switch and audit log) instead of an afterthought, because an unattended agent with shell
   access is how you lose a Downloads folder.
3. **Click-through when idle** — the ball must never block clicks on whatever is under it,
   otherwise it becomes annoying within a day and you'd quit the app.
4. **Short, cheeky default persona** — a buddy on your screen, not an essay machine.
5. **Budget guard** — runaway loops burn API keys; a daily cap is cheap insurance.

## Things I deliberately did NOT decide — these need you

- **Platform + notch:** macOS (most likely, given "notch"), or do you want it cross-platform?
  Does your display actually have a notch, or is "notch" just the vibe?
- **Which AI provider** you want first, and whether local models (Ollama) matter to you.
- **How much autonomy:** should it be allowed to run safe commands without asking? My default is
  "balanced" — allowlist plus confirm everything else.
- **"Top priority"** — if you actually meant *this build is urgent*, tell me and I'll trim the
  scope to a walkable skeleton first (ball on screen + one API call) and layer on from there.
- **Screen awareness:** should it be able to see my screen when I ask (screenshot tool), or is
  that a hard no?
- **Sound:** little blips and squeaks, or silent?

## How to use these files

1. Read this file, correct my misunderstandings.
2. Hand `PROMPT.md` to a coding agent (or me) — it opens by asking you the questions from the
   section above, then builds.
3. The checklist at the bottom of `PROMPT.md` is "done".
