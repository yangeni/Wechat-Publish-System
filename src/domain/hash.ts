import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function sha256File(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

export async function hashFiles(filePaths: string[]): Promise<string> {
  const hash = createHash("sha256");
  const contentDigests = await Promise.all(filePaths.map(sha256File));
  for (const digest of contentDigests.sort()) {
    hash.update(digest);
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function buildIdempotencyKey(input: {
  objectId: string;
  packageHash: string;
  accountProfile: string;
}): string {
  return `${input.objectId}:${input.packageHash}:${input.accountProfile}`;
}
