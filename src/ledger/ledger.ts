import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PublishLedger } from "../domain/types.js";

export interface LedgerPaths {
  jobDir: string;
  ledgerJson: string;
  assetUploadMapJson: string;
  draftPayloadJson: string;
  publishResultJson: string;
  reportMarkdown: string;
  rawResponsesDir: string;
}

export function createLedgerPaths(runtimeRoot: string, jobId: string): LedgerPaths {
  const jobDir = join(runtimeRoot, "publish-jobs", jobId);
  return {
    jobDir,
    ledgerJson: join(jobDir, "publish-ledger.json"),
    assetUploadMapJson: join(jobDir, "asset-upload-map.json"),
    draftPayloadJson: join(jobDir, "wechat-draft-payload.json"),
    publishResultJson: join(jobDir, "wechat-publish-result.json"),
    reportMarkdown: join(jobDir, "wechat-publish-report.md"),
    rawResponsesDir: join(jobDir, "raw-responses")
  };
}

export async function writeLedger(paths: LedgerPaths, ledger: PublishLedger): Promise<void> {
  await mkdir(paths.rawResponsesDir, { recursive: true });
  await writeFile(paths.ledgerJson, JSON.stringify(ledger, null, 2), "utf8");
  await writeFile(paths.assetUploadMapJson, JSON.stringify(ledger.assetMap, null, 2), "utf8");
  await writeFile(paths.reportMarkdown, renderReport(ledger), "utf8");
}

export async function existingLedgerForKey(runtimeRoot: string, idempotencyKey: string): Promise<PublishLedger | undefined> {
  const jobsRoot = join(runtimeRoot, "publish-jobs");
  let entries: string[] = [];
  try {
    entries = await readdir(jobsRoot);
  } catch {
    return undefined;
  }
  for (const entry of entries) {
    try {
      const raw = await readFile(join(jobsRoot, entry, "publish-ledger.json"), "utf8");
      const parsed = JSON.parse(raw) as PublishLedger;
      if (parsed.idempotencyKey === idempotencyKey) return parsed;
    } catch {
      continue;
    }
  }
  return undefined;
}

function renderReport(ledger: PublishLedger): string {
  return [
    "# WeChat Publish Report",
    "",
    `- job_id: ${ledger.jobId}`,
    `- object_id: ${ledger.objectId}`,
    `- account_profile: ${ledger.accountProfile}`,
    `- package_hash: ${ledger.packageHash}`,
    `- status: ${ledger.status}`,
    `- draft_media_id: ${ledger.draftMediaId ?? ""}`,
    `- publish_id: ${ledger.publishId ?? ""}`,
    `- article_url: ${ledger.articleUrl ?? ""}`,
    ""
  ].join("\n");
}
