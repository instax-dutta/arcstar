import { spawnSync } from "node:child_process";

export function run(command, args, cwd = process.cwd(), maxBuffer = 10 * 1024 * 1024) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer, shell: process.platform === "win32" });
  const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return { status: result.status, combined };
}

export function exitWithSuccess(marker) {
  console.log(marker);
  process.exit(0);
}

export function exitWithFailure(marker) {
  console.error(marker);
  process.exit(1);
}
