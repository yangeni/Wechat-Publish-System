import { describe, expect, it } from "vitest";
import { sanitizeWechatHtml } from "../src/content/sanitizer.js";

describe("sanitizeWechatHtml", () => {
  it("replaces local image paths with WeChat URLs", () => {
    const result = sanitizeWechatHtml({
      html: '<article><p>Hello</p><img src="assets/body.png" alt="body"></article>',
      imageUrlMap: new Map([["assets/body.png", "https://mmbiz.qpic.cn/body"]])
    });
    expect(result.html).toContain('src="https://mmbiz.qpic.cn/body"');
    expect(result.blockers).toEqual([]);
  });

  it("blocks scripts and local absolute paths", () => {
    const result = sanitizeWechatHtml({
      html: '<article><script>alert(1)</script><img src="/Users/clngs/private.png"></article>',
      imageUrlMap: new Map()
    });
    expect(result.blockers).toContain("script_tag_present");
    expect(result.blockers).toContain("local_absolute_image_path:/Users/clngs/private.png");
  });

  it("blocks internal workflow terms", () => {
    const result = sanitizeWechatHtml({
      html: "<article><p>DRPUB-026 Gate runtime/objects note</p></article>",
      imageUrlMap: new Map()
    });
    expect(result.blockers).toContain("internal_term:DRPUB");
    expect(result.blockers).toContain("internal_term:Gate");
    expect(result.blockers).toContain("internal_term:runtime/objects");
  });
});
