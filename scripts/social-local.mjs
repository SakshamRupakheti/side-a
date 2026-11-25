import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url)),
  storage = resolve(root, ".wrangler/social-preview"),
  envFile = resolve(storage, "preview.env");
const cli = resolve(root, "node_modules/wrangler/bin/wrangler.js");
function wrangler(args) {
  const child = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  });
  if (child.status !== 0) process.exit(child.status ?? 1);
}
const [mode, action, report] = process.argv.slice(2);
if (mode === "moderate") {
  if (action === "list") {
    wrangler([
      "d1",
      "execute",
      "side-a",
      "--local",
      "--persist-to",
      storage,
      "--command",
      "SELECT id,CASE WHEN post IS NULL THEN 'profile' ELSE 'post' END AS kind,reason,created_at,status FROM social_report WHERE status='open' ORDER BY created_at,id LIMIT 30",
    ]);
  } else {
    if (
      !["hide", "restore", "close"].includes(action) ||
      !report ||
      !/^[a-f0-9-]{36}$/i.test(report)
    )
      throw Error(
        "Use list, hide REPORT_UUID, restore REPORT_UUID or close REPORT_UUID.",
      );
    const value = action === "hide" ? 1 : 0;
    const sql =
      action === "close"
        ? "UPDATE social_report SET status='closed' WHERE id='" + report + "'"
        : "UPDATE social_post SET hidden=" +
          value +
          ",revision=revision+1 WHERE id=(SELECT post FROM social_report WHERE id='" +
          report +
          "'); UPDATE profile SET social_hidden=" +
          value +
          " WHERE user_id=(SELECT person FROM social_report WHERE id='" +
          report +
          "')";
    wrangler([
      "d1",
      "execute",
      "side-a",
      "--local",
      "--persist-to",
      storage,
      "--command",
      sql,
    ]);
  }
} else if (!mode) {
  mkdirSync(storage, { recursive: true });
  if (!existsSync(envFile))
    writeFileSync(
      envFile,
      "BETTER_AUTH_URL=http://127.0.0.1:8793\nLOCAL_PASSWORD_AUTH=true\nBETTER_AUTH_SECRET=" +
        randomBytes(32).toString("hex") +
        "\n",
      { flag: "wx", mode: 0o600 },
    );
  wrangler([
    "d1",
    "migrations",
    "apply",
    "side-a",
    "--local",
    "--persist-to",
    storage,
  ]);
  wrangler([
    "dev",
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    "8793",
    "--persist-to",
    storage,
    "--env-file",
    envFile,
  ]);
} else throw Error("Unknown local preview command.");
