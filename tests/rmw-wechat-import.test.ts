import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildWechatDraftHtml, extractImagePaths, extractWechatMetadata, importRmwWechatPackage } from "../src/import/rmw-wechat.js";

const html = `<!doctype html><html><head><title>标题</title><style>.deck{color:#536f7c;font-size:clamp(17px,3vw,21px)}.cover{border-radius:22px;width:min(100%,860px)}</style></head><body><main><div class="cover"><img src="assets/cover.png"></div><article><p class="deck">摘要内容</p><figure><img src="assets/body.png"></figure></article></main></body></html>`;

describe("RMW WeChat importer", () => {
  it("extracts metadata and relative image paths", () => {
    expect(extractWechatMetadata(html, "Author")).toEqual({
      title: "标题",
      author: "Author",
      digest: "摘要内容",
      coverSrc: "assets/cover.png"
    });
    expect(extractImagePaths(html)).toEqual(["assets/cover.png", "assets/body.png"]);
  });

  it("converts preview CSS into inline WeChat draft HTML", () => {
    const draftHtml = buildWechatDraftHtml(html);
    expect(draftHtml).not.toContain("<style");
    expect(draftHtml).not.toContain("<title");
    expect(draftHtml).toContain("style=");
    expect(draftHtml).toContain("color: #536f7c");
    expect(draftHtml).not.toContain("clamp(");
    expect(draftHtml).not.toContain("min(100%");
  });

  it("imports a Writer WeChat package into publisher bundle format", async () => {
    const writerRoot = await mkdtemp(join(tmpdir(), "rmw-writer-"));
    const publisherRoot = await mkdtemp(join(tmpdir(), "rmw-publisher-"));
    const wechatRoot = join(writerRoot, "runtime/objects/DRPUB-999/outputs/wechat");
    await mkdir(join(wechatRoot, "assets"), { recursive: true });
    await writeFile(join(wechatRoot, "wechat_preview.html"), html, "utf8");
    await writeFile(join(wechatRoot, "wechat_markdown.md"), "# 标题\n", "utf8");
    await writeFile(join(wechatRoot, "assets/cover.png"), "cover");
    await writeFile(join(wechatRoot, "assets/body.png"), "body");

    const result = await importRmwWechatPackage({ writerRoot, publisherRoot, objectId: "DRPUB-999" });
    const bundle = JSON.parse(await readFile(join(result.bundleRoot, "bundle.json"), "utf8"));

    expect(bundle).toMatchObject({
      job_id: "DRPUB-999",
      object_id: "DRPUB-999",
      title: "标题",
      digest: "摘要内容",
      cover_path: "assets/cover.png",
      asset_paths: ["assets/cover.png", "assets/body.png"],
      platform: "wechat",
      publish_mode: "draft_only"
    });
    const articleHtml = await readFile(join(result.bundleRoot, "article.html"), "utf8");
    expect(articleHtml).toContain("style=");
    expect(await readFile(join(result.bundleRoot, "assets/body.png"), "utf8")).toBe("body");
  });
});
