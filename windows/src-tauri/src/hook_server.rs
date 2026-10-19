//! The hook listener. `coucou-hook` connects, writes one JSON line, and reads
//! back one JSON line. Everything is line-delimited UTF-8 so the hook binary
//! stays tiny and the whole protocol can be inspected with `nc -U`.
//!
//! The island side owns the timeout: it waits up to `BUDGET` for the user to
//! click, and if nothing comes back it writes `{}` (which the agent reads as
//! "no decision, ask in-terminal"). That keeps rule 1 safe even when the UI
//! froze or the front end crashed.

use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::oneshot;
use tokio::time::timeout;

/// Budget for the user's decision. The hook on the other side waits for an
/// answer line but drops the connection on its own ~300 ms budget as well,
/// so this value only matters when the user is clearly interacting and we
/// want to wait a little longer for the click to land.
const BUDGET: Duration = Duration::from_millis(5_000);

#[derive(Deserialize, Debug, Clone)]
pub struct HookPayload {
    pub agent: String,
    #[serde(rename = "pillId")]
    pub pill_id: String,
    pub label: String,
    #[serde(rename = "requestId")]
    pub request_id: String,
}

#[derive(Serialize)]
struct HookReply<'a> {
    decision: &'a str,
}

/// Where to open the Unix socket. The runtime dir is per-user, cleared on
/// logout — exactly what we want, no cross-user leakage.
#[cfg(target_os = "linux")]
pub fn socket_path() -> PathBuf {
    let runtime = std::env::var_os("XDG_RUNTIME_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/tmp"));
    runtime.join("coucou.sock")
}

#[cfg(not(target_os = "linux"))]
pub fn socket_path() -> PathBuf {
    // The Windows path uses a named pipe and will land here in a follow-up
    // commit. For now the stub keeps the code compiling on non-Linux hosts.
    PathBuf::from(r"\\.\pipe\coucou")
}

pub async fn serve<F>(mut on_request: F)
where
    F: FnMut(HookPayload, oneshot::Sender<String>) + Send + 'static,
{
    #[cfg(target_os = "linux")]
    {
        let path = socket_path();
        let _ = std::fs::remove_file(&path);
        let listener = match tokio::net::UnixListener::bind(&path) {
            Ok(l) => l,
            Err(e) => {
                eprintln!("coucou: cannot bind {}: {e}", path.display());
                return;
            }
        };

        loop {
            let (stream, _addr) = match listener.accept().await {
                Ok(s) => s,
                Err(_) => continue,
            };

            // Read the request synchronously under the task; the oneshot is
            // created here so the main thread can resolve it later via the
            // `answer_hook` IPC command.
            let (tx, rx) = oneshot::channel();

            let mut lines = BufReader::new(stream).lines();
            let payload = match lines.next_line().await {
                Ok(Some(line)) => match serde_json::from_str::<HookPayload>(&line) {
                    Ok(p) => p,
                    Err(_) => continue,
                },
                _ => continue,
            };

            on_request(payload, tx);

            // Wait for the user's decision up to BUDGET. On timeout we send
            // an empty object so the agent CLI falls back to its default.
            let mut stream = lines.into_inner().into_inner();
            match timeout(BUDGET, rx).await {
                Ok(Ok(decision)) => {
                    let reply = HookReply { decision: &decision };
                    let _ = stream
                        .write_all(serde_json::to_string(&reply).unwrap().as_bytes())
                        .await;
                    let _ = stream.write_all(b"\n").await;
                }
                _ => {
                    let _ = stream.write_all(b"{}\n").await;
                }
            }
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        // No-op placeholder on other platforms until the named-pipe server
        // lands. `on_request` is still typed so the signature matches.
        let _ = &mut on_request;
    }
}
