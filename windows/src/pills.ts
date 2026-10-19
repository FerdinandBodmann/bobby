// Pills are the small chips that sit next to Mochi: one per active agent
// session, pending question, or integration event. IDs are stable contract
// values (PROMPT.md rule 6) because Keychain items, UserDefaults, and hook
// routing all key off them.

export type PillKind = "info" | "approve" | "deny" | "chat";

export interface Pill {
  id: string;
  kind: PillKind;
  label: string;
  // The request this pill is bound to, if any. Approvals are rejected unless
  // the user clicks on the exact outstanding request (rule 3).
  requestId?: string;
}

export type PillAction = { pillId: string; action: "approve" | "deny" | "open" };

export class PillRow {
  private readonly root: HTMLElement;
  private readonly pills = new Map<string, Pill>();
  private readonly listeners = new Set<(a: PillAction) => void>();

  constructor(root: HTMLElement) {
    this.root = root;
  }

  onAction(fn: (a: PillAction) => void): void {
    this.listeners.add(fn);
  }

  set(pill: Pill): void {
    this.pills.set(pill.id, pill);
    this.render();
  }

  remove(id: string): void {
    this.pills.delete(id);
    this.render();
  }

  size(): number {
    return this.pills.size;
  }

  private render(): void {
    this.root.replaceChildren();
    for (const p of this.pills.values()) {
      const el = document.createElement("div");
      el.className = "pill";
      el.dataset["kind"] = p.kind;
      el.setAttribute("role", "listitem");
      el.textContent = p.label;

      if (p.kind === "approve" || p.kind === "deny") {
        const yes = document.createElement("button");
        yes.textContent = "✓";
        yes.title = "Approve";
        yes.addEventListener("click", () =>
          this.emit({ pillId: p.id, action: "approve" }),
        );
        const no = document.createElement("button");
        no.textContent = "✕";
        no.title = "Deny";
        no.addEventListener("click", () =>
          this.emit({ pillId: p.id, action: "deny" }),
        );
        el.append(yes, no);
      } else {
        el.addEventListener("click", () =>
          this.emit({ pillId: p.id, action: "open" }),
        );
      }
      this.root.append(el);
    }
  }

  private emit(a: PillAction): void {
    for (const fn of this.listeners) fn(a);
  }
}
