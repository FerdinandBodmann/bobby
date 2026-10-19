"use strict";

const bubble = document.getElementById("bubble");
const textEl = document.getElementById("text");
const nameEl = document.getElementById("name");
const dots = document.getElementById("dots");
const root = document.documentElement;
let hideTimer = null;

/* ---- geometry the tests ask about (main owns the numbers) ---- */

function bubbleInfo() {
  const pill = bubble.getBoundingClientRect();
  const tail = bubble.querySelector(".tail").getBoundingClientRect();
  const rect = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
  return {
    window: { w: window.innerWidth, h: window.innerHeight },
    pill: { ...rect(pill), right: Math.round(pill.right), bottom: Math.round(pill.bottom) },
    tail: rect(tail),
    tailTip: {
      x: Math.round(tail.x + tail.width / 2),
      y: Math.round(bubble.classList.contains("above") ? tail.y + tail.height : tail.y),
    },
    // where the window's top-left is on screen, so the caller can add it up
    origin: { x: Math.round(screenX), y: Math.round(screenY) },
    above: bubble.classList.contains("above"),
    hasText: !!textEl.textContent,
  };
}
window.bubbleInfo = bubbleInfo;

/* the test driver asks for the invisible beans if it can't composite a frame */
window.bobby.on("bubble:probe", ({ on }) => {
  let probe = document.querySelector(".probe");
  if (!probe) {
    probe = document.createElement("div");
    probe.className = "probe";
    document.body.appendChild(probe);
  }
  probe.classList.toggle("on", !!on);
});

window.bobby.on("bubble:show", ({ text, typing, name }) => {
  clearTimeout(hideTimer);
  nameEl.textContent = name || "";
  if (typing) {
    textEl.textContent = text || "";
    bubble.classList.add("typing");
    dots.style.display = "inline-block";
  } else {
    bubble.classList.remove("typing");
    dots.style.display = "none";
    textEl.textContent = text || "";
  }
  if (!text && !typing) {
    bubble.classList.remove("show");
    return;
  }
  // restart the pop animation
  bubble.classList.remove("show");
  void bubble.offsetWidth;
  bubble.classList.add("show");
});

window.bobby.on("bubble:placement", ({ above, tip }) => {
  bubble.classList.toggle("above", !!above);
  bubble.classList.toggle("below", !above);
  if (typeof tip === "number") root.style.setProperty("--tip", `${tip}px`);
});
