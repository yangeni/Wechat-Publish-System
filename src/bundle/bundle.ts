import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { PublishBundle } from "../domain/types.js";

const BundleSchema = z.object({
  job_id: z.string().min(1),
  object_id: z.string().min(1),
  title: z.string().min(1),
  author: z.string().default(""),
  digest: z.string().default(""),
  article_html: z.string().min(1),
  article_md: z.string().min(1),
  cover_path: z.string().min(1),
  asset_paths: z.array(z.string().min(1)).default([]),
  source_bundle_hash: z.string().default(""),
  platform: z.literal("wechat"),
  publish_mode: z.enum(["draft_only", "draft_and_publish"]).default("draft_only")
});

export async function readBundle(bundleRoot: string): Promise<PublishBundle> {
  const raw = JSON.parse(await readFile(join(bundleRoot, "bundle.json"), "utf8"));
  const parsed = BundleSchema.parse(raw);
  return {
    jobId: parsed.job_id,
    objectId: parsed.object_id,
    title: parsed.title,
    author: parsed.author,
    digest: parsed.digest,
    articleHtmlPath: join(bundleRoot, parsed.article_html),
    articleMarkdownPath: join(bundleRoot, parsed.article_md),
    coverPath: join(bundleRoot, parsed.cover_path),
    assetPaths: parsed.asset_paths.map((assetPath) => join(bundleRoot, assetPath)),
    sourceBundleHash: parsed.source_bundle_hash,
    platform: parsed.platform,
    publishMode: parsed.publish_mode,
    bundleRoot
  };
}
