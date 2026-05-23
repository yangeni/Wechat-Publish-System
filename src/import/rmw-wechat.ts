import { access, copyFile, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import * as cheerio from "cheerio";
import juice from "juice";

export interface ImportRmwWechatInput {
  writerRoot: string;
  publisherRoot: string;
  objectId: string;
  jobId?: string;
  author?: string;
  force?: boolean;
}

export interface ImportRmwWechatResult {
  jobId: string;
  bundleRoot: string;
  articleHtmlPath: string;
  articleMarkdownPath: string;
  coverPath: string;
  assetPaths: string[];
}

export async function importRmwWechatPackage(input: ImportRmwWechatInput): Promise<ImportRmwWechatResult> {
  const objectId = assertSafeName(input.objectId, "object id");
  const jobId = assertSafeName(input.jobId ?? objectId, "job id");
  const writerRoot = await realpath(resolve(input.writerRoot));
  const publisherRoot = resolve(input.publisherRoot);
  const wechatRoot = resolve(writerRoot, "runtime", "objects", objectId, "outputs", "wechat");
  const realWechatRoot = await realpath(wechatRoot);
  const bundleRoot = resolve(publisherRoot, "imports", jobId);

  await assertExists(resolve(realWechatRoot, "wechat_preview.html"), "Writer WeChat HTML preview");
  await assertExists(resolve(realWechatRoot, "wechat_markdown.md"), "Writer WeChat markdown draft");

  if (input.force) {
    await rm(bundleRoot, { recursive: true, force: true });
  } else {
    await assertMissing(bundleRoot);
  }

  await mkdir(bundleRoot, { recursive: true });
  const sourceHtmlPath = resolve(realWechatRoot, "wechat_preview.html");
  const sourceMarkdownPath = resolve(realWechatRoot, "wechat_markdown.md");
  const articleHtmlPath = resolve(bundleRoot, "article.html");
  const articleMarkdownPath = resolve(bundleRoot, "article.md");
  await copyFile(sourceMarkdownPath, articleMarkdownPath);

  const html = await readFile(sourceHtmlPath, "utf8");
  await writeFile(articleHtmlPath, buildWechatDraftHtml(html), "utf8");

  const metadata = extractWechatMetadata(html, input.author ?? "CLngs");
  const imagePaths = extractImagePaths(html);
  if (imagePaths.length === 0) throw new Error("Writer WeChat HTML has no images");
  const coverPath = metadata.coverSrc ?? imagePaths[0];
  if (!imagePaths.includes(coverPath)) imagePaths.unshift(coverPath);

  for (const assetPath of imagePaths) {
    const sourceAsset = await resolveInside(realWechatRoot, assetPath);
    const targetAsset = resolve(bundleRoot, assetPath);
    await mkdir(dirname(targetAsset), { recursive: true });
    await copyFile(sourceAsset, targetAsset);
  }

  const bundle = {
    job_id: jobId,
    object_id: objectId,
    title: metadata.title,
    author: metadata.author,
    digest: metadata.digest,
    article_html: "article.html",
    article_md: "article.md",
    cover_path: coverPath,
    asset_paths: imagePaths,
    source_bundle_hash: `writer:${objectId}`,
    platform: "wechat",
    publish_mode: "draft_only"
  };
  await writeFile(resolve(bundleRoot, "bundle.json"), `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

  return {
    jobId,
    bundleRoot,
    articleHtmlPath,
    articleMarkdownPath,
    coverPath: resolve(bundleRoot, coverPath),
    assetPaths: imagePaths.map((assetPath) => resolve(bundleRoot, assetPath))
  };
}

export function buildWechatDraftHtml(html: string): string {
  const inlined = juice(html, {
    applyStyleTags: true,
    removeStyleTags: true,
    preserveMediaQueries: false,
    preserveFontFaces: false,
    preserveKeyFrames: false,
    preservePseudos: false,
    resolveCSSVariables: true
  });
  const $ = cheerio.load(inlined);
  $("script, style, meta, title").remove();
  $("[style]").each((_, element) => {
    const style = $(element).attr("style") ?? "";
    $(element).attr("style", normalizeInlineStyle(style));
  });
  const bodyHtml = $("body").html() ?? $.root().html() ?? inlined;
  return `${bodyHtml.trim()}\n`;
}

function normalizeInlineStyle(style: string): string {
  return style
    .replace(/width:\s*min\(100%,\s*([0-9]+px)\);/g, "width: 100%; max-width: $1;")
    .replace(/font-size:\s*clamp\((\d+)px,\s*[^,]+,\s*(\d+)px\);/g, (_, min, max) => {
      const safeSize = Math.round((Number(min) + Number(max)) / 2);
      return `font-size: ${safeSize}px;`;
    })
    .replace(/\s+/g, " ")
    .trim();
}

export function extractWechatMetadata(html: string, author: string): { title: string; author: string; digest: string; coverSrc?: string } {
  const $ = cheerio.load(html);
  const title = cleanText($("title").first().text()) || cleanText($("h1").first().text());
  const digest = cleanText($(".deck").first().text()) || cleanText($("p").first().text()).slice(0, 120);
  const coverSrc = normalizeBundleAssetPath($(".cover img[src]").first().attr("src") ?? "");
  if (!title) throw new Error("Writer WeChat HTML has no title");
  return { title, author, digest, coverSrc: coverSrc || undefined };
}

export function extractImagePaths(html: string): string[] {
  const $ = cheerio.load(html);
  const paths: string[] = [];
  $("img[src]").each((_, element) => {
    const path = normalizeBundleAssetPath($(element).attr("src") ?? "");
    if (path && !paths.includes(path)) paths.push(path);
  });
  return paths;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeBundleAssetPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith("//") || isAbsolute(trimmed)) {
    return "";
  }
  const withoutQuery = trimmed.split(/[?#]/, 1)[0] ?? "";
  return withoutQuery.replace(/\\/g, "/").replace(/^\.\//, "");
}

async function resolveInside(root: string, unsafeRelativePath: string): Promise<string> {
  const safeRelativePath = normalizeBundleAssetPath(unsafeRelativePath);
  if (!safeRelativePath) throw new Error(`Unsupported asset path: ${unsafeRelativePath}`);

  const resolvedPath = resolve(root, safeRelativePath);
  const relativePath = relative(root, resolvedPath);
  if (isOutside(relativePath)) throw new Error(`Asset path escapes Writer package: ${unsafeRelativePath}`);

  const realPath = await realpath(resolvedPath);
  const realRelativePath = relative(root, realPath);
  if (isOutside(realRelativePath)) throw new Error(`Asset path resolves outside Writer package: ${unsafeRelativePath}`);
  return realPath;
}

function isOutside(relativePath: string): boolean {
  return relativePath === ".." || relativePath.startsWith("../") || isAbsolute(relativePath);
}

async function assertExists(path: string, label: string): Promise<void> {
  try {
    await access(path);
  } catch {
    throw new Error(`${label} not found: ${path}`);
  }
}

async function assertMissing(path: string): Promise<void> {
  try {
    await access(path);
  } catch {
    return;
  }
  throw new Error(`Import target already exists, pass --force to replace: ${path}`);
}

function assertSafeName(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "." || trimmed === ".." || trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) {
    throw new Error(`Unsafe ${label}: ${value}`);
  }
  return trimmed;
}
