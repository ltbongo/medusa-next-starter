/**
 * Repo-root entrypoint for the B9 demo seed (used by docs and CI).
 * Prefer: cd apps/backend && npm run seed
 */
import { spawnSync } from "node:child_process"
import path from "node:path"

const backendDir = path.join(process.cwd(), "apps", "backend")

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: backendDir,
    stdio: "inherit",
    shell: false,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

run("npx", ["medusa", "db:migrate"])
run("npx", ["medusa", "exec", "./src/scripts/seed-demo.ts"])
