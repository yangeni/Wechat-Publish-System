import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export interface HashFileEntry {
  logicalPath: string;
  filePath: string;
}

export async function sha256File(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

export async function hashFiles(fileEntries: HashFileEntry[]): Promise<string> {
  const hash = createHash("sha256");
  const seen = new Set<string>();
  const entries = await Promise.all(fileEntries.map(async (entry) => {
    const logicalPath = normalizeHashKey(entry.logicalPath);
    if (seen.has(logicalPath)) throw new Error(`Duplicate hash file entry: ${logicalPath}`);
    seen.add(logicalPath);
    return {
      logicalPath,
      digest: await sha256File(entry.filePath)
    };
  }));

  entries.sort((a, b) => a.logicalPath.localeCompare(b.logicalPath));
  for (const entry of entries) {
    hash.update(entry.logicalPath);
    hash.update("\0");
    hash.update(entry.digest);
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function hashPackage(input: {
  metadata: Record<string, unknown>;
  files: HashFileEntry[];
}): Promise<string> {
  const hash = createHash("sha256");
  hash.update("metadata");
  hash.update("\0");
  hash.update(stableStringify(input.metadata));
  hash.update("\0");
  hash.update("files");
  hash.update("\0");
  hash.update(await hashFiles(input.files));
  return hash.digest("hex");
}

export function buildIdempotencyKey(input: {
  objectId: string;
  packageHash: string;
  accountProfile: string;
}): string {
  return `${input.objectId}:${input.packageHash}:${input.accountProfile}`;
}

function normalizeHashKey(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}
