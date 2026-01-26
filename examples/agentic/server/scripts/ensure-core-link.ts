import { existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = fileURLToPath(new URL(".", import.meta.url));
const serverRoot = resolve(scriptsDir, "..");
const repoRoot = resolve(scriptsDir, "../../../..");
const packageDir = resolve(serverRoot, "node_modules", "@geekist");
const linkPath = resolve(packageDir, "llm-core");

const ensureDir = (path: string) => {
  if (existsSync(path)) {
    return null;
  }
  mkdirSync(path, { recursive: true });
  return true;
};

const isLinkToRoot = (path: string, root: string) => {
  if (!existsSync(path)) {
    return false;
  }
  const stat = lstatSync(path);
  if (!stat.isSymbolicLink()) {
    return false;
  }
  const resolved = readlinkSync(path);
  return resolve(packageDir, resolved) === root || resolve(resolved) === root;
};

const ensureLink = (path: string, target: string) => {
  if (isLinkToRoot(path, target)) {
    return null;
  }
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
  }
  const type = process.platform === "win32" ? "junction" : "dir";
  symlinkSync(target, path, type);
  return true;
};

ensureDir(packageDir);
ensureLink(linkPath, repoRoot);
