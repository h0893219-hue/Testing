import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceDir = path.join(projectRoot, "High-Harvest");
const outputDir = path.join(projectRoot, "public", "high-harvest");
const runtimeEntries = ["index.html", "styles.css", "game.js", "assets"];

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const entry of runtimeEntries) {
  await cp(path.join(sourceDir, entry), path.join(outputDir, entry), {
    recursive: true,
  });
}

console.log("High Harvest wurde nach public/high-harvest gebaut.");
