//! Correlation table between outstanding hook requests and the oneshot
//! channel the socket handler is waiting on. If the user never answers, the
//! handler drops the receiver on timeout and the pending slot gets cleared
//! on the next sweep — the agent CLI never blocks (PROMPT.md rule 1).

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::{oneshot, Mutex};

#[derive(Clone)]
pub struct PendingState {
    inner: Arc<Mutex<HashMap<String, oneshot::Sender<String>>>>,
}

impl PendingState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn register(&self, request_id: String, reply_tx: oneshot::Sender<String>) {
        let inner = self.inner.clone();
        tauri::async_runtime::spawn(async move {
            inner.lock().await.insert(request_id, reply_tx);
        });
    }

    pub async fn resolve(&self, request_id: &str, decision: String) {
        let tx = { self.inner.lock().await.remove(request_id) };
        if let Some(tx) = tx {
            let _ = tx.send(decision);
        }
    }
}
