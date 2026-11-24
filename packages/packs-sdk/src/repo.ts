/**
 * Layer 2 input: a static observation of a code repository.
 * Produced by @golive/scanner (or any compatible tool) and consumed by rules.
 * Secret values are never stored, only where they are.
 */
export interface RepoObservation {
  root: string;
  scannedAt: string;
  files: number;
  tools: ScanTool[];
  secrets: SecretFinding[];
  dependencies: {
    /** False when the vulnerability lookup could not run (offline, network error). */
    checked: boolean;
    error?: string;
    manifests: { file: string; ecosystem: Ecosystem; packages: number; lockfile: boolean }[];
    vulnerabilities: Vulnerability[];
  };
  /** Dockerfiles and compose files that were inspected. */
  containerFiles: string[];
  containers: ContainerFinding[];
}

export interface ScanTool {
  name: string;
  version?: string;
  used: boolean;
  note?: string;
}

export interface SecretFinding {
  file: string;
  line: number;
  rule: string;
  description: string;
}

export type Ecosystem = "npm" | "PyPI" | "Go" | "Packagist" | "RubyGems" | "crates.io";

export interface Vulnerability {
  id: string;
  aliases: string[];
  package: string;
  version: string;
  ecosystem: Ecosystem;
  severity: "critical" | "high" | "medium" | "low" | "unknown";
  summary: string;
  fixed?: string;
  file: string;
}

export interface ContainerFinding {
  file: string;
  line?: number;
  check: "root-user" | "unpinned-image" | "secret-in-image" | "published-datastore" | "privileged";
  message: string;
  /** For published-datastore: the service or image concerned. */
  subject?: string;
}
