import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { runPublishJob } from "../src/publish/orchestrator.js";

describe("runPublishJob", () => {
  it("creates a draft by default and does not submit publish", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "wechat-runtime-"));
    const bundleRoot = join(process.cwd(), "tests/fixtures/sample-bundle");
    const calls: string[] = [];
    const result = await runPublishJob({
      bundleRoot,
      runtimeRoot,
      profile: {
        accountProfile: "default",
        appIdEnv: "WECHAT_MP_APP_ID",
        appSecretEnv: "WECHAT_MP_APP_SECRET",
        submitPublish: false,
        forceNewDraft: false,
        pollTimeoutSeconds: 30,
        pollIntervalSeconds: 1,
        defaultAuthor: "CLngs",
        needOpenComment: 0,
        onlyFansCanComment: 0
      },
      client: {
        async uploadPermanentImage() {
          calls.push("uploadPermanentImage");
          return "COVER_MEDIA_ID";
        },
        async uploadArticleImage() {
          calls.push("uploadArticleImage");
          return "https://mmbiz.qpic.cn/body.png";
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
          return { publish_status: 0 };
        }
      }
    });
    expect(result.status).toBe("draft_saved");
    expect(result.draftMediaId).toBe("DRAFT_MEDIA_ID");
    expect(calls).toEqual(["uploadPermanentImage", "uploadArticleImage", "addDraft"]);
  });
});
