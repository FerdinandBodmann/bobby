// Mochi is a small animated mascot drawn with Canvas 2D. No images, no Rive,
// no Lottie — the whole character is a handful of ellipses and bezier curves
// so the Windows and Android ports can mirror the exact shapes and timings.
//
// The engine is paused when the island is hidden: `start()` and `stop()` wrap
// a single rAF loop so idle CPU stays at zero (PROMPT.md rule 5).

export type MochiMood = "idle" | "listening" | "thinking" | "happy" | "worried";

type Ctx = CanvasRenderingContext2D;

export class Mochi {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: Ctx;
  private raf = 0;
  private t0 = 0;
  private mood: MochiMood = "idle";

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    // Match the backing store to CSS pixels * devicePixelRatio so the strokes
    // stay crisp on hidpi screens without the DOM reporting a different size.
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    this.ctx.scale(dpr, dpr);
  }

  setMood(mood: MochiMood): void {
    this.mood = mood;
  }

  start(): void {
    if (this.raf) return;
    this.t0 = performance.now();
    const tick = (now: number): void => {
      this.draw((now - this.t0) / 1000);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private draw(t: number): void {
    const { ctx } = this;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // The body: a plump ellipse that bobs on an idle sine, breathes faster
    // when "thinking", and squashes slightly when "happy".
    const bobAmp = this.mood === "thinking" ? 1.6 : 0.9;
    const bobHz = this.mood === "thinking" ? 2.4 : 1.1;
    const bob = Math.sin(t * bobHz * Math.PI * 2) * bobAmp;
    const squash = this.mood === "happy" ? Math.sin(t * 5) * 0.08 : 0;

    const cx = w / 2;
    const cy = h / 2 + bob;
    const rx = w * 0.22 * (1 + squash);
    const ry = h * 0.38 * (1 - squash);

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes: open normally, closed to arcs when happy, scanning when listening.
    const eyeY = cy - ry * 0.1;
    const eyeDX = rx * 0.35;
    const closed = this.mood === "happy" && Math.sin(t * 5) > 0.4;
    const scan =
      this.mood === "listening" ? Math.sin(t * 3) * (eyeDX * 0.25) : 0;

    ctx.fillStyle = "#111";
    if (closed) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#111";
      for (const dx of [-eyeDX, eyeDX]) {
        ctx.beginPath();
        ctx.arc(cx + dx, eyeY, 2.2, Math.PI, 0, true);
        ctx.stroke();
      }
    } else {
      for (const dx of [-eyeDX, eyeDX]) {
        ctx.beginPath();
        ctx.arc(cx + dx + scan, eyeY, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // A tiny worried eyebrow pair when a permission is pending.
    if (this.mood === "worried") {
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 1.2;
      for (const dx of [-eyeDX, eyeDX]) {
        ctx.beginPath();
        ctx.moveTo(cx + dx - 3, eyeY - 4);
        ctx.lineTo(cx + dx + 3, eyeY - 2.5);
        ctx.stroke();
      }
    }
  }
}
