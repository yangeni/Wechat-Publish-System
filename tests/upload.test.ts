import { describe, expect, it } from "vitest";
import { basename, join } from "node:path";
import { uploadAssets } from "../src/upload/asset-uploader.js";
import { buildDraftPayload } from "../src/publish/runner.js";
import { readBundle } from "../src/bundle/bundle.js";

describe("asset upload and draft payload", () => {
  it("uploads cover as media id and body assets as urls", async () => {
    const root = join(process.cwd(), "tests/fixtures/sample-bundle");
    const bundle = await readBundle(root);
    const uploaded = await uploadAssets({
      bundle,
      client: {
        async uploadPermanentImage() {
          return "COVER_MEDIA_ID";
        },
        async uploadArticleImage(filePath: string) {
          return `https://mmbiz.qpic.cn/${basename(filePath)}`;
        }
      }
    });
    expect(uploaded.coverMediaId).toBe("COVER_MEDIA_ID");
    expect(uploaded.imageUrlMap.get("assets/body.png")).toBe("https://mmbiz.qpic.cn/body.png");
    expect(uploaded.imageUrlMap.get("./assets/body.png")).toBe("https://mmbiz.qpic.cn/body.png");
    expect(uploaded.assetMap).toHaveLength(2);
  });

  it("does not upload a body asset when hashing it fails", async () => {
    const root = join(process.cwd(), "tests/fixtures/sample-bundle");
    const bundle = await readBundle(root);
    const bodyUploadPaths: string[] = [];

    await expect(uploadAssets({
      bundle: {
        ...bundle,
        assetPaths: [join(root, "assets/missing.png")]
      },
      client: {
        async uploadPermanentImage() {
          return "COVER_MEDIA_ID";
        },
        async uploadArticleImage(filePath: string) {
          bodyUploadPaths.push(filePath);
          return `https://mmbiz.qpic.cn/${basename(filePath)}`;
        }
      }
    })).rejects.toThrow();

    expect(bodyUploadPaths).toEqual([]);
  });

  it("builds a draft payload with explicit local profile controls", async () => {
    const payload = buildDraftPayload({
      title: "Title",
      author: "Author",
      digest: "Digest",
      content: "<article><p>Body</p></article>",
      thumbMediaId: "COVER_MEDIA_ID",
      needOpenComment: 0,
      onlyFansCanComment: 0
    });
    expect(payload).toEqual({
      articles: [{
        article_type: "news",
        title: "Title",
        author: "Author",
        digest: "Digest",
        content: "<article><p>Body</p></article>",
        thumb_media_id: "COVER_MEDIA_ID",
        need_open_comment: 0,
        only_fans_can_comment: 0
      }]
    });
  });
});
