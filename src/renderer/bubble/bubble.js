"use strict";

const bubble = document.getElementById("bubble");
const textEl = document.getElementById("text");
const nameEl = document.getElementById("name");
const dots = document.getElementById("dots");
let hideTimer = null;

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

window.bobby.on("bubble:placement", ({ above }) => {
  bubble.classList.toggle("above", !!above);
  bubble.classList.toggle("below", !above);
});
