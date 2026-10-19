# bobby — how I understood this project

Hi! This is my read of what you asked for, written down so you can correct me before any code
exists. `PROMPT.md` is the actual build brief — this file is the "why" behind it.

## Your words → what I made of them

| You said | What I understood |
|---|---|
| *"a little 'notch buddy'"* | A tiny companion widget that lives in the notch area of a laptop screen — the little black cutout that's otherwise dead space. |
| *"basically a customizable little ball"* | The buddy is a **ball**, not a character sprite or a cat. Round, squashy, and its look (color, size, accessories, name) is user-configurable. |
| *"lives in the top of my screen (or customizable where it actually is)"* | Default = top-center against the notch, but placement is free: drag it, snap it to edges/corners, save named positions, keep it on the right monitor. |
| *"link it to my ai api key"* | Bring-your-own-key. You pick the provider (OpenAI / Anthropic / local model / any compatible endpoint), paste the key, it lives in the OS keychain. |
| *"have it do stuff on my device"* | This is the big one: the LLM gets **tool access** — files, shell commands, system controls, opening apps, screenshots. Not just chat. |
| *"have internet access"* | It can fetch URLs and search the web on request. |
| *"and top priotory"* | I read this two ways: **(a)** the window is always-on-top, and **(b)** this project is a top priority for you — quick to start, no fuss. I wrote (a) into the prompt as a feature; (b) is why there's no scaffolding debate, just the brief. |
| *"it should be cute :sob:"* | The single hardest requirement. Expressions, blinking, squash-and-stretch, poke reactions, a name. If it's ugly, the project failed. |
| *"make the prompt in PROMPT.md"* | You wanted a hand-off document — something you can throw at a coding agent (me or another) and get the thing built. |
| *"README.md where you explain the project from your view"* | You want to check my understanding first. So: here's my model, here are my assumptions, tell me where I'm wrong. |

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
