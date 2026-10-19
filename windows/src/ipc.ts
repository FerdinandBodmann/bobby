// Thin wrapper around the Tauri IPC so the rest of the front end doesn't need
// to import Tauri in every file (and so the browser-only `npm run dev` mode,
// used for island look-only work, degrades gracefully instead of crashing).

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface HookRequest {
  // Which running agent asked (stable pill id, e.g. "claude-code", "codex").
  agent: string;
  // The pill id that should show up in the island.
  pillId: string;
  // Freeform human-facing label; the Rust side already translated it.
  label: string;
  // Correlation id — the island's answer must carry the same value.
  requestId: string;
}

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function answerHook(
  requestId: string,
  decision: "approve" | "deny",
): Promise<void> {
  if (!inTauri) return;
  await invoke("answer_hook", { requestId, decision });
}

export async function onHookRequest(
  fn: (req: HookRequest) => void,
): Promise<UnlistenFn> {
  if (!inTauri) return () => undefined;
  return listen<HookRequest>("hook://request", (e) => fn(e.payload));
}
