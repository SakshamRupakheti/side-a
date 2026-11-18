import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
const template = await readFile(
  new URL("../.dev.vars.example", import.meta.url),
  "utf8",
);
try {
  await writeFile(
    new URL("../.dev.vars", import.meta.url),
    template.replace(
      "replace-with-a-random-secret-of-at-least-32-bytes",
      randomBytes(32).toString("hex"),
    ),
    { flag: "wx", mode: 0o600 },
  );
  console.log("Created local Worker configuration.");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log("Existing .dev.vars preserved.");
}
