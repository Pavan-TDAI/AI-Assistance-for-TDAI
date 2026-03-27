import { existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

for (const target of [".next-dev", "tsconfig.tsbuildinfo"]) {
  const absolutePath = resolve(process.cwd(), target);
  if (!existsSync(absolutePath)) {
    continue;
  }

  rmSync(absolutePath, {
    recursive: true,
    force: true
  });

  console.log(`[run-dev] cleared ${target}`);
}

const child = spawn(process.execPath, [nextBin, "dev"], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: {
    ...process.env,
    TDAI_NEXT_DIST: ".next-dev"
  }
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
