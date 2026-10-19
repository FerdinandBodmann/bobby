// Smoke test for coucou-hook: when the socket is missing it must still exit
// cleanly with a safe-default decision so the agent CLI never blocks.
//
// We don't bind a server here on purpose — the point is to prove the bail-out
// path works even when Coucou isn't running.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const bin = join(
  new URL(".", import.meta.url).pathname,
  "..",
  "target",
  "release",
  "coucou-hook",
);

test("coucou-hook prints a safe default when the island is closed", (t) => {
  if (!existsSync(bin)) {
    t.skip("coucou-hook not built yet; run `cargo build --release -p coucou-hook`");
    return;
  }
  const runtime = mkdtempSync(join(tmpdir(), "coucou-hook-"));
  const out = spawnSync(bin, [], {
    input: '{"tool":"Bash","command":"ls"}',
    env: {
      ...process.env,
      XDG_RUNTIME_DIR: runtime, // empty dir -> no socket
      COUCOU_AGENT: "claude-code",
      COUCOU_REQUEST_ID: "r1",
      COUCOU_LABEL: "test",
    },
    encoding: "utf8",
    timeout: 2000,
  });
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout.trim(), "{}");
});

test("coucou-hook returns \"ask\" when the agent is Copilot", (t) => {
  if (!existsSync(bin)) {
    t.skip("coucou-hook not built yet");
    return;
  }
  const runtime = mkdtempSync(join(tmpdir(), "coucou-hook-"));
  const out = spawnSync(bin, [], {
    input: "{}",
    env: {
      ...process.env,
      XDG_RUNTIME_DIR: runtime,
      COUCOU_AGENT: "copilot",
      COUCOU_REQUEST_ID: "r2",
    },
    encoding: "utf8",
    timeout: 2000,
  });
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout.trim(), '"ask"');
});
