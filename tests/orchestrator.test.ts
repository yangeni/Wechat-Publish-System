import { describe, expect, it } from "vitest";
import { basename, join } from "node:path";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createLedgerPaths } from "../src/ledger/ledger.js";
import { parseCliOptions } from "../src/publish/cli-options.js";
import { type PublishClient, runPublishJob } from "../src/publish/orchestrator.js";
import type { PublishLedger, PublishProfile } from "../src/domain/types.js";

const sampleBundleRoot = join(process.cwd(), "tests/fixtures/sample-bundle");

function profile(overrides: Partial<PublishProfile> = {}): PublishProfile {
  return {
    accountProfile: "default",
    appIdEnv: "WECHAT_MP_APP_ID",
    appSecretEnv: "WECHAT_MP_APP_SECRET",
    submitPublish: false,
    forceNewDraft: false,
    pollTimeoutSeconds: 30,
    pollIntervalSeconds: 1,
    defaultAuthor: "CLngs",
    needOpenComment: 0,
    onlyFansCanComment: 0,
    ...overrides
  };
}

function client(calls: string[] = [], overrides: Partial<PublishClient> = {}): PublishClient {
  return {
    async uploadPermanentImage() {
      calls.push("uploadPermanentImage");
      return "COVER_MEDIA_ID";
    },
    async uploadArticleImage(filePath: string) {
      calls.push("uploadArticleImage");
      return `https://mmbiz.qpic.cn/${basename(filePath)}`;
    },
    async addDraft() {
      calls.push("addDraft");
      return "DRAFT_MEDIA_ID";
    },
    async submitPublish() {
      calls.push("submitPublish");
      return "PUB_ID";
    },
    async getPublishStatus() {
      calls.push("getPublishStatus");
      return {
        publish_status: 0,
        article_detail: {
          item: [{ article_url: "https://mp.weixin.qq.com/s/article" }]
        }
      };
    },
    ...overrides
  };
}

async function runtimeRoot(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "wechat-runtime-"));
}

async function copiedBundleRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "wechat-bundle-"));
  await cp(sampleBundleRoot, root, { recursive: true });
  return root;
}

async function readLedger(root: string, jobId = "JOB-001"): Promise<PublishLedger> {
  const paths = createLedgerPaths(root, jobId);
  return JSON.parse(await readFile(paths.ledgerJson, "utf8")) as PublishLedger;
}

describe("runPublishJob", () => {
  it("creates a draft by default and does not submit publish", async () => {
    const root = await runtimeRoot();
    const calls: string[] = [];
    const result = await runPublishJob({
      bundleRoot: sampleBundleRoot,
      runtimeRoot: root,
      profile: profile(),
      client: client(calls)
    });
    expect(result.status).toBe("draft_saved");
    expect(result.draftMediaId).toBe("DRAFT_MEDIA_ID");
    expect(calls).toEqual(["uploadPermanentImage", "uploadArticleImage", "addDraft"]);
  });

  it("returns an existing ledger for the same idempotency key", async () => {
    const root = await runtimeRoot();
    const first = await runPublishJob({
      bundleRoot: sampleBundleRoot,
      runtimeRoot: root,
      profile: profile(),
      client: client()
    });

    const secondCalls: string[] = [];
    const second = await runPublishJob({
      bundleRoot: sampleBundleRoot,
      runtimeRoot: root,
      profile: profile(),
      client: client(secondCalls)
    });

    expect(second.draftMediaId).toBe(first.draftMediaId);
    expect(secondCalls).toEqual([]);
  });

  it("writes a blocked ledger when sanitized content has blockers", async () => {
    const root = await runtimeRoot();
    const bundleRoot = await copiedBundleRoot();
    await writeFile(join(bundleRoot, "article.html"), "<article><script>alert(1)</script><img src=\"assets/body.png\"></article>", "utf8");

    await expect(runPublishJob({
      bundleRoot,
      runtimeRoot: root,
      profile: profile(),
      client: client()
    })).rejects.toThrow("blocked content");

    const ledger = await readLedger(root);
    expect(ledger.status).toBe("blocked");
    expect(ledger.assetMap).toHaveLength(2);
    expect(ledger.draftMediaId).toBeUndefined();
  });

  it("writes a failed ledger with known uploaded assets when publishing throws", async () => {
    const root = await runtimeRoot();
    await expect(runPublishJob({
      bundleRoot: sampleBundleRoot,
      runtimeRoot: root,
      profile: profile(),
      client: client([], {
        async uploadArticleImage() {
          throw new Error("upload failed");
        }
      })
    })).rejects.toThrow("upload failed");

    const ledger = await readLedger(root);
    expect(ledger.status).toBe("failed");
    expect(ledger.assetMap).toEqual([expect.objectContaining({
      role: "cover",
      mediaId: "COVER_MEDIA_ID"
    })]);
  });

  it("submits publish only when the profile explicitly enables it", async () => {
    const root = await runtimeRoot();
    const calls: string[] = [];
    const result = await runPublishJob({
      bundleRoot: sampleBundleRoot,
      runtimeRoot: root,
      profile: profile({ submitPublish: true }),
      client: client(calls)
    });

    expect(result.status).toBe("published");
    expect(result.publishId).toBe("PUB_ID");
    expect(result.articleUrl).toBe("https://mp.weixin.qq.com/s/article");
    expect(calls).toEqual(["uploadPermanentImage", "uploadArticleImage", "addDraft", "submitPublish", "getPublishStatus"]);
  });
});

describe("parseCliOptions", () => {
  it("resolves a safe job id to imports/<job_id>", () => {
    const options = parseCliOptions(["--job", "JOB-001"], "/workspace");
    expect(options.jobId).toBe("JOB-001");
    expect(options.profileName).toBe("default");
    expect(options.bundleRoot).toBe("/workspace/imports/JOB-001");
    expect(options.runtimeRoot).toBe("/workspace/runtime");
    expect(options.submitPublish).toBe(false);
    expect(options.forceNewDraft).toBe(false);
  });

  it("accepts explicit bundle, submit, and force options", () => {
    const options = parseCliOptions([
      "--bundle", "imports/JOB-001",
      "--profile", "prod",
      "--submit-publish",
      "--force"
    ], "/workspace");
    expect(options.jobId).toBe("JOB-001");
    expect(options.profileName).toBe("prod");
    expect(options.bundleRoot).toBe("/workspace/imports/JOB-001");
    expect(options.submitPublish).toBe(true);
    expect(options.forceNewDraft).toBe(true);
  });

  it("rejects unsafe job, profile, and bundle paths", () => {
    expect(() => parseCliOptions(["--job", "../../outside"], "/workspace")).toThrow("Unsafe job");
    expect(() => parseCliOptions(["--job", "JOB-001", "--profile", "../secret"], "/workspace")).toThrow("Unsafe profile");
    expect(() => parseCliOptions(["--bundle", "../outside"], "/workspace")).toThrow("Bundle path must be exactly imports/<job_id>");
  });

  it("rejects mismatched job and bundle directory", () => {
    expect(() => parseCliOptions(["--job", "JOB-001", "--bundle", "imports/JOB-002"], "/workspace")).toThrow("must match");
  });
});
