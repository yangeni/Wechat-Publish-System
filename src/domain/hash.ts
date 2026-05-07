import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function sha256File(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

export async function hashFiles(filePaths: string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const filePath of [...filePaths].sort()) {
    hash.update(filePath);
    hash.update("\0");
    hash.update(await readFile(filePath));
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
