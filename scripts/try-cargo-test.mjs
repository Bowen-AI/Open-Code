#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const cargo = process.env.CARGO || "cargo";
const ver = spawnSync(cargo, ["--version"], { encoding: "utf8" });
if (ver.error || ver.status !== 0) {
  console.warn("[open-code] skip `cargo test` (no cargo in PATH)");
  process.exit(0);
}
const logic = spawnSync(cargo, ["test", "-p", "open-code-logic"], { cwd: root, stdio: "inherit" });
if (logic.status !== 0) {
  process.exit(logic.status ?? 1);
}
const r = spawnSync(cargo, ["test", "-p", "open-code-memory"], { cwd: root, stdio: "inherit" });
process.exit(r.status === 0 ? 0 : r.status ?? 1);
