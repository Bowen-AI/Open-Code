#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const cargo = process.env.CARGO || "cargo";
const ver = spawnSync(cargo, ["--version"], { encoding: "utf8" });
if (ver.error || ver.status !== 0) {
  console.warn(
    "[open-code] cargo not in PATH; skipped Rust `open-code-memoryd`. Install Rust: https://rustup.rs (then: npm run build:rust:required)"
  );
  process.exit(0);
}
const r = spawnSync(cargo, ["build", "-p", "open-code-memory", "--release"], {
  cwd: root,
  stdio: "inherit"
});
process.exit(r.status === 0 ? 0 : r.status ?? 1);
