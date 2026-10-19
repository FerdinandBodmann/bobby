//! Linux window placement.
//!
//! On compositors that support wlr-layer-shell (COSMIC, KDE, Hyprland, Sway)
//! we promote the WebView's GTK window into a top-anchored overlay — it
//! floats above everything, the compositor leaves the rest of the screen
//! fully transparent and click-through where we don't paint, and the window
//! never shows up in taskbars or the alt-tab list.
//!
//! On GNOME (which doesn't ship layer-shell) the call is a no-op and the
//! window keeps its `alwaysOnTop + skipTaskbar + decorations=false` config.
//! The user can still override with `COUCOU_LAYER_SHELL=0` to force the
//! fallback for debugging.

use gtk::prelude::*;
use gtk_layer_shell::{Edge, Layer, LayerShell};
use tauri::WebviewWindow;

pub fn pin_top(win: &WebviewWindow) {
    if std::env::var("COUCOU_LAYER_SHELL").as_deref() == Ok("0") {
        return;
    }

    // `WebviewWindow::gtk_window` returns the actual GtkWindow Tauri owns on
    // Linux. We attach layer-shell to it; the WebView stays unchanged.
    let gtk_win = match win.gtk_window() {
        Ok(w) => w,
        Err(_) => return,
    };

    if !gtk_layer_shell::is_supported() {
        return;
    }

    gtk_win.init_layer_shell();
    gtk_win.set_layer(Layer::Overlay);
    gtk_win.set_anchor(Edge::Top, true);
    // No left/right anchor so the compositor centres the window at its
    // natural width; we still ask for no margins so the top edge is flush.
    // The method is fully qualified because GTK itself exposes a one-arg
    // `set_margin` on every widget, which would otherwise win name lookup.
    LayerShell::set_margin(&gtk_win, Edge::Top, 0);
    gtk_win.set_exclusive_zone(0);
    // The island never wants keyboard focus (it would steal the terminal's
    // focus every time a pill shows up); clicks still land because we leave
    // the pointer events on.
    gtk_win.set_keyboard_interactivity(false);
}
