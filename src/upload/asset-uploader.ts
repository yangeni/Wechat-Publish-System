import { relative } from "node:path";
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

export async function uploadAssets(input: {
  bundle: PublishBundle;
  client: UploadClient;
}): Promise<UploadAssetsResult> {
  const assetMap: AssetUploadMapEntry[] = [];
  const coverMediaId = await input.client.uploadPermanentImage(input.bundle.coverPath);
  assetMap.push({
    localPath: input.bundle.coverPath,
    sha256: await sha256File(input.bundle.coverPath),
    role: "cover",
    mediaId: coverMediaId
  });

  const imageUrlMap = new Map<string, string>();
  for (const assetPath of input.bundle.assetPaths) {
    const bundleRelativePath = relative(input.bundle.bundleRoot, assetPath);
    const wechatUrl = await input.client.uploadArticleImage(assetPath);
    imageUrlMap.set(bundleRelativePath, wechatUrl);
    assetMap.push({
      localPath: assetPath,
      sha256: await sha256File(assetPath),
      role: "body",
      wechatUrl
    });
  }

  return { coverMediaId, imageUrlMap, assetMap };
}
