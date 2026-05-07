import { describe, expect, it } from "vitest";
import { buildIdempotencyKey, hashFiles } from "../src/domain/hash.js";
import { classifyWechatError } from "../src/domain/errors.js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("domain helpers", () => {
  it("builds a stable idempotency key", () => {
    expect(buildIdempotencyKey({
      objectId: "DRPUB-026",
      packageHash: "abc123",
      accountProfile: "default"
    })).toBe("DRPUB-026:abc123:default");
  });

  it("classifies auth and content failures", () => {
    expect(classifyWechatError({ errcode: 48001, errmsg: "api unauthorized" }).kind).toBe("BLOCKED_AUTH");
    expect(classifyWechatError({ errcode: 40009, errmsg: "invalid image size" }).kind).toBe("BLOCKED_CONTENT");
    expect(classifyWechatError({ errcode: 0, errmsg: "ok" }).kind).toBe("OK");
  });

  it("hashes files in a deterministic order", async () => {
    const root = join(tmpdir(), `wechat-publisher-${Date.now()}`);
    await mkdir(root, { recursive: true });
    const a = join(root, "a.txt");
    const b = join(root, "b.txt");
    await writeFile(a, "alpha");
    await writeFile(b, "beta");
    const first = await hashFiles([b, a]);
    const second = await hashFiles([a, b]);
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });
});
