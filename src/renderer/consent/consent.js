"use strict";

const card = document.getElementById("card");
const summary = document.getElementById("summary");
const warn = document.getElementById("warn");
const btnOnce = document.getElementById("btnOnce");
const btnAlways = document.getElementById("btnAlways");
const btnDeny = document.getElementById("btnDeny");

let current = null;
let answered = false;

function applyRequest(req) {
  if (!req) return;
  current = req;
  answered = false;
  card.classList.toggle("danger", !!req.danger);
  summary.textContent = req.summary || req.tool;
  warn.textContent = req.danger
    ? "This one can change things on your device, so it always asks first."
    : "Allow it just this once, or remember it for later.";
  if (req.allow && req.allow.label) {
    btnAlways.hidden = false;
    btnAlways.textContent = req.allow.label;
    btnAlways.title = req.allow.label;
  } else {
    btnAlways.hidden = true;
  }
  btnOnce.textContent = "Approve once";
  btnOnce.disabled = false;
  btnAlways.disabled = false;
  btnDeny.disabled = false;
  card.style.animation = "none";
  void card.offsetWidth;
  card.style.animation = "";
}

window.bobby.on("consent:request", applyRequest);

// If the request was sent before this page finished loading, pull it.
window.bobby
  .invoke("consent:pending")
  .then((req) => {
    if (req && (!current || current.id !== req.id)) applyRequest(req);
  })
  .catch(() => {});

async function answer(decision) {
  if (!current || answered) return;
  answered = true;
  btnOnce.disabled = true;
  btnAlways.disabled = true;
  btnDeny.disabled = true;
  try {
    await window.bobby.invoke("consent:answer", { id: current.id, decision });
  } catch {}
}

btnOnce.onclick = () => answer("once");
btnAlways.onclick = () => answer("always");
btnDeny.onclick = () => answer("deny");

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") answer("deny");
  if (e.key === "Enter") answer("once");
});
