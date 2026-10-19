#[cfg(target_os = "linux")]
mod linux;

#[cfg(target_os = "linux")]
pub use linux::pin_top;

#[cfg(not(target_os = "linux"))]
pub fn pin_top(_win: &tauri::WebviewWindow) {
    // On Windows and macOS the always-on-top + no-decoration flags in
    // tauri.conf.json already pin the island at the top. A follow-up patch
    // will do a finer placement (centre + exclusion of the taskbar) once the
    // Linux path is proven.
}
