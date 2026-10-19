// Island entry point. Wires the Mochi canvas, the pill row, and the Tauri IPC
// together. The whole thing is intentionally dependency-free (no framework);
// the only runtime import is @tauri-apps/api for IPC, and even that degrades
// to no-ops in `npm run dev` so the front end can be inspected in a browser.

import { Mochi, type MochiMood } from "./mochi";
import { PillRow } from "./pills";
import { answerHook, onHookRequest } from "./ipc";

const island = document.getElementById("island") as HTMLElement;
const canvas = document.getElementById("mochi") as HTMLCanvasElement;
const pillsRoot = document.getElementById("pills") as HTMLElement;

const mochi = new Mochi(canvas);
const pills = new PillRow(pillsRoot);

// The island is only animated while something is on screen; when nothing is
// pending, Mochi dozes and the rAF loop stops, keeping idle CPU at zero.
function syncLife(): void {
  const active = pills.size() > 0;
  island.classList.toggle("expanded", active);
  const mood: MochiMood = active ? "worried" : "idle";
  mochi.setMood(mood);
  if (active) mochi.start();
  else mochi.stop();
}

// We also stop drawing when the window itself becomes hidden (minimised,
// workspace switched, screen off) and resume on visibilitychange. This is the
// same contract rule 5 asks for on the Mac side.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) mochi.stop();
  else syncLife();
});

pills.onAction(async ({ pillId, action }) => {
  const req = pending.get(pillId);
  if (!req) return;
  if (action === "approve" || action === "deny") {
    try {
      await answerHook(req.requestId, action);
    } finally {
      pending.delete(pillId);
      pills.remove(pillId);
      syncLife();
    }
  }
});

const pending = new Map<string, { requestId: string }>();

void onHookRequest((req) => {
  pending.set(req.pillId, { requestId: req.requestId });
  pills.set({
    id: req.pillId,
    kind: "approve",
    label: req.label,
    requestId: req.requestId,
  });
  syncLife();
});

syncLife();
