import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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

  it("rejects bundle paths that escape the bundle root", async () => {
    const root = await mkdtemp(join(tmpdir(), "wechat-bundle-"));
    await writeFile(
      join(root, "bundle.json"),
      JSON.stringify({
        job_id: "JOB-002",
        object_id: "DRPUB-027",
        title: "Escaping bundle",
        article_html: "../outside.html",
        article_md: "article.md",
        cover_path: "cover/cover.png",
        asset_paths: [],
        platform: "wechat"
      }),
      "utf8"
    );

    await expect(readBundle(root)).rejects.toThrow();
  });
});
