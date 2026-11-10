// `pnpm build:local`: a production build on this machine, for testing against
// staging. Sets JOOMA_LOCAL_BUILD so next.config.ts skips the Sentry source map
// upload and release (a plain `VAR=1 next build` does not work in a Windows
// package script). Then `pnpm start` serves it on :3000.
import { spawn } from "node:child_process";

const child = spawn("pnpm", ["next", "build"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, JOOMA_LOCAL_BUILD: "1" },
});
child.on("exit", (code) => process.exit(code ?? 1));
