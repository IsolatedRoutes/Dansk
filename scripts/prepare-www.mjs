// Copies the built app into www/, the folder Capacitor packages into the iPhone app.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";

rmSync("www", { recursive: true, force: true });
mkdirSync("www", { recursive: true });
for (const f of ["index.html", "manifest.webmanifest", "privacy.html"]) {
  if (!existsSync(f)) throw new Error("Missing " + f + " - run the build first");
  cpSync(f, "www/" + f);
}
cpSync("icons", "www/icons", { recursive: true });
console.log("www/ is ready");
