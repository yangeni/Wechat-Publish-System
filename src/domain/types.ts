export type PublishMode = "draft_only" | "draft_and_publish";
export type RuntimeStatus = "draft_saved" | "published" | "blocked" | "failed";
export type ErrorKind = "OK" | "BLOCKED_AUTH" | "BLOCKED_CONTENT" | "RETRYABLE" | "PUBLISH_FAILED_PLATFORM" | "UNKNOWN";

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

export interface PublishProfile {
  accountProfile: string;
  appIdEnv: string;
  appSecretEnv: string;
  submitPublish: boolean;
  forceNewDraft: boolean;
  pollTimeoutSeconds: number;
  pollIntervalSeconds: number;
  defaultAuthor: string;
  needOpenComment: 0 | 1;
  onlyFansCanComment: 0 | 1;
}

export interface WechatApiErrorLike {
  errcode?: number;
  errmsg?: string;
}

export interface ClassifiedError {
  kind: ErrorKind;
  retryable: boolean;
  errcode?: number;
  errmsg: string;
}

export interface AssetUploadMapEntry {
  localPath: string;
  sha256: string;
  role: "cover" | "body";
  wechatUrl?: string;
  mediaId?: string;
}

export interface PublishLedger {
  jobId: string;
  objectId: string;
  accountProfile: string;
  packageHash: string;
  idempotencyKey: string;
  draftMediaId?: string;
  publishId?: string;
  publishStatus?: number;
  articleUrl?: string;
  assetMap: AssetUploadMapEntry[];
  startedAt: string;
  finishedAt?: string;
  status: RuntimeStatus;
}
