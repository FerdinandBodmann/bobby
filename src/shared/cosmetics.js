"use strict";
/**
 * Bobby's wardrobe: one little decoration he can wear on his head.
 *
 * Kept in a single shared file so the buddy renderer, the settings preview and
 * the tray/context menus can never disagree about what a cosmetic is or where
 * it sits.
 *
 *   size  fraction of the bean's height the decoration is wide/tall
 *   cx    centre-x as a fraction of the bean's width  (0.5 = middle)
 *   cy    centre-y as a fraction of the bean's height (0.13 = near the top)
 *
 * Coordinates are in the bean's own design box (156 x 110, top-left origin) —
 * the same space the renderer paints in, so the settings thumbnail lines up
 * with what the real bean does.
 *
 * No foliage. Ever. (The sprout/leaf was removed on purpose — don't bring it
 * back under a new name.)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BOBBY_COSMETICS = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const COSMETICS = {
    bow: {
      label: "bow",
      size: 0.34,
      cx: 0.5,
      cy: 0.05,
      svg:
        '<svg viewBox="0 0 56 34" fill="none" aria-hidden="true">' +
        '<path d="M27 17 L6 5 C0 14 0 22 6 29 Z" fill="#e57aa6" stroke="#a8406a" stroke-width="2.4" stroke-linejoin="round"/>' +
        '<path d="M29 17 L50 5 C56 14 56 22 50 29 Z" fill="#e57aa6" stroke="#a8406a" stroke-width="2.4" stroke-linejoin="round"/>' +
        '<circle cx="28" cy="17" r="6.4" fill="#f7a8c6" stroke="#a8406a" stroke-width="2.4"/>' +
        "</svg>",
    },
    party: {
      label: "party hat",
      size: 0.32,
      cx: 0.5,
      cy: 0.07,
      svg:
        '<svg viewBox="0 0 40 52" fill="none" aria-hidden="true">' +
        '<path d="M20 6 L2 48 L38 48 Z" fill="#7f7bdc" stroke="#4c47ea" stroke-width="3" stroke-linejoin="round"/>' +
        '<path d="M20 6 L11 27 L29 27 Z" fill="#b9b6ff" opacity="0.9"/>' +
        '<circle cx="20" cy="3.4" r="3.4" fill="#ffd76a"/>' +
        "</svg>",
    },
    cap: {
      label: "cap",
      size: 0.34,
      cx: 0.5,
      cy: 0.06,
      svg:
        '<svg viewBox="0 0 60 34" fill="none" aria-hidden="true">' +
        '<path d="M4 30 C4 14 15 4 30 4 C45 4 56 14 56 30 Z" fill="#3b4a86" stroke="#22305f" stroke-width="2.6" stroke-linejoin="round"/>' +
        '<path d="M54 28 C66 28 66 34 54 34 Z" fill="#22305f"/>' +
        '<circle cx="30" cy="6" r="3" fill="#e7e9ff"/>' +
        "</svg>",
    },
    boba: {
      label: "boba tea",
      size: 0.32,
      cx: 0.5,
      cy: 0.05,
      svg:
        '<svg viewBox="0 0 34 46" fill="none" aria-hidden="true">' +
        '<path d="M6 12 L28 12 L24 44 L10 44 Z" fill="#efe3cf" stroke="#7a6a55" stroke-width="2.4" stroke-linejoin="round"/>' +
        '<path d="M8 26 L26 26 L24 44 L10 44 Z" fill="#b98a5e"/>' +
        '<circle cx="14" cy="34" r="2.6" fill="#3a2a1e"/><circle cx="21" cy="37" r="2.6" fill="#3a2a1e"/>' +
        '<circle cx="17" cy="30" r="2.2" fill="#3a2a1e"/>' +
        '<rect x="18" y="0" width="3" height="14" rx="1.5" fill="#7a6a55" transform="rotate(9 19 7)"/>' +
        "</svg>",
    },
    star: {
      label: "star",
      size: 0.32,
      cx: 0.5,
      cy: 0.09,
      svg:
        '<svg viewBox="0 0 40 40" fill="none" aria-hidden="true">' +
        '<path d="M20 3 L25 15 L38 16 L28 25 L31 38 L20 31 L9 38 L12 25 L2 16 L15 15 Z" fill="#ffd76a" stroke="#d09b2c" stroke-width="2.4" stroke-linejoin="round"/>' +
        "</svg>",
    },
    santa: {
      label: "santa hat",
      size: 0.34,
      cx: 0.5,
      cy: 0.06,
      svg:
        '<svg viewBox="0 0 60 56" fill="none" aria-hidden="true">' +
        '<path d="M8 46 C8 40 16 38 30 38 C44 38 52 40 52 46 C52 52 44 56 30 56 C16 56 8 52 8 46 Z" fill="#f4f6f9" stroke="#c9cedf" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="M16 46 C15 34 23 18 31 12 C39 8 48 12 50 20 C52 30 48 42 40 46 C34 47 24 46 16 46 Z" fill="#d5384b" stroke="#a32739" stroke-width="2.2" stroke-linejoin="round"/>' +
        '<circle cx="50" cy="18" r="4" fill="#fff" stroke="#c9cedf" stroke-width="1.6"/>' +
        "</svg>",
    },
  };

  // "" is the plain bean. Labels are shared so menus and the picker read the same.
  const NONE = "";
  const ORDER = ["bow", "party", "cap", "boba", "star", "santa"];
  const LABELS = {
    "": "nothing",
    bow: "bow",
    party: "party hat",
    cap: "cap",
    boba: "boba tea",
    star: "star",
    santa: "santa hat",
  };

  return { COSMETICS, ORDER, LABELS, NONE };
});
