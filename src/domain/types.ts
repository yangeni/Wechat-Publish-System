export type PublishMode = "draft_only" | "draft_and_publish";

export interface PublishBundle {
  jobId: string;
  objectId: string;
  title: string;
  author: string;
  digest: string;
  articleHtmlPath: string;
  articleMarkdownPath: string;
  coverPath: string;
  assetPaths: string[];
  sourceBundleHash: string;
  platform: "wechat";
  publishMode: PublishMode;
  bundleRoot: string;
}
