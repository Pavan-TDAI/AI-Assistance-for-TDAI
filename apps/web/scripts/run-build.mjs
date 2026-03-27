import { existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const target = resolve(process.cwd(), ".next");

if (existsSync(target)) {
  rmSync(target, {
    recursive: true,
    force: true
  });

  console.log("[run-build] cleared .next");
}

const child = spawn(process.execPath, [nextBin, "build"], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: {
    ...process.env,
    TDAI_NEXT_DIST: ".next"
  }
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
