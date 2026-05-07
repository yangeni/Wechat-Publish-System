import { basename } from "node:path";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { assertWechatOk } from "../domain/errors.js";
import type { HttpClient } from "./http.js";

const API_BASE = "https://api.weixin.qq.com";

const TokenSchema = z.object({
  access_token: z.string(),
  expires_in: z.number()
});

const WechatErrorSchema = z.object({
  errcode: z.number(),
  errmsg: z.string().optional()
});

const UploadImageSchema = z.object({
  url: z.string(),
  errcode: z.number().optional(),
  errmsg: z.string().optional()
});

const AddMaterialSchema = z.object({
  media_id: z.string(),
  url: z.string().optional(),
  errcode: z.number().optional(),
  errmsg: z.string().optional()
});

const DraftSchema = z.object({
  media_id: z.string(),
  errcode: z.number().optional(),
  errmsg: z.string().optional()
});

const SubmitSchema = z.object({
  errcode: z.number(),
  errmsg: z.string(),
  publish_id: z.string()
});

const PublishStatusSchema = z.object({
  publish_status: z.number(),
  errcode: z.number().optional(),
  errmsg: z.string().optional()
}).passthrough();

function parseWechatResponse<T>(raw: unknown, schema: z.ZodType<T>, action: string): T {
  const errorBody = WechatErrorSchema.safeParse(raw);
  if (errorBody.success && errorBody.data.errcode !== 0) {
    assertWechatOk(errorBody.data, action);
  }
  return schema.parse(raw);
}

export interface WechatClientOptions {
  http: HttpClient;
  appId: string;
  appSecret: string;
}

export class WechatClient {
  private token?: string;
  private tokenExpiresAtMs = 0;

  constructor(private readonly options: WechatClientOptions) {}

  async getAccessToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAtMs) return this.token;
    const url = `${API_BASE}/cgi-bin/token?grant_type=client_credential&appid=${this.options.appId}&secret=${this.options.appSecret}`;
    const parsed = parseWechatResponse(await this.options.http.getJson(url), TokenSchema, "get access token");
    this.token = parsed.access_token;
    this.tokenExpiresAtMs = Date.now() + parsed.expires_in * 1000;
    return this.token;
  }

  async uploadArticleImage(filePath: string): Promise<string> {
    const token = await this.getAccessToken();
    const form = new FormData();
    const bytes = await readFile(filePath);
    form.append("media", new Blob([bytes]), basename(filePath));
    const raw = await this.options.http.postForm(`${API_BASE}/cgi-bin/media/uploadimg?access_token=${token}`, form);
    const parsed = parseWechatResponse(raw, UploadImageSchema, "upload article image");
    return parsed.url;
  }

  async uploadPermanentImage(filePath: string): Promise<string> {
    const token = await this.getAccessToken();
    const form = new FormData();
    const bytes = await readFile(filePath);
    form.append("media", new Blob([bytes]), basename(filePath));
    const raw = await this.options.http.postForm(`${API_BASE}/cgi-bin/material/add_material?access_token=${token}&type=image`, form);
    const parsed = parseWechatResponse(raw, AddMaterialSchema, "upload permanent image");
    return parsed.media_id;
  }

  async addDraft(payload: unknown): Promise<string> {
    const token = await this.getAccessToken();
    const raw = await this.options.http.postJson(`${API_BASE}/cgi-bin/draft/add?access_token=${token}`, payload);
    const parsed = parseWechatResponse(raw, DraftSchema, "add draft");
    return parsed.media_id;
  }

  async submitPublish(mediaId: string): Promise<string> {
    const token = await this.getAccessToken();
    const raw = await this.options.http.postJson(`${API_BASE}/cgi-bin/freepublish/submit?access_token=${token}`, { media_id: mediaId });
    const parsed = parseWechatResponse(raw, SubmitSchema, "submit publish");
    return parsed.publish_id;
  }

  async getPublishStatus(publishId: string): Promise<Record<string, unknown>> {
    const token = await this.getAccessToken();
    const raw = await this.options.http.postJson(`${API_BASE}/cgi-bin/freepublish/get?access_token=${token}`, { publish_id: publishId });
    return parseWechatResponse(raw, PublishStatusSchema, "get publish status");
  }
}
