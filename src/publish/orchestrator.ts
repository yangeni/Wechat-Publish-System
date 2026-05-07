import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readBundle } from "../bundle/bundle.js";
import { sanitizeWechatHtml } from "../content/sanitizer.js";
import { buildIdempotencyKey, hashFiles } from "../domain/hash.js";
import type { AssetUploadMapEntry, PublishLedger, PublishProfile } from "../domain/types.js";
import { createLedgerPaths, existingLedgerForKey, writeLedger } from "../ledger/ledger.js";
import { uploadAssets, type UploadClient } from "../upload/asset-uploader.js";
import { buildDraftPayload } from "./runner.js";

export interface PublishClient extends UploadClient {
  addDraft(payload: unknown): Promise<string>;
  submitPublish(mediaId: string): Promise<string>;
  getPublishStatus(publishId: string): Promise<Record<string, unknown>>;
}

export interface RunPublishJobInput {
  bundleRoot: string;
  runtimeRoot: string;
  expectedJobId?: string;
  profile: PublishProfile;
  client: PublishClient;
}

class BlockedContentError extends Error {}

export async function runPublishJob(input: RunPublishJobInput): Promise<PublishLedger> {
  const startedAt = new Date().toISOString();
  const bundle = await readBundle(input.bundleRoot);
  if (input.expectedJobId && bundle.jobId !== input.expectedJobId) {
    throw new Error(`Bundle job_id (${bundle.jobId}) does not match requested job (${input.expectedJobId})`);
  }
  const packageHash = await hashFiles([
    bundle.articleHtmlPath,
    bundle.articleMarkdownPath,
    bundle.coverPath,
    ...bundle.assetPaths
  ]);
  const idempotencyKey = buildIdempotencyKey({
    objectId: bundle.objectId,
    packageHash,
    accountProfile: input.profile.accountProfile
  });

  const existing = await existingLedgerForKey(input.runtimeRoot, idempotencyKey);
  if (existing && !input.profile.forceNewDraft) return existing;

  const paths = createLedgerPaths(input.runtimeRoot, bundle.jobId);
  await mkdir(paths.jobDir, { recursive: true });

  const assetMap: AssetUploadMapEntry[] = [];
  let draftMediaId: string | undefined;
  let publishId: string | undefined;
  let publishStatus: number | undefined;
  let articleUrl: string | undefined;

  const writeCurrentLedger = async (status: PublishLedger["status"]): Promise<PublishLedger> => {
    const ledger: PublishLedger = {
      jobId: bundle.jobId,
      objectId: bundle.objectId,
      accountProfile: input.profile.accountProfile,
      packageHash,
      idempotencyKey,
      draftMediaId,
      publishId,
      publishStatus,
      articleUrl,
      assetMap,
      startedAt,
      finishedAt: new Date().toISOString(),
      status
    };
    await writeLedger(paths, ledger);
    return ledger;
  };

  try {
    const uploaded = await uploadAssets({ bundle, client: input.client, assetMap });
    const html = await readFile(bundle.articleHtmlPath, "utf8");
    const sanitized = sanitizeWechatHtml({ html, imageUrlMap: uploaded.imageUrlMap });
    if (sanitized.blockers.length > 0) {
      await writeCurrentLedger("blocked");
      throw new BlockedContentError(`blocked content: ${sanitized.blockers.join(", ")}`);
    }

    const draftPayload = buildDraftPayload({
      title: bundle.title,
      author: bundle.author || input.profile.defaultAuthor,
      digest: bundle.digest,
      content: sanitized.html,
      thumbMediaId: uploaded.coverMediaId,
      needOpenComment: input.profile.needOpenComment,
      onlyFansCanComment: input.profile.onlyFansCanComment
    });
    draftMediaId = await input.client.addDraft(draftPayload);
    await writeFile(paths.draftPayloadJson, JSON.stringify(draftPayload, null, 2), "utf8");

    let status: PublishLedger["status"] = "draft_saved";

    if (input.profile.submitPublish) {
      publishId = await input.client.submitPublish(draftMediaId);
      const publishResult = await pollPublishStatus(input.client, publishId, input.profile);
      publishStatus = typeof publishResult.publish_status === "number" ? publishResult.publish_status : undefined;
      const detail = publishResult.article_detail as { item?: Array<{ article_url?: string }> } | undefined;
      articleUrl = detail?.item?.[0]?.article_url;
      await writeFile(paths.publishResultJson, JSON.stringify(publishResult, null, 2), "utf8");
      status = publishStatus === 0 ? "published" : "failed";
    }

    return await writeCurrentLedger(status);
  } catch (error) {
    if (!(error instanceof BlockedContentError)) {
      try {
        await writeCurrentLedger("failed");
      } catch {
        // Preserve the original publishing failure; ledger write failures surface in separate verification.
      }
    }
    throw error;
  }
}

async function pollPublishStatus(
  client: PublishClient,
  publishId: string,
  profile: PublishProfile
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + profile.pollTimeoutSeconds * 1000;
  const intervalMs = profile.pollIntervalSeconds * 1000;

  for (;;) {
    const publishResult = await client.getPublishStatus(publishId);
    const publishStatus = publishResult.publish_status;
    if (publishStatus !== 1 || Date.now() >= deadline) return publishResult;

    await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
  }
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}
