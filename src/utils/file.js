import fs from "node:fs";
import path from "node:path";

export function getFilesFromDir(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith(".js"))
    .map((f) => path.join(dirPath, f));
}
