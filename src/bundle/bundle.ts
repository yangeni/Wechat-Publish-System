import { readFile, realpath } from "node:fs/promises";
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

async function resolveBundlePath(realBundleRoot: string, bundlePath: string): Promise<string> {
  if (isAbsolute(bundlePath)) {
    throw new Error(`Bundle path must be relative: ${bundlePath}`);
  }

  const resolvedPath = resolve(realBundleRoot, bundlePath);
  const relativePath = relative(realBundleRoot, resolvedPath);

  if (!isPathInsideRoot(relativePath)) {
    throw new Error(`Bundle path escapes bundle root: ${bundlePath}`);
  }

  const realPath = await realpath(resolvedPath);
  const realRelativePath = relative(realBundleRoot, realPath);
  if (!isPathInsideRoot(realRelativePath)) {
    throw new Error(`Bundle path resolves outside bundle root: ${bundlePath}`);
  }

  return realPath;
}

function isPathInsideRoot(relativePath: string): boolean {
  return relativePath === "" || (relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath));
}

export async function readBundle(bundleRoot: string): Promise<PublishBundle> {
  const resolvedBundleRoot = await realpath(resolve(bundleRoot));
  const raw = JSON.parse(await readFile(resolve(resolvedBundleRoot, "bundle.json"), "utf8"));
  const parsed = BundleSchema.parse(raw);
  return {
    jobId: parsed.job_id,
    objectId: parsed.object_id,
    title: parsed.title,
    author: parsed.author,
    digest: parsed.digest,
    articleHtmlPath: await resolveBundlePath(resolvedBundleRoot, parsed.article_html),
    articleMarkdownPath: await resolveBundlePath(resolvedBundleRoot, parsed.article_md),
    coverPath: await resolveBundlePath(resolvedBundleRoot, parsed.cover_path),
    assetPaths: await Promise.all(parsed.asset_paths.map((assetPath) => resolveBundlePath(resolvedBundleRoot, assetPath))),
    sourceBundleHash: parsed.source_bundle_hash,
    platform: parsed.platform,
    publishMode: parsed.publish_mode,
    bundleRoot: resolvedBundleRoot
  };
}
