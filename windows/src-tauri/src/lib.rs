//! Coucou — the Rust side of the Linux/Windows island.
//!
//! Layout:
//!   - `hook_server`: Unix-socket (Linux) / named-pipe (Windows later) listener
//!     that `coucou-hook` connects to. Every request is forwarded to the
//!     front end as a `hook://request` event. The front end answers through
//!     the `answer_hook` IPC command; the answer is routed back on the same
//!     socket within the ~300 ms budget (PROMPT.md rule 1).
//!   - `platform`: thin per-OS adapter for window placement. On Linux we
//!     attach gtk-layer-shell to pin the WebView to the top edge of the
//!     screen (the "notch" on screens that don't have one); on anything else
//!     we fall back to a plain always-on-top window.
//!   - `state`: a tiny registry mapping outstanding request ids to the
//!     oneshot channel that will deliver the user's decision back to the
//!     socket handler.

mod hook_server;
mod platform;
mod state;

use state::PendingState;
use tauri::{Emitter, Manager};

#[derive(Clone, serde::Serialize)]
struct HookRequest {
    agent: String,
    #[serde(rename = "pillId")]
    pill_id: String,
    label: String,
    #[serde(rename = "requestId")]
    request_id: String,
}

#[tauri::command]
async fn answer_hook(
    state: tauri::State<'_, PendingState>,
    request_id: String,
    decision: String,
) -> Result<(), String> {
    state.resolve(&request_id, decision).await;
    Ok(())
}

pub fn run() {
    let pending = PendingState::new();

    tauri::Builder::default()
        .manage(pending.clone())
        .invoke_handler(tauri::generate_handler![answer_hook])
        .setup(move |app| {
            // Pin the island to the top edge on Linux (layer-shell when
            // available, dock fallback otherwise). On other platforms the
            // placement in tauri.conf.json already gets us close enough.
            if let Some(win) = app.get_webview_window("island") {
                platform::pin_top(&win);
            }

            // Start the hook listener. It forwards every request to the
            // front end as a `hook://request` event. The handler keeps the
            // reply channel in `PendingState`, so when the user clicks the
            // island the `answer_hook` command delivers the decision back
            // through the same socket.
            let handle = app.handle().clone();
            let pending = pending.clone();
            tauri::async_runtime::spawn(async move {
                hook_server::serve(move |req, reply_tx| {
                    let event = HookRequest {
                        agent: req.agent.clone(),
                        pill_id: req.pill_id.clone(),
                        label: req.label.clone(),
                        request_id: req.request_id.clone(),
                    };
                    pending.register(req.request_id.clone(), reply_tx);
                    let _ = handle.emit("hook://request", event);
                })
                .await;
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Coucou failed to launch");
}
