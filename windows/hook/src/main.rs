//! `coucou-hook` — the tiny relay every agent's hook shells out to.
//!
//! Contract: read a JSON object from stdin (what the agent gave us), forward
//! it to the island's Unix socket, wait at most ~300 ms for a reply, and
//! print the reply (or an empty object / `"ask"` for Copilot) on stdout so
//! the agent can carry on.
//!
//! The hard rule from PROMPT.md (#1): if the island is closed, slow, or the
//! socket is missing, we exit with a safe default so the agent CLI continues
//! exactly as if Coucou wasn't installed. No crash, no hang, no stderr spam.

use std::env;
use std::io::{self, BufRead, BufReader, Read, Write};
use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::time::Duration;

const BUDGET: Duration = Duration::from_millis(300);

fn socket_path() -> PathBuf {
    let runtime = env::var_os("XDG_RUNTIME_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/tmp"));
    runtime.join("coucou.sock")
}

/// What the agent wants if the island never answers. Copilot expects the
/// literal string `"ask"`; every other agent is happy with an empty object.
fn safe_default() -> String {
    let agent = env::var("COUCOU_AGENT").unwrap_or_default();
    if agent == "copilot" {
        "\"ask\"".into()
    } else {
        "{}".into()
    }
}

fn main() {
    // Read whatever the agent handed us. We don't need to parse it; we only
    // repackage it with the correlation id the island expects.
    let mut raw = String::new();
    if io::stdin().read_to_string(&mut raw).is_err() {
        println!("{}", safe_default());
        return;
    }

    let request_id = env::var("COUCOU_REQUEST_ID").unwrap_or_else(|_| {
        // Fallback to a monotonic-ish id so the island still gets something
        // unique when the caller forgot to set the variable.
        format!(
            "req-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        )
    });

    let agent = env::var("COUCOU_AGENT").unwrap_or_else(|_| "unknown".into());
    let pill_id = env::var("COUCOU_PILL_ID").unwrap_or_else(|_| agent.clone());
    let label = env::var("COUCOU_LABEL").unwrap_or_else(|_| raw.trim().into());

    let payload = serde_json::json!({
        "agent": agent,
        "pillId": pill_id,
        "label": label,
        "requestId": request_id,
    });

    let socket = socket_path();
    let mut stream = match UnixStream::connect(&socket) {
        Ok(s) => s,
        Err(_) => {
            // The island isn't listening — safe default and go.
            println!("{}", safe_default());
            return;
        }
    };
    let _ = stream.set_read_timeout(Some(BUDGET));
    let _ = stream.set_write_timeout(Some(BUDGET));

    let line = format!("{payload}\n");
    if stream.write_all(line.as_bytes()).is_err() {
        println!("{}", safe_default());
        return;
    }

    let mut reader = BufReader::new(stream);
    let mut reply = String::new();
    if reader.read_line(&mut reply).is_err() || reply.trim().is_empty() {
        println!("{}", safe_default());
        return;
    }

    // The island hands back a short JSON object like `{"decision":"approve"}`;
    // we forward it verbatim so each agent's own hook glue can read the shape
    // it expects.
    print!("{reply}");
    let _ = io::stdout().flush();
}
