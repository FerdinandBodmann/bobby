// Thin wrapper so `cargo run -p coucou` still works. The real entry point
// lives in the lib crate so the integration tests can exercise it too.

#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

fn main() {
    coucou_lib::run();
}
