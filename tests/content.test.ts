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

  it("removes executable URL and event handler attributes", () => {
    const result = sanitizeWechatHtml({
      html: '<article><a href="javascript:alert(1)">bad</a><img src="assets/body.png" onerror="alert(1)"></article>',
      imageUrlMap: new Map([["assets/body.png", "https://mmbiz.qpic.cn/body"]])
    });
    expect(result.blockers).toContain("unsafe_url:href:javascript:alert(1)");
    expect(result.blockers).toContain("event_handler:onerror");
    expect(result.html).not.toContain("javascript:");
    expect(result.html).not.toContain("onerror=");
  });

  it("does not block Gate inside normal prose words", () => {
    const result = sanitizeWechatHtml({
      html: "<article><p>Bill Gates wrote about the gateway market.</p></article>",
      imageUrlMap: new Map()
    });
    expect(result.blockers).not.toContain("internal_term:Gate");
  });

  it("preserves sanitized article fragment shape", () => {
    const result = sanitizeWechatHtml({
      html: '<article><p>Hello</p><img src="assets/body.png"></article>',
      imageUrlMap: new Map([["assets/body.png", "https://mmbiz.qpic.cn/body"]])
    });
    expect(result.html).toMatch(/^<article/);
    expect(result.html).not.toContain("<html");
    expect(result.html).not.toContain("<body");
  });
});
