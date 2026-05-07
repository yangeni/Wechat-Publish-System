import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { readBundle } from "../src/bundle/bundle.js";

describe("readBundle", () => {
  it("reads paths relative to the bundle root", async () => {
    const root = join(process.cwd(), "tests/fixtures/sample-bundle");
    const bundle = await readBundle(root);
    expect(bundle.jobId).toBe("JOB-001");
    expect(bundle.platform).toBe("wechat");
    expect(bundle.articleHtmlPath).toBe(join(root, "article.html"));
    expect(bundle.coverPath).toBe(join(root, "cover/cover.png"));
    expect(bundle.assetPaths).toEqual([join(root, "assets/body.png")]);
    expect(bundle.publishMode).toBe("draft_and_publish");
  });
});
