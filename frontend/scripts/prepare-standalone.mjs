/**
 * Next.js standalone : copier public/ et .next/static vers .next/standalone/
 * (requis pour assets et fichiers statiques en prod).
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
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

console.log("prepare-standalone: ok");
