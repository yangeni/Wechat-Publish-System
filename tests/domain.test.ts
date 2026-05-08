import { describe, expect, it } from "vitest";
import { buildIdempotencyKey, hashFiles, hashPackage } from "../src/domain/hash.js";
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
    expect(classifyWechatError({ errcode: 40125, errmsg: "invalid appsecret" }).kind).toBe("BLOCKED_AUTH");
    expect(classifyWechatError({ errcode: 40009, errmsg: "invalid image size" }).kind).toBe("BLOCKED_CONTENT");
    expect(classifyWechatError({ errcode: 0, errmsg: "ok" }).kind).toBe("OK");
  });

  it("does not treat malformed responses as successful", () => {
    expect(classifyWechatError({ errmsg: "bad gateway" })).toEqual({
      kind: "UNKNOWN",
      retryable: false,
      errmsg: "bad gateway"
    });
  });

  it("hashes files in a deterministic order", async () => {
    const root = join(tmpdir(), `wechat-publisher-${Date.now()}`);
    await mkdir(root, { recursive: true });
    const a = join(root, "a.txt");
    const b = join(root, "b.txt");
    await writeFile(a, "alpha");
    await writeFile(b, "beta");
    const first = await hashFiles([
      { logicalPath: "b.txt", filePath: b },
      { logicalPath: "a.txt", filePath: a }
    ]);
    const second = await hashFiles([
      { logicalPath: "a.txt", filePath: a },
      { logicalPath: "b.txt", filePath: b }
    ]);
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  it("binds file hashes to logical paths", async () => {
    const root = join(tmpdir(), `wechat-publisher-paths-${Date.now()}`);
    const firstRoot = join(root, "first");
    const secondRoot = join(root, "second");
    await mkdir(firstRoot, { recursive: true });
    await mkdir(secondRoot, { recursive: true });

    const firstA = join(firstRoot, "a.txt");
    const firstB = join(firstRoot, "b.txt");
    const secondA = join(secondRoot, "copied-a.txt");
    const secondB = join(secondRoot, "copied-b.txt");
    await writeFile(firstA, "alpha");
    await writeFile(firstB, "beta");
    await writeFile(secondA, "alpha");
    await writeFile(secondB, "beta");

    expect(await hashFiles([
      { logicalPath: "a.txt", filePath: firstA },
      { logicalPath: "b.txt", filePath: firstB }
    ])).not.toBe(await hashFiles([
      { logicalPath: "copied-b.txt", filePath: secondB },
      { logicalPath: "copied-a.txt", filePath: secondA }
    ]));
  });

  it("changes package hash when metadata changes", async () => {
    const root = join(tmpdir(), `wechat-publisher-metadata-${Date.now()}`);
    await mkdir(root, { recursive: true });
    const article = join(root, "article.html");
    await writeFile(article, "<article>body</article>");

    const first = await hashPackage({
      metadata: { title: "First", digest: "Digest" },
      files: [{ logicalPath: "article.html", filePath: article }]
    });
    const second = await hashPackage({
      metadata: { title: "Second", digest: "Digest" },
      files: [{ logicalPath: "article.html", filePath: article }]
    });

    expect(first).not.toBe(second);
  });
});
