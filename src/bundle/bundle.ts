import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
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

function resolveBundlePath(bundleRoot: string, bundlePath: string): string {
  if (isAbsolute(bundlePath)) {
    throw new Error(`Bundle path must be relative: ${bundlePath}`);
  }

  const resolvedBundleRoot = resolve(bundleRoot);
  const resolvedPath = resolve(resolvedBundleRoot, bundlePath);
  const relativePath = relative(resolvedBundleRoot, resolvedPath);

  if (relativePath.split(sep)[0] === "..") {
    throw new Error(`Bundle path escapes bundle root: ${bundlePath}`);
  }

  return resolvedPath;
}

export async function readBundle(bundleRoot: string): Promise<PublishBundle> {
  const resolvedBundleRoot = resolve(bundleRoot);
  const raw = JSON.parse(await readFile(resolve(resolvedBundleRoot, "bundle.json"), "utf8"));
  const parsed = BundleSchema.parse(raw);
  return {
    jobId: parsed.job_id,
    objectId: parsed.object_id,
    title: parsed.title,
    author: parsed.author,
    digest: parsed.digest,
    articleHtmlPath: resolveBundlePath(resolvedBundleRoot, parsed.article_html),
    articleMarkdownPath: resolveBundlePath(resolvedBundleRoot, parsed.article_md),
    coverPath: resolveBundlePath(resolvedBundleRoot, parsed.cover_path),
    assetPaths: parsed.asset_paths.map((assetPath) => resolveBundlePath(resolvedBundleRoot, assetPath)),
    sourceBundleHash: parsed.source_bundle_hash,
    platform: parsed.platform,
    publishMode: parsed.publish_mode,
    bundleRoot: resolvedBundleRoot
  };
}
