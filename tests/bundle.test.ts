import { describe, expect, it } from "vitest";
import { basename, join } from "node:path";
import { mkdtemp, symlink, writeFile } from "node:fs/promises";
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

  it("rejects symlinked bundle files that resolve outside the bundle root", async () => {
    const root = await mkdtemp(join(tmpdir(), "wechat-bundle-"));
    const outside = await mkdtemp(join(tmpdir(), "wechat-outside-"));
    await writeFile(join(outside, "article.html"), "<article>outside</article>", "utf8");
    await symlink(join(outside, "article.html"), join(root, "article.html"));
    await writeFile(
      join(root, "bundle.json"),
      JSON.stringify({
        job_id: "JOB-003",
        object_id: "DRPUB-028",
        title: "Symlink bundle",
        article_html: "article.html",
        article_md: "article.md",
        cover_path: "cover.png",
        asset_paths: [],
        platform: "wechat"
      }),
      "utf8"
    );

    await expect(readBundle(root)).rejects.toThrow("resolves outside bundle root");
  });

  it("allows bundle paths whose directory name only starts with dots", async () => {
    const root = await mkdtemp(join(tmpdir(), "wechat-bundle-"));
    await writeFile(join(root, "article.md"), "# Body", "utf8");
    await writeFile(join(root, "cover.png"), "cover", "utf8");
    await writeFile(join(root, "..foo.html"), "<article>body</article>", "utf8");
    await writeFile(
      join(root, "bundle.json"),
      JSON.stringify({
        job_id: "JOB-004",
        object_id: "DRPUB-029",
        title: "Dot prefix bundle",
        article_html: "..foo.html",
        article_md: "article.md",
        cover_path: "cover.png",
        asset_paths: [],
        platform: "wechat"
      }),
      "utf8"
    );

    const bundle = await readBundle(root);
    expect(basename(bundle.articleHtmlPath)).toBe("..foo.html");
  });
});
