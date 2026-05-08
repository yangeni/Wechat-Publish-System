import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadRuntimeEnv, parseEnvFile } from "../src/profile/local-env.js";

describe("local env loader", () => {
  it("parses simple local env files without exposing comments", () => {
    expect(parseEnvFile([
      "# local credentials",
      "WECHAT_MP_APP_ID=wx123",
      "WECHAT_MP_APP_SECRET=\"secret value\"",
      "IGNORED LINE",
      "TRAILING=value # comment"
    ].join("\n"))).toEqual({
      WECHAT_MP_APP_ID: "wx123",
      WECHAT_MP_APP_SECRET: "secret value",
      TRAILING: "value"
    });
  });

  it("lets real environment values override .env.local", async () => {
    const root = await mkdtemp(join(tmpdir(), "wechat-env-"));
    await writeFile(join(root, ".env.local"), "WECHAT_MP_APP_ID=from-file\nWECHAT_MP_APP_SECRET=from-file\n", "utf8");
    const env = await loadRuntimeEnv(root, { WECHAT_MP_APP_ID: "from-process" });
    expect(env.WECHAT_MP_APP_ID).toBe("from-process");
    expect(env.WECHAT_MP_APP_SECRET).toBe("from-file");
  });
});
