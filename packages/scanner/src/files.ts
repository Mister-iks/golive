import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "vendor",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".turbo",
  ".venv",
  "venv",
  "__pycache__",
  "coverage",
  "target",
]);

export interface RepoFiles {
  /** Paths relative to the root, with forward slashes. */
  files: string[];
  /** Files tracked by git (empty when the folder is not a git repository). */
  tracked: Set<string>;
  git: boolean;
}

/**
 * Lists the files that belong to the project: tracked and untracked-but-not-ignored
 * files when the folder is a git repository, otherwise a filtered walk.
 */
export function listFiles(root: string): RepoFiles {
  try {
    const run = (args: string[]) =>
      execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] })
        .split("\n")
        .filter(Boolean);
    const tracked = run(["ls-files"]);
    const untracked = run(["ls-files", "--others", "--exclude-standard"]);
    const files = [...new Set([...tracked, ...untracked])].filter((f) => !f.split("/").some((part) => SKIP_DIRS.has(part)));
    return { files, tracked: new Set(tracked), git: true };
  } catch {
    return { files: walk(root, root), tracked: new Set(), git: false };
  }
}

function walk(root: string, dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(root, join(dir, entry.name), out);
    } else if (entry.isFile()) {
      out.push(relative(root, join(dir, entry.name)).split(sep).join("/"));
    }
    if (out.length > 50_000) break;
  }
  return out;
}

export function sizeOf(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

export const basename = (f: string) => f.slice(f.lastIndexOf("/") + 1);
export const dirname = (f: string) => (f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : "");
