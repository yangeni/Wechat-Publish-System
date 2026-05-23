import { describe, expect, it, vi } from "vitest";
import { WechatClient } from "../src/wechat/client.js";
import { FetchHttpClient, type HttpClient } from "../src/wechat/http.js";

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

  it("classifies add draft WeChat errors before success validation", async () => {
    const http: HttpClient = {
      async getJson() {
        return { access_token: "TOKEN", expires_in: 7200 };
      },
      async postJson() {
        return { errcode: 48001, errmsg: "api unauthorized" };
      },
      async postForm() {
        return {};
      }
    };
    const client = new WechatClient({ http, appId: "APPID", appSecret: "SECRET" });
    await expect(client.addDraft({ articles: [] })).rejects.toThrow(/BLOCKED_AUTH/);
  });

  it("refreshes access token after expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    try {
      let tokenRequests = 0;
      const posted: string[] = [];
      const http: HttpClient = {
        async getJson() {
          tokenRequests += 1;
          return { access_token: `TOKEN_${tokenRequests}`, expires_in: 1 };
        },
        async postJson(url) {
          posted.push(url);
          return { media_id: "DRAFT_MEDIA_ID" };
        },
        async postForm() {
          return {};
        }
      };
      const client = new WechatClient({ http, appId: "APPID", appSecret: "SECRET" });

      await client.addDraft({ articles: [] });
      vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
      await client.addDraft({ articles: [] });

      expect(tokenRequests).toBe(2);
      expect(posted).toEqual([
        "https://api.weixin.qq.com/cgi-bin/draft/add?access_token=TOKEN_1",
        "https://api.weixin.qq.com/cgi-bin/draft/add?access_token=TOKEN_2"
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("classifies publish status WeChat errors", async () => {
    const http: HttpClient = {
      async getJson() {
        return { access_token: "TOKEN", expires_in: 7200 };
      },
      async postJson() {
        return { errcode: 48001, errmsg: "api unauthorized" };
      },
      async postForm() {
        return {};
      }
    };
    const client = new WechatClient({ http, appId: "APPID", appSecret: "SECRET" });
    await expect(client.getPublishStatus("PUB_ID")).rejects.toThrow(/BLOCKED_AUTH/);
  });

  it("throws status code details for non-2xx HTTP responses", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response("upstream failed", { status: 503, statusText: "Service Unavailable" }));
    try {
      const http = new FetchHttpClient();
      await expect(http.getJson("https://api.weixin.qq.com/test")).rejects.toThrow(/503/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
