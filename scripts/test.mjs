/**
 * Test runner.
 *
 * Node 20's `--test` does not expand glob patterns itself, and leaving the
 * expansion to the shell is not portable — npm runs scripts through cmd.exe on
 * Windows and sh elsewhere, and the two disagree about `**`. A shell that
 * silently matches only some of the test files is worse than none, so the
 * files are discovered here instead.
 */
import { readdirSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";

function findTests(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...findTests(full));
    else if (entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

const files = [...findTests("lib"), ...findTests("components")].sort();

if (!files.length) {
  console.error("No test files found.");
  process.exit(1);
}
console.log(`Running ${files.length} test file(s):`);
for (const f of files) console.log("  " + f);

spawn(
  process.execPath,
  ["--import", "tsx", "--test", ...process.argv.slice(2), ...files],
  { stdio: "inherit" },
).on("exit", (code) => process.exit(code ?? 1));
