import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkCompose, checkDockerfile, collectPackages, scanRepo, scanSecrets } from "../src";

// Fake credentials are assembled at runtime so this file never contains a detectable secret.
const AWS = "AKIA" + "Z7Q2X9K4M1P8N3R6";
const GH = "ghp" + "_" + "a".repeat(36);
const KEY_HEADER = "-----BEGIN " + "RSA PRIVATE KEY-----";

const dirs: string[] = [];
function repo(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "golive-scan-"));
  dirs.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("secrets", () => {
  it("finds real credential formats and reports location only", () => {
    const root = repo({
      "src/config.ts": `export const key = "${AWS}";\nconst t = "${GH}";`,
      "deploy/id_rsa": `${KEY_HEADER}\nMIIE...`,
    });
    const found = scanSecrets(root, ["src/config.ts", "deploy/id_rsa"], new Set());
    expect(found.map((f) => `${f.file}:${f.line}:${f.rule}`)).toEqual([
      "src/config.ts:1:aws-access-key",
      "src/config.ts:2:github-token",
      "deploy/id_rsa:1:private-key",
    ]);
    expect(JSON.stringify(found)).not.toContain(AWS);
  });

  it("ignores placeholders, examples and allow-listed lines", () => {
    const root = repo({
      "docker.env.example": "DB_PASSWORD=supersecretvalue",
      ".env.example": "API_KEY=supersecretvalue",
      "a.ts": 'const url = "postgres://app:${DB_PASSWORD}@db:5432/app";\nconst b = "postgres://app:changeme@db/app";',
      "b.ts": `const k = "${AWS}"; // golive:allow test fixture`,
    });
    expect(scanSecrets(root, [".env.example", "a.ts", "b.ts"], new Set())).toEqual([]);
  });

  it("flags database URLs with a real password", () => {
    const root = repo({ "app.py": 'DATABASE_URL = "postgresql://app:' + "Xk29vLpq81" + '@10.0.0.5:5432/app"' });
    expect(scanSecrets(root, ["app.py"], new Set())[0]?.rule).toBe("database-url-password");
  });

  it("flags committed .env files and their secret values", () => {
    const root = repo({ ".env": "NODE_ENV=production\nSTRIPE_SECRET_KEY=" + "k".repeat(24) + "\nAPI_TOKEN=\n" });
    const found = scanSecrets(root, [".env"], new Set([".env"]));
    expect(found.map((f) => f.rule)).toEqual(["env-file-committed", "env-secret"]);
  });
});

describe("containers", () => {
  it("flags root user, unpinned base image and secrets baked in the image", () => {
    const issues = checkDockerfile(
      "Dockerfile",
      ["FROM node:latest AS build", "RUN npm ci", "FROM nginx", "ENV API_KEY=" + "abcdef123456", "COPY --from=build /app /usr/share/nginx/html"].join("\n"),
    );
    expect(issues.map((i) => i.check).sort()).toEqual(["root-user", "secret-in-image", "unpinned-image", "unpinned-image"]);
  });

  it("accepts a hardened multi-stage Dockerfile", () => {
    const text = ["FROM node:22-alpine AS build", "RUN npm ci", "FROM build AS test", "FROM node:22-alpine", "ARG TOKEN", "ENV NODE_ENV=production", "USER node"].join("\n");
    expect(checkDockerfile("Dockerfile", text)).toEqual([]);
  });

  it("detects datastores published on all host interfaces", () => {
    const compose = [
      "services:",
      "  db:",
      "    image: postgres:17",
      '    ports: ["5432:5432"]',
      "  cache:",
      "    image: redis:7",
      '    ports: ["127.0.0.1:6379:6379"]',
      "  web:",
      "    image: nginx:1.27",
      '    ports: ["443:443"]',
      "    privileged: true",
    ].join("\n");
    const issues = checkCompose("docker-compose.yml", compose);
    expect(issues.map((i) => `${i.check}:${i.subject}`).sort()).toEqual(["privileged:web", "published-datastore:db"]);
  });
});

describe("dependencies", () => {
  it("reads npm, pnpm and pip lockfiles and spots manifests without lockfile", () => {
    const root = repo({
      "package-lock.json": JSON.stringify({ lockfileVersion: 3, packages: { "": {}, "node_modules/lodash": { version: "4.17.20" }, "packages/app": { version: "1.0.0" } } }),
      "package.json": "{}",
      "web/pnpm-lock.yaml": "lockfileVersion: '9.0'\npackages:\n  '@scope/pkg@1.2.3':\n    resolution: {integrity: x}\n  'next@16.0.0(react@19.0.0)':\n    resolution: {integrity: y}\n",
      "web/package.json": "{}",
      "api/requirements.txt": "django==4.2.1\nrequests>=2\n",
      "tools/composer.json": "{}",
    });
    const files = ["package-lock.json", "package.json", "web/pnpm-lock.yaml", "web/package.json", "api/requirements.txt", "tools/composer.json"];
    const { packages, manifests } = collectPackages(root, files);
    expect(packages.map((p) => `${p.ecosystem}:${p.name}@${p.version}`).sort()).toEqual([
      "PyPI:django@4.2.1",
      "npm:@scope/pkg@1.2.3",
      "npm:lodash@4.17.20",
      "npm:next@16.0.0",
    ]);
    expect(manifests.filter((m) => !m.lockfile).map((m) => m.file)).toEqual(["tools/composer.json"]);
  });
});

describe("scanRepo", () => {
  it("runs offline end to end without executing project code", async () => {
    const root = repo({ "src/a.ts": `const k = "${AWS}";`, Dockerfile: "FROM node:22\nUSER node\n", "package.json": "{}" });
    const obs = await scanRepo(root, { offline: true, gitleaks: false });
    expect(obs.secrets).toHaveLength(1);
    expect(obs.containerFiles).toEqual(["Dockerfile"]);
    expect(obs.containers).toEqual([]);
    expect(obs.dependencies.checked).toBe(false);
  });
});
