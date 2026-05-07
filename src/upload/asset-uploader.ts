import { relative, sep } from "node:path";
import type { AssetUploadMapEntry, PublishBundle } from "../domain/types.js";
import { sha256File } from "../domain/hash.js";

export interface UploadClient {
  uploadPermanentImage(filePath: string): Promise<string>;
  uploadArticleImage(filePath: string): Promise<string>;
}

export interface UploadAssetsResult {
  coverMediaId: string;
  imageUrlMap: Map<string, string>;
  assetMap: AssetUploadMapEntry[];
}

export function toBundleUrlPath(bundleRoot: string, assetPath: string): string {
  return relative(bundleRoot, assetPath)
    .split(sep)
    .join("/")
    .replace(/^\.\//, "");
}

export async function uploadAssets(input: {
  bundle: PublishBundle;
  client: UploadClient;
}): Promise<UploadAssetsResult> {
  const assetMap: AssetUploadMapEntry[] = [];
  const coverSha256 = await sha256File(input.bundle.coverPath);
  const coverMediaId = await input.client.uploadPermanentImage(input.bundle.coverPath);
  assetMap.push({
    localPath: input.bundle.coverPath,
    sha256: coverSha256,
    role: "cover",
    mediaId: coverMediaId
  });

  const imageUrlMap = new Map<string, string>();
  for (const assetPath of input.bundle.assetPaths) {
    const bundleRelativePath = toBundleUrlPath(input.bundle.bundleRoot, assetPath);
    const assetSha256 = await sha256File(assetPath);
    const wechatUrl = await input.client.uploadArticleImage(assetPath);
    imageUrlMap.set(bundleRelativePath, wechatUrl);
    imageUrlMap.set(`./${bundleRelativePath}`, wechatUrl);
    assetMap.push({
      localPath: assetPath,
      sha256: assetSha256,
      role: "body",
      wechatUrl
    });
  }

  return { coverMediaId, imageUrlMap, assetMap };
}
