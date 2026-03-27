import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const target = resolve(process.cwd(), ".next");

if (existsSync(target)) {
  rmSync(target, {
    recursive: true,
    force: true
  });

  console.log("[prepare-build] cleared .next");
}
