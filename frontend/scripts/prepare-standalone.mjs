/**
 * Next.js standalone : copier public/ et .next/static vers .next/standalone/
 * (requis pour assets et fichiers statiques en prod).
 *
 * Patch server.js : Next utilise `process.env.HOSTNAME || '0.0.0.0'`.
 * Sous Docker/Railway, HOSTNAME = nom du conteneur → bind sur une interface
 * inaccessible au proxy → 502. On lie donc via HOST / NEXT_HOST ou 0.0.0.0.
 */
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");
if (!existsSync(standalone)) {
  console.warn("prepare-standalone: .next/standalone absent, skip");
  process.exit(0);
}

const pub = join(root, "public");
if (existsSync(pub)) {
  cpSync(pub, join(standalone, "public"), { recursive: true });
}

const staticDir = join(root, ".next", "static");
if (existsSync(staticDir)) {
  mkdirSync(join(standalone, ".next"), { recursive: true });
  cpSync(staticDir, join(standalone, ".next", "static"), { recursive: true });
}

const serverJs = join(standalone, "server.js");
const HOSTNAME_NEEDLE = "const hostname = process.env.HOSTNAME || '0.0.0.0'";
const HOSTNAME_PATCH =
  "const hostname = process.env.HOST ?? process.env.NEXT_HOST ?? '0.0.0.0'";
if (existsSync(serverJs)) {
  const before = readFileSync(serverJs, "utf8");
  if (before.includes(HOSTNAME_NEEDLE)) {
    writeFileSync(
      serverJs,
      before.replace(HOSTNAME_NEEDLE, HOSTNAME_PATCH),
      "utf8",
    );
    console.log(
      "prepare-standalone: server.js — bind host: HOST/NEXT_HOST/0.0.0.0 (ignore HOSTNAME conteneur)",
    );
    // #region agent log
    try {
      appendFileSync(
        join(root, "..", "debug-870a71.log"),
        JSON.stringify({
          sessionId: "870a71",
          hypothesisId: "A",
          location: "prepare-standalone.mjs:patch-server-host",
          message: "Patched standalone server.js HOSTNAME bind",
          data: { patched: true },
          timestamp: Date.now(),
        }) + "\n",
        "utf8",
      );
    } catch {
      /* ignore */
    }
    // #endregion
  } else if (before.includes("process.env.HOSTNAME")) {
    console.warn(
      "prepare-standalone: server.js contient HOSTNAME mais ligne inattendue — vérifier Next.js",
    );
  }
}

console.log("prepare-standalone: ok");
