import { describe, expect, it } from "vitest";
import { WechatClient } from "../src/wechat/client.js";
import type { HttpClient } from "../src/wechat/http.js";

describe("WechatClient", () => {
  it("requests access token with app credentials", async () => {
    const calls: string[] = [];
    const http: HttpClient = {
      async getJson(url) {
        calls.push(url);
        return { access_token: "TOKEN", expires_in: 7200 };
      },
      async postJson() {
        return {};
      },
      async postForm() {
        return {};
      }
    };
    const client = new WechatClient({ http, appId: "APPID", appSecret: "SECRET" });
    expect(await client.getAccessToken()).toBe("TOKEN");
    expect(calls[0]).toContain("/cgi-bin/token?grant_type=client_credential&appid=APPID&secret=SECRET");
  });

  it("creates drafts and submits publish requests", async () => {
    const posted: Array<{ url: string; body: unknown }> = [];
    const http: HttpClient = {
      async getJson() {
        return { access_token: "TOKEN", expires_in: 7200 };
      },
      async postJson(url, body) {
        posted.push({ url, body });
        if (url.includes("/draft/add")) return { media_id: "DRAFT_MEDIA_ID" };
        if (url.includes("/freepublish/submit")) return { errcode: 0, errmsg: "ok", publish_id: "PUB_ID" };
        if (url.includes("/freepublish/get")) return { publish_id: "PUB_ID", publish_status: 0, article_detail: { item: [{ article_url: "https://mp.weixin.qq.com/s/ok" }] } };
        return {};
      },
      async postForm() {
        return {};
      }
    };
    const client = new WechatClient({ http, appId: "APPID", appSecret: "SECRET" });
    expect(await client.addDraft({ articles: [] })).toBe("DRAFT_MEDIA_ID");
    expect(await client.submitPublish("DRAFT_MEDIA_ID")).toBe("PUB_ID");
    const status = await client.getPublishStatus("PUB_ID");
    expect(status.publish_status).toBe(0);
    expect(posted.map((item) => item.url)).toEqual([
      "https://api.weixin.qq.com/cgi-bin/draft/add?access_token=TOKEN",
      "https://api.weixin.qq.com/cgi-bin/freepublish/submit?access_token=TOKEN",
      "https://api.weixin.qq.com/cgi-bin/freepublish/get?access_token=TOKEN"
    ]);
  });
});
