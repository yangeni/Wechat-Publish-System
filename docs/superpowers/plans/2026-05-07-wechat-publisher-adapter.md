# WeChat Publisher Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent CLI workspace that imports a prepared WeChat article bundle, creates a WeChat official-account draft by default, and submits publication only when explicitly enabled.

**Architecture:** A TypeScript Node.js CLI reads a file-based bundle, validates and sanitizes it, uploads assets through a small WeChat API client, builds a draft payload, writes a publish ledger, and optionally submits and polls publication. The workflow stays independent from Research Media Writer by consuming only `imports/<job_id>/bundle.json` and related files.

**Tech Stack:** Node.js 20+, TypeScript, Vitest, Zod, Cheerio, native `fetch`/`FormData`, local JSON/Markdown runtime records.

---

## Scope Check

The approved spec is one subsystem: a WeChat publishing adapter. It contains several modules, but they all serve one testable CLI flow. Keep this as one implementation plan.

## File Structure

Create this structure:

```text
WeChat_Publisher_System/
  package.json
  package-lock.json
  tsconfig.json
  vitest.config.ts
  .gitignore
  README.md
  bin/publish-wechat.mjs
  src/
    bundle/
      bundle.ts
    content/
      sanitizer.ts
    domain/
      errors.ts
      hash.ts
      types.ts
    ledger/
      ledger.ts
    profile/
      profile.ts
    publish/
      orchestrator.ts
      runner.ts
    upload/
      asset-uploader.ts
    wechat/
      client.ts
      http.ts
  tests/
    bundle.test.ts
    content.test.ts
    domain.test.ts
    ledger.test.ts
    orchestrator.test.ts
    profile.test.ts
    upload.test.ts
    wechat-client.test.ts
    fixtures/
      sample-bundle/
        bundle.json
        article.html
        article.md
        assets/body.png
        cover/cover.png
```

Responsibilities:

- `src/domain/*`: shared types, error classification, hashing and idempotency keys.
- `src/bundle/bundle.ts`: read and validate imported bundles.
- `src/profile/profile.ts`: read local profile and environment credential names.
- `src/content/sanitizer.ts`: reject unsafe HTML and replace image URLs with WeChat URLs.
- `src/wechat/*`: transport boundary for WeChat HTTP calls.
- `src/upload/asset-uploader.ts`: upload cover and body assets, return stable mappings.
- `src/publish/*`: build draft payload, create draft, optionally submit and poll.
- `src/ledger/ledger.ts`: write runtime artifacts and enforce idempotency.
- `bin/publish-wechat.mjs`: command entry.

---

### Task 1: Project Scaffold

**Files:**
- Create: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/package.json`
- Create: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/tsconfig.json`
- Create: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/vitest.config.ts`
- Create: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/.gitignore`
- Create: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/src/domain/types.ts`
- Test: package script sanity

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "wechat-publisher-system",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "publish-wechat": "./bin/publish-wechat.mjs"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "cheerio": "^1.0.0",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "@types/node": "^22.13.10",
    "tsx": "^4.19.3",
    "typescript": "^5.8.2",
    "vitest": "^3.0.8"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and npm exits with code 0.

- [ ] **Step 3: Create TypeScript and Vitest config**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true
  }
});
```

- [ ] **Step 4: Create `.gitignore`**

```gitignore
.DS_Store
node_modules/
dist/
coverage/
runtime/
profiles/*.local.json
profiles/*.secret.json
```

- [ ] **Step 5: Add a minimal shared type file**

Create `src/domain/types.ts`:

```ts
export type PublishMode = "draft_only" | "draft_and_publish";

export interface PublishBundle {
  jobId: string;
  objectId: string;
  title: string;
  author: string;
  digest: string;
  articleHtmlPath: string;
  articleMarkdownPath: string;
  coverPath: string;
  assetPaths: string[];
  sourceBundleHash: string;
  platform: "wechat";
  publishMode: PublishMode;
  bundleRoot: string;
}
```

- [ ] **Step 6: Run baseline checks**

Run:

```bash
npm run typecheck
npm test -- --passWithNoTests
```

Expected: typecheck exits 0; Vitest exits 0 with no tests.

- [ ] **Step 7: Commit scaffold**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src/domain/types.ts
git commit -m "chore: scaffold publisher workspace"
```

---

### Task 2: Domain Types, Errors, and Hashing

**Files:**
- Modify: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/src/domain/types.ts`
- Create: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/src/domain/errors.ts`
- Create: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/src/domain/hash.ts`
- Test: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/tests/domain.test.ts`

- [ ] **Step 1: Write failing domain tests**

Create `tests/domain.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm test -- tests/domain.test.ts
```

Expected: FAIL because `src/domain/hash.ts` and `src/domain/errors.ts` do not exist.

- [ ] **Step 3: Implement domain files**

Replace `src/domain/types.ts` with:

```ts
export type PublishMode = "draft_only" | "draft_and_publish";
export type RuntimeStatus = "draft_saved" | "published" | "blocked" | "failed";
export type ErrorKind = "OK" | "BLOCKED_AUTH" | "BLOCKED_CONTENT" | "RETRYABLE" | "PUBLISH_FAILED_PLATFORM" | "UNKNOWN";

export interface PublishBundle {
  jobId: string;
  objectId: string;
  title: string;
  author: string;
  digest: string;
  articleHtmlPath: string;
  articleMarkdownPath: string;
  coverPath: string;
  assetPaths: string[];
  sourceBundleHash: string;
  platform: "wechat";
  publishMode: PublishMode;
  bundleRoot: string;
}

export interface PublishProfile {
  accountProfile: string;
  appIdEnv: string;
  appSecretEnv: string;
  submitPublish: boolean;
  forceNewDraft: boolean;
  pollTimeoutSeconds: number;
  pollIntervalSeconds: number;
  defaultAuthor: string;
  needOpenComment: 0 | 1;
  onlyFansCanComment: 0 | 1;
}

export interface WechatApiErrorLike {
  errcode?: number;
  errmsg?: string;
}

export interface ClassifiedError {
  kind: ErrorKind;
  retryable: boolean;
  errcode?: number;
  errmsg: string;
}

export interface AssetUploadMapEntry {
  localPath: string;
  sha256: string;
  role: "cover" | "body";
  wechatUrl?: string;
  mediaId?: string;
}

export interface PublishLedger {
  jobId: string;
  objectId: string;
  accountProfile: string;
  packageHash: string;
  idempotencyKey: string;
  draftMediaId?: string;
  publishId?: string;
  publishStatus?: number;
  articleUrl?: string;
  assetMap: AssetUploadMapEntry[];
  startedAt: string;
  finishedAt?: string;
  status: RuntimeStatus;
}
```

Create `src/domain/errors.ts`:

```ts
import type { ClassifiedError, WechatApiErrorLike } from "./types.js";

const AUTH_CODES = new Set([40001, 40014, 40164, 48001]);
const CONTENT_CODES = new Set([40005, 40007, 40009, 53503, 53504, 53505]);
const RETRYABLE_CODES = new Set([-1, 45009, 50001]);

export function classifyWechatError(error: WechatApiErrorLike): ClassifiedError {
  const errcode = error.errcode ?? 0;
  const errmsg = error.errmsg ?? "";
  if (errcode === 0) return { kind: "OK", retryable: false, errcode, errmsg };
  if (AUTH_CODES.has(errcode)) return { kind: "BLOCKED_AUTH", retryable: false, errcode, errmsg };
  if (CONTENT_CODES.has(errcode)) return { kind: "BLOCKED_CONTENT", retryable: false, errcode, errmsg };
  if (RETRYABLE_CODES.has(errcode) || errcode >= 50000) return { kind: "RETRYABLE", retryable: true, errcode, errmsg };
  return { kind: "UNKNOWN", retryable: false, errcode, errmsg };
}

export function assertWechatOk(response: WechatApiErrorLike, action: string): void {
  const classified = classifyWechatError(response);
  if (classified.kind !== "OK") {
    throw new Error(`${action} failed: ${classified.kind} ${classified.errcode ?? ""} ${classified.errmsg}`.trim());
  }
}
```

Create `src/domain/hash.ts`:

```ts
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function sha256File(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

export async function hashFiles(filePaths: string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const filePath of [...filePaths].sort()) {
    hash.update(filePath);
    hash.update("\0");
    hash.update(await readFile(filePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function buildIdempotencyKey(input: {
  objectId: string;
  packageHash: string;
  accountProfile: string;
}): string {
  return `${input.objectId}:${input.packageHash}:${input.accountProfile}`;
}
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
npm test -- tests/domain.test.ts
npm run typecheck
```

Expected: PASS and typecheck exits 0.

- [ ] **Step 5: Commit domain helpers**

```bash
git add src/domain tests/domain.test.ts
git commit -m "feat: add publishing domain helpers"
```

---

### Task 3: Bundle Importer and Profile Loader

**Files:**
- Create: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/src/bundle/bundle.ts`
- Create: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/src/profile/profile.ts`
- Create fixture files under `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/tests/fixtures/sample-bundle/`
- Test: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/tests/bundle.test.ts`
- Test: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/tests/profile.test.ts`

- [ ] **Step 1: Create sample bundle fixture**

Create the fixture tree and files:

`tests/fixtures/sample-bundle/bundle.json`:

```json
{
  "job_id": "JOB-001",
  "object_id": "DRPUB-026",
  "title": "AI 越强，个人越不能只追工具",
  "author": "CLngs",
  "digest": "工具会追平，真正耐用的是资料、语境、判断和复核流程。",
  "article_html": "article.html",
  "article_md": "article.md",
  "cover_path": "cover/cover.png",
  "asset_paths": ["assets/body.png"],
  "source_bundle_hash": "source-hash-001",
  "platform": "wechat",
  "publish_mode": "draft_and_publish"
}
```

`tests/fixtures/sample-bundle/article.html`:

```html
<article>
  <h1>AI 越强，个人越不能只追工具</h1>
  <p>工具会追平，判断会留下。</p>
  <figure><img src="assets/body.png" alt="判断框架"><figcaption>判断框架</figcaption></figure>
</article>
```

`tests/fixtures/sample-bundle/article.md`:

```md
# AI 越强，个人越不能只追工具

工具会追平，判断会留下。
```

For `tests/fixtures/sample-bundle/assets/body.png` and `tests/fixtures/sample-bundle/cover/cover.png`, write any valid small PNG fixture. Use this shell command during implementation:

```bash
mkdir -p tests/fixtures/sample-bundle/assets tests/fixtures/sample-bundle/cover
printf 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=' | base64 --decode > tests/fixtures/sample-bundle/assets/body.png
cp tests/fixtures/sample-bundle/assets/body.png tests/fixtures/sample-bundle/cover/cover.png
```

- [ ] **Step 2: Write failing bundle and profile tests**

Create `tests/bundle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { readBundle } from "../src/bundle/bundle.js";

describe("readBundle", () => {
  it("reads paths relative to the bundle root", async () => {
    const root = join(process.cwd(), "tests/fixtures/sample-bundle");
    const bundle = await readBundle(root);
    expect(bundle.jobId).toBe("JOB-001");
    expect(bundle.platform).toBe("wechat");
    expect(bundle.articleHtmlPath).toBe(join(root, "article.html"));
    expect(bundle.coverPath).toBe(join(root, "cover/cover.png"));
    expect(bundle.assetPaths).toEqual([join(root, "assets/body.png")]);
    expect(bundle.publishMode).toBe("draft_and_publish");
  });
});
```

Create `tests/profile.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loadProfile } from "../src/profile/profile.js";

describe("loadProfile", () => {
  it("keeps submitPublish false by default even when bundle suggests publish", async () => {
    const profile = await loadProfile({
      accountProfile: "default",
      env: {},
      profileJson: {}
    });
    expect(profile.submitPublish).toBe(false);
    expect(profile.appIdEnv).toBe("WECHAT_MP_APP_ID");
    expect(profile.appSecretEnv).toBe("WECHAT_MP_APP_SECRET");
  });

  it("requires explicit local profile opt-in for submitPublish", async () => {
    const profile = await loadProfile({
      accountProfile: "release",
      env: {},
      profileJson: { submit_publish: true, force_new_draft: true }
    });
    expect(profile.accountProfile).toBe("release");
    expect(profile.submitPublish).toBe(true);
    expect(profile.forceNewDraft).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

```bash
npm test -- tests/bundle.test.ts tests/profile.test.ts
```

Expected: FAIL because importers do not exist.

- [ ] **Step 4: Implement bundle importer**

Create `src/bundle/bundle.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { PublishBundle } from "../domain/types.js";

const BundleSchema = z.object({
  job_id: z.string().min(1),
  object_id: z.string().min(1),
  title: z.string().min(1),
  author: z.string().default(""),
  digest: z.string().default(""),
  article_html: z.string().min(1),
  article_md: z.string().min(1),
  cover_path: z.string().min(1),
  asset_paths: z.array(z.string().min(1)).default([]),
  source_bundle_hash: z.string().default(""),
  platform: z.literal("wechat"),
  publish_mode: z.enum(["draft_only", "draft_and_publish"]).default("draft_only")
});

export async function readBundle(bundleRoot: string): Promise<PublishBundle> {
  const raw = JSON.parse(await readFile(join(bundleRoot, "bundle.json"), "utf8"));
  const parsed = BundleSchema.parse(raw);
  return {
    jobId: parsed.job_id,
    objectId: parsed.object_id,
    title: parsed.title,
    author: parsed.author,
    digest: parsed.digest,
    articleHtmlPath: join(bundleRoot, parsed.article_html),
    articleMarkdownPath: join(bundleRoot, parsed.article_md),
    coverPath: join(bundleRoot, parsed.cover_path),
    assetPaths: parsed.asset_paths.map((assetPath) => join(bundleRoot, assetPath)),
    sourceBundleHash: parsed.source_bundle_hash,
    platform: parsed.platform,
    publishMode: parsed.publish_mode,
    bundleRoot
  };
}
```

- [ ] **Step 5: Implement profile loader**

Create `src/profile/profile.ts`:

```ts
import { z } from "zod";
import type { PublishProfile } from "../domain/types.js";

const ProfileSchema = z.object({
  app_id_env: z.string().default("WECHAT_MP_APP_ID"),
  app_secret_env: z.string().default("WECHAT_MP_APP_SECRET"),
  submit_publish: z.boolean().default(false),
  force_new_draft: z.boolean().default(false),
  poll_timeout_seconds: z.number().int().positive().default(120),
  poll_interval_seconds: z.number().int().positive().default(5),
  default_author: z.string().default(""),
  need_open_comment: z.union([z.literal(0), z.literal(1)]).default(0),
  only_fans_can_comment: z.union([z.literal(0), z.literal(1)]).default(0)
});

export async function loadProfile(input: {
  accountProfile: string;
  env: NodeJS.ProcessEnv;
  profileJson: unknown;
}): Promise<PublishProfile> {
  const parsed = ProfileSchema.parse(input.profileJson ?? {});
  return {
    accountProfile: input.accountProfile,
    appIdEnv: parsed.app_id_env,
    appSecretEnv: parsed.app_secret_env,
    submitPublish: parsed.submit_publish,
    forceNewDraft: parsed.force_new_draft,
    pollTimeoutSeconds: parsed.poll_timeout_seconds,
    pollIntervalSeconds: parsed.poll_interval_seconds,
    defaultAuthor: parsed.default_author,
    needOpenComment: parsed.need_open_comment,
    onlyFansCanComment: parsed.only_fans_can_comment
  };
}
```

- [ ] **Step 6: Run tests and commit**

```bash
npm test -- tests/bundle.test.ts tests/profile.test.ts
npm run typecheck
git add src/bundle src/profile tests/bundle.test.ts tests/profile.test.ts tests/fixtures
git commit -m "feat: load publish bundles and profiles"
```

Expected: tests PASS and commit succeeds.

---

### Task 4: Package Inspection and HTML Sanitization

**Files:**
- Create: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/src/content/sanitizer.ts`
- Test: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/tests/content.test.ts`

- [ ] **Step 1: Write failing sanitizer tests**

Create `tests/content.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm test -- tests/content.test.ts
```

Expected: FAIL because sanitizer does not exist.

- [ ] **Step 3: Implement sanitizer**

Create `src/content/sanitizer.ts`:

```ts
import * as cheerio from "cheerio";

const INTERNAL_TERMS = ["DeepResearch", "DRPUB", "DR-RPT", "Gate", "runtime/objects", "来源建卡", "对象总表"];

export interface SanitizerInput {
  html: string;
  imageUrlMap: Map<string, string>;
}

export interface SanitizerResult {
  html: string;
  blockers: string[];
}

function isLocalAbsolutePath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("file://");
}

export function sanitizeWechatHtml(input: SanitizerInput): SanitizerResult {
  const blockers: string[] = [];
  const $ = cheerio.load(input.html, { xmlMode: false });

  if ($("script").length > 0) blockers.push("script_tag_present");
  $("script").remove();
  $("svg").each(() => blockers.push("svg_tag_present"));

  const plainText = $.root().text();
  for (const term of INTERNAL_TERMS) {
    if (plainText.includes(term)) blockers.push(`internal_term:${term}`);
  }

  $("img").each((_, element) => {
    const current = $(element).attr("src") ?? "";
    if (isLocalAbsolutePath(current)) {
      blockers.push(`local_absolute_image_path:${current}`);
      return;
    }
    const mapped = input.imageUrlMap.get(current);
    if (!mapped) {
      blockers.push(`unmapped_image:${current}`);
      return;
    }
    $(element).attr("src", mapped);
  });

  $("[src]").each((_, element) => {
    const value = $(element).attr("src") ?? "";
    if (value.startsWith("file://")) blockers.push(`file_url:${value}`);
  });

  return {
    html: $.html(),
    blockers: [...new Set(blockers)]
  };
}
```

- [ ] **Step 4: Run tests and commit**

```bash
npm test -- tests/content.test.ts
npm run typecheck
git add src/content tests/content.test.ts
git commit -m "feat: sanitize wechat article html"
```

Expected: tests PASS and commit succeeds.

---

### Task 5: WeChat API Client

**Files:**
- Create: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/src/wechat/http.ts`
- Create: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/src/wechat/client.ts`
- Test: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/tests/wechat-client.test.ts`

- [ ] **Step 1: Write failing WeChat client tests**

Create `tests/wechat-client.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm test -- tests/wechat-client.test.ts
```

Expected: FAIL because `WechatClient` does not exist.

- [ ] **Step 3: Implement HTTP boundary**

Create `src/wechat/http.ts`:

```ts
export interface HttpClient {
  getJson(url: string): Promise<unknown>;
  postJson(url: string, body: unknown): Promise<unknown>;
  postForm(url: string, form: FormData): Promise<unknown>;
}

export class FetchHttpClient implements HttpClient {
  async getJson(url: string): Promise<unknown> {
    const response = await fetch(url);
    return response.json();
  }

  async postJson(url: string, body: unknown): Promise<unknown> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return response.json();
  }

  async postForm(url: string, form: FormData): Promise<unknown> {
    const response = await fetch(url, {
      method: "POST",
      body: form
    });
    return response.json();
  }
}
```

- [ ] **Step 4: Implement WeChat client**

Create `src/wechat/client.ts`:

```ts
import { Blob } from "node:buffer";
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

export interface WechatClientOptions {
  http: HttpClient;
  appId: string;
  appSecret: string;
}

export class WechatClient {
  private token?: string;

  constructor(private readonly options: WechatClientOptions) {}

  async getAccessToken(): Promise<string> {
    if (this.token) return this.token;
    const url = `${API_BASE}/cgi-bin/token?grant_type=client_credential&appid=${this.options.appId}&secret=${this.options.appSecret}`;
    const parsed = TokenSchema.parse(await this.options.http.getJson(url));
    this.token = parsed.access_token;
    return this.token;
  }

  async uploadArticleImage(filePath: string): Promise<string> {
    const token = await this.getAccessToken();
    const form = new FormData();
    const bytes = await readFile(filePath);
    form.append("media", new Blob([bytes]), basename(filePath));
    const raw = await this.options.http.postForm(`${API_BASE}/cgi-bin/media/uploadimg?access_token=${token}`, form);
    const parsed = UploadImageSchema.parse(raw);
    assertWechatOk(parsed, "upload article image");
    return parsed.url;
  }

  async uploadPermanentImage(filePath: string): Promise<string> {
    const token = await this.getAccessToken();
    const form = new FormData();
    const bytes = await readFile(filePath);
    form.append("media", new Blob([bytes]), basename(filePath));
    const raw = await this.options.http.postForm(`${API_BASE}/cgi-bin/material/add_material?access_token=${token}&type=image`, form);
    const parsed = AddMaterialSchema.parse(raw);
    assertWechatOk(parsed, "upload permanent image");
    return parsed.media_id;
  }

  async addDraft(payload: unknown): Promise<string> {
    const token = await this.getAccessToken();
    const raw = await this.options.http.postJson(`${API_BASE}/cgi-bin/draft/add?access_token=${token}`, payload);
    const parsed = DraftSchema.parse(raw);
    assertWechatOk(parsed, "add draft");
    return parsed.media_id;
  }

  async submitPublish(mediaId: string): Promise<string> {
    const token = await this.getAccessToken();
    const raw = await this.options.http.postJson(`${API_BASE}/cgi-bin/freepublish/submit?access_token=${token}`, { media_id: mediaId });
    const parsed = SubmitSchema.parse(raw);
    assertWechatOk(parsed, "submit publish");
    return parsed.publish_id;
  }

  async getPublishStatus(publishId: string): Promise<Record<string, unknown>> {
    const token = await this.getAccessToken();
    return this.options.http.postJson(`${API_BASE}/cgi-bin/freepublish/get?access_token=${token}`, { publish_id: publishId }) as Promise<Record<string, unknown>>;
  }
}
```

- [ ] **Step 5: Run tests and commit**

```bash
npm test -- tests/wechat-client.test.ts
npm run typecheck
git add src/wechat tests/wechat-client.test.ts
git commit -m "feat: add wechat api client"
```

Expected: tests PASS and commit succeeds.

---

### Task 6: Asset Uploader and Draft Payload Builder

**Files:**
- Create: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/src/upload/asset-uploader.ts`
- Create: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/src/publish/runner.ts`
- Test: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/tests/upload.test.ts`

- [ ] **Step 1: Write failing upload and draft tests**

Create `tests/upload.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { join } from "node:path";
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
          return `https://mmbiz.qpic.cn/${filePath.split("/").pop()}`;
        }
      }
    });
    expect(uploaded.coverMediaId).toBe("COVER_MEDIA_ID");
    expect(uploaded.imageUrlMap.get("assets/body.png")).toBe("https://mmbiz.qpic.cn/body.png");
    expect(uploaded.assetMap).toHaveLength(2);
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
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm test -- tests/upload.test.ts
```

Expected: FAIL because upload and draft modules do not exist.

- [ ] **Step 3: Implement asset uploader**

Create `src/upload/asset-uploader.ts`:

```ts
import { relative } from "node:path";
import type { AssetUploadMapEntry, PublishBundle } from "../domain/types.js";
import { sha256File } from "../domain/hash.js";

export interface UploadClient {
  uploadPermanentImage(filePath: string): Promise<string>;
  uploadArticleImage(filePath: string): Promise<string>;
}

export interface UploadAssetsResult {
  coverMediaId: string;
  imageUrlMap: Map<string, string>;
  assetMap: AssetUploadMapEntry[];
}

export async function uploadAssets(input: {
  bundle: PublishBundle;
  client: UploadClient;
}): Promise<UploadAssetsResult> {
  const assetMap: AssetUploadMapEntry[] = [];
  const coverMediaId = await input.client.uploadPermanentImage(input.bundle.coverPath);
  assetMap.push({
    localPath: input.bundle.coverPath,
    sha256: await sha256File(input.bundle.coverPath),
    role: "cover",
    mediaId: coverMediaId
  });

  const imageUrlMap = new Map<string, string>();
  for (const assetPath of input.bundle.assetPaths) {
    const bundleRelativePath = relative(input.bundle.bundleRoot, assetPath);
    const wechatUrl = await input.client.uploadArticleImage(assetPath);
    imageUrlMap.set(bundleRelativePath, wechatUrl);
    assetMap.push({
      localPath: assetPath,
      sha256: await sha256File(assetPath),
      role: "body",
      wechatUrl
    });
  }

  return { coverMediaId, imageUrlMap, assetMap };
}
```

- [ ] **Step 4: Implement draft payload builder**

Create `src/publish/runner.ts`:

```ts
export interface DraftPayloadInput {
  title: string;
  author: string;
  digest: string;
  content: string;
  thumbMediaId: string;
  needOpenComment: 0 | 1;
  onlyFansCanComment: 0 | 1;
}

export function buildDraftPayload(input: DraftPayloadInput): Record<string, unknown> {
  return {
    articles: [{
      article_type: "news",
      title: input.title,
      author: input.author,
      digest: input.digest,
      content: input.content,
      thumb_media_id: input.thumbMediaId,
      need_open_comment: input.needOpenComment,
      only_fans_can_comment: input.onlyFansCanComment
    }]
  };
}
```

- [ ] **Step 5: Run tests and commit**

```bash
npm test -- tests/upload.test.ts
npm run typecheck
git add src/upload src/publish/runner.ts tests/upload.test.ts
git commit -m "feat: upload assets and build drafts"
```

Expected: tests PASS and commit succeeds.

---

### Task 7: Ledger Writer and Idempotency

**Files:**
- Create: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/src/ledger/ledger.ts`
- Test: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/tests/ledger.test.ts`

- [ ] **Step 1: Write failing ledger tests**

Create `tests/ledger.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLedgerPaths, existingLedgerForKey, writeLedger } from "../src/ledger/ledger.js";

describe("ledger", () => {
  it("writes ledger json and report markdown", async () => {
    const root = await mkdtemp(join(tmpdir(), "wechat-ledger-"));
    const paths = createLedgerPaths(root, "JOB-001");
    await writeLedger(paths, {
      jobId: "JOB-001",
      objectId: "DRPUB-026",
      accountProfile: "default",
      packageHash: "hash",
      idempotencyKey: "DRPUB-026:hash:default",
      draftMediaId: "DRAFT_MEDIA_ID",
      assetMap: [],
      startedAt: "2026-05-07T00:00:00.000Z",
      finishedAt: "2026-05-07T00:00:01.000Z",
      status: "draft_saved"
    });
    const json = JSON.parse(await readFile(paths.ledgerJson, "utf8"));
    const report = await readFile(paths.reportMarkdown, "utf8");
    expect(json.draftMediaId).toBe("DRAFT_MEDIA_ID");
    expect(report).toContain("status: draft_saved");
  });

  it("finds existing ledger by idempotency key", async () => {
    const root = await mkdtemp(join(tmpdir(), "wechat-ledger-"));
    const paths = createLedgerPaths(root, "JOB-001");
    await writeLedger(paths, {
      jobId: "JOB-001",
      objectId: "DRPUB-026",
      accountProfile: "default",
      packageHash: "hash",
      idempotencyKey: "DRPUB-026:hash:default",
      draftMediaId: "DRAFT_MEDIA_ID",
      assetMap: [],
      startedAt: "2026-05-07T00:00:00.000Z",
      status: "draft_saved"
    });
    const existing = await existingLedgerForKey(root, "DRPUB-026:hash:default");
    expect(existing?.draftMediaId).toBe("DRAFT_MEDIA_ID");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm test -- tests/ledger.test.ts
```

Expected: FAIL because ledger module does not exist.

- [ ] **Step 3: Implement ledger module**

Create `src/ledger/ledger.ts`:

```ts
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PublishLedger } from "../domain/types.js";

export interface LedgerPaths {
  jobDir: string;
  ledgerJson: string;
  assetUploadMapJson: string;
  draftPayloadJson: string;
  publishResultJson: string;
  reportMarkdown: string;
  rawResponsesDir: string;
}

export function createLedgerPaths(runtimeRoot: string, jobId: string): LedgerPaths {
  const jobDir = join(runtimeRoot, "publish-jobs", jobId);
  return {
    jobDir,
    ledgerJson: join(jobDir, "publish-ledger.json"),
    assetUploadMapJson: join(jobDir, "asset-upload-map.json"),
    draftPayloadJson: join(jobDir, "wechat-draft-payload.json"),
    publishResultJson: join(jobDir, "wechat-publish-result.json"),
    reportMarkdown: join(jobDir, "wechat-publish-report.md"),
    rawResponsesDir: join(jobDir, "raw-responses")
  };
}

export async function writeLedger(paths: LedgerPaths, ledger: PublishLedger): Promise<void> {
  await mkdir(paths.rawResponsesDir, { recursive: true });
  await writeFile(paths.ledgerJson, JSON.stringify(ledger, null, 2), "utf8");
  await writeFile(paths.assetUploadMapJson, JSON.stringify(ledger.assetMap, null, 2), "utf8");
  await writeFile(paths.reportMarkdown, renderReport(ledger), "utf8");
}

export async function existingLedgerForKey(runtimeRoot: string, idempotencyKey: string): Promise<PublishLedger | undefined> {
  const jobsRoot = join(runtimeRoot, "publish-jobs");
  let entries: string[] = [];
  try {
    entries = await readdir(jobsRoot);
  } catch {
    return undefined;
  }
  for (const entry of entries) {
    try {
      const raw = await readFile(join(jobsRoot, entry, "publish-ledger.json"), "utf8");
      const parsed = JSON.parse(raw) as PublishLedger;
      if (parsed.idempotencyKey === idempotencyKey) return parsed;
    } catch {
      continue;
    }
  }
  return undefined;
}

function renderReport(ledger: PublishLedger): string {
  return [
    "# WeChat Publish Report",
    "",
    `- job_id: ${ledger.jobId}`,
    `- object_id: ${ledger.objectId}`,
    `- account_profile: ${ledger.accountProfile}`,
    `- package_hash: ${ledger.packageHash}`,
    `- status: ${ledger.status}`,
    `- draft_media_id: ${ledger.draftMediaId ?? ""}`,
    `- publish_id: ${ledger.publishId ?? ""}`,
    `- article_url: ${ledger.articleUrl ?? ""}`,
    ""
  ].join("\n");
}
```

- [ ] **Step 4: Run tests and commit**

```bash
npm test -- tests/ledger.test.ts
npm run typecheck
git add src/ledger tests/ledger.test.ts
git commit -m "feat: write publish ledgers"
```

Expected: tests PASS and commit succeeds.

---

### Task 8: Orchestrator and CLI

**Files:**
- Create: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/src/publish/orchestrator.ts`
- Create: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/bin/publish-wechat.mjs`
- Test: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/tests/orchestrator.test.ts`

- [ ] **Step 1: Write failing orchestrator test**

Create `tests/orchestrator.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { runPublishJob } from "../src/publish/orchestrator.js";

describe("runPublishJob", () => {
  it("creates a draft by default and does not submit publish", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "wechat-runtime-"));
    const bundleRoot = join(process.cwd(), "tests/fixtures/sample-bundle");
    const calls: string[] = [];
    const result = await runPublishJob({
      bundleRoot,
      runtimeRoot,
      profile: {
        accountProfile: "default",
        appIdEnv: "WECHAT_MP_APP_ID",
        appSecretEnv: "WECHAT_MP_APP_SECRET",
        submitPublish: false,
        forceNewDraft: false,
        pollTimeoutSeconds: 30,
        pollIntervalSeconds: 1,
        defaultAuthor: "CLngs",
        needOpenComment: 0,
        onlyFansCanComment: 0
      },
      client: {
        async uploadPermanentImage() {
          calls.push("uploadPermanentImage");
          return "COVER_MEDIA_ID";
        },
        async uploadArticleImage() {
          calls.push("uploadArticleImage");
          return "https://mmbiz.qpic.cn/body.png";
        },
        async addDraft() {
          calls.push("addDraft");
          return "DRAFT_MEDIA_ID";
        },
        async submitPublish() {
          calls.push("submitPublish");
          return "PUB_ID";
        },
        async getPublishStatus() {
          calls.push("getPublishStatus");
          return { publish_status: 0 };
        }
      }
    });
    expect(result.status).toBe("draft_saved");
    expect(result.draftMediaId).toBe("DRAFT_MEDIA_ID");
    expect(calls).toEqual(["uploadPermanentImage", "uploadArticleImage", "addDraft"]);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm test -- tests/orchestrator.test.ts
```

Expected: FAIL because orchestrator does not exist.

- [ ] **Step 3: Implement orchestrator**

Create `src/publish/orchestrator.ts`:

```ts
import { readFile, writeFile } from "node:fs/promises";
import { buildIdempotencyKey, hashFiles } from "../domain/hash.js";
import type { PublishLedger, PublishProfile } from "../domain/types.js";
import { readBundle } from "../bundle/bundle.js";
import { sanitizeWechatHtml } from "../content/sanitizer.js";
import { createLedgerPaths, existingLedgerForKey, writeLedger } from "../ledger/ledger.js";
import { uploadAssets, type UploadClient } from "../upload/asset-uploader.js";
import { buildDraftPayload } from "./runner.js";

export interface PublishClient extends UploadClient {
  addDraft(payload: unknown): Promise<string>;
  submitPublish(mediaId: string): Promise<string>;
  getPublishStatus(publishId: string): Promise<Record<string, unknown>>;
}

export interface RunPublishJobInput {
  bundleRoot: string;
  runtimeRoot: string;
  profile: PublishProfile;
  client: PublishClient;
}

export async function runPublishJob(input: RunPublishJobInput): Promise<PublishLedger> {
  const startedAt = new Date().toISOString();
  const bundle = await readBundle(input.bundleRoot);
  const packageHash = await hashFiles([
    bundle.articleHtmlPath,
    bundle.articleMarkdownPath,
    bundle.coverPath,
    ...bundle.assetPaths
  ]);
  const idempotencyKey = buildIdempotencyKey({
    objectId: bundle.objectId,
    packageHash,
    accountProfile: input.profile.accountProfile
  });

  const existing = await existingLedgerForKey(input.runtimeRoot, idempotencyKey);
  if (existing && !input.profile.forceNewDraft) return existing;

  const paths = createLedgerPaths(input.runtimeRoot, bundle.jobId);
  const uploaded = await uploadAssets({ bundle, client: input.client });
  const html = await readFile(bundle.articleHtmlPath, "utf8");
  const sanitized = sanitizeWechatHtml({ html, imageUrlMap: uploaded.imageUrlMap });
  if (sanitized.blockers.length > 0) {
    const ledger: PublishLedger = {
      jobId: bundle.jobId,
      objectId: bundle.objectId,
      accountProfile: input.profile.accountProfile,
      packageHash,
      idempotencyKey,
      assetMap: uploaded.assetMap,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "blocked"
    };
    await writeLedger(paths, ledger);
    throw new Error(`blocked content: ${sanitized.blockers.join(", ")}`);
  }

  const draftPayload = buildDraftPayload({
    title: bundle.title,
    author: bundle.author || input.profile.defaultAuthor,
    digest: bundle.digest,
    content: sanitized.html,
    thumbMediaId: uploaded.coverMediaId,
    needOpenComment: input.profile.needOpenComment,
    onlyFansCanComment: input.profile.onlyFansCanComment
  });
  const draftMediaId = await input.client.addDraft(draftPayload);
  await writeFile(paths.draftPayloadJson, JSON.stringify(draftPayload, null, 2), "utf8");

  let publishId: string | undefined;
  let publishStatus: number | undefined;
  let articleUrl: string | undefined;
  let status: PublishLedger["status"] = "draft_saved";

  if (input.profile.submitPublish) {
    publishId = await input.client.submitPublish(draftMediaId);
    const publishResult = await input.client.getPublishStatus(publishId);
    await writeFile(paths.publishResultJson, JSON.stringify(publishResult, null, 2), "utf8");
    publishStatus = typeof publishResult.publish_status === "number" ? publishResult.publish_status : undefined;
    const detail = publishResult.article_detail as { item?: Array<{ article_url?: string }> } | undefined;
    articleUrl = detail?.item?.[0]?.article_url;
    status = publishStatus === 0 ? "published" : "failed";
  }

  const ledger: PublishLedger = {
    jobId: bundle.jobId,
    objectId: bundle.objectId,
    accountProfile: input.profile.accountProfile,
    packageHash,
    idempotencyKey,
    draftMediaId,
    publishId,
    publishStatus,
    articleUrl,
    assetMap: uploaded.assetMap,
    startedAt,
    finishedAt: new Date().toISOString(),
    status
  };
  await writeLedger(paths, ledger);
  return ledger;
}
```

- [ ] **Step 4: Create CLI entry**

Create `bin/publish-wechat.mjs`:

```js
#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FetchHttpClient } from "../dist/src/wechat/http.js";
import { WechatClient } from "../dist/src/wechat/client.js";
import { loadProfile } from "../dist/src/profile/profile.js";
import { runPublishJob } from "../dist/src/publish/orchestrator.js";

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const jobId = argValue("--job", "");
const profileName = argValue("--profile", "default");
const submitPublish = process.argv.includes("--submit-publish");

if (!jobId) {
  console.error("Usage: publish-wechat --job <job_id> [--profile default] [--submit-publish]");
  process.exit(2);
}

const root = process.cwd();
const profilePath = join(root, "profiles", `${profileName}.json`);
let profileJson = {};
try {
  profileJson = JSON.parse(await readFile(profilePath, "utf8"));
} catch {
  profileJson = {};
}
if (submitPublish) profileJson.submit_publish = true;

const profile = await loadProfile({ accountProfile: profileName, env: process.env, profileJson });
const appId = process.env[profile.appIdEnv];
const appSecret = process.env[profile.appSecretEnv];
if (!appId || !appSecret) {
  console.error(`Missing credentials in ${profile.appIdEnv} or ${profile.appSecretEnv}`);
  process.exit(2);
}

const client = new WechatClient({
  http: new FetchHttpClient(),
  appId,
  appSecret
});

const ledger = await runPublishJob({
  bundleRoot: join(root, "imports", jobId),
  runtimeRoot: join(root, "runtime"),
  profile,
  client
});

console.log(JSON.stringify({ status: ledger.status, draftMediaId: ledger.draftMediaId, publishId: ledger.publishId, articleUrl: ledger.articleUrl }, null, 2));
```

- [ ] **Step 5: Run tests and build**

```bash
npm test -- tests/orchestrator.test.ts
npm run build
npm run typecheck
```

Expected: tests PASS, build creates `dist/`, and typecheck exits 0.

- [ ] **Step 6: Commit orchestrator and CLI**

```bash
git add src/publish/orchestrator.ts bin/publish-wechat.mjs tests/orchestrator.test.ts
git commit -m "feat: orchestrate draft publishing flow"
```

---

### Task 9: Documentation and End-to-End Mock Proof

**Files:**
- Create: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/README.md`
- Modify: `/Users/clngs/Documents/CLngs_Vault/WeChat_Publisher_System/package.json`
- Test: all tests

- [ ] **Step 1: Add README**

Create `README.md`:

```md
# WeChat Publisher System

This workspace publishes prepared article bundles to a WeChat official account.

Default behavior is draft-only:

```bash
npm run build
publish-wechat --job JOB-001 --profile default
```

Publishing to readers requires an explicit flag:

```bash
npm run build
publish-wechat --job JOB-001 --profile default --submit-publish
```

## Bundle Contract

Place input bundles in:

```text
imports/<job_id>/
  bundle.json
  article.html
  article.md
  assets/
  cover/
```

All paths inside `bundle.json` are resolved relative to the bundle root.

## Credentials

Profiles name environment variables. Secrets stay outside runtime records.

Default environment variable names:

```text
WECHAT_MP_APP_ID
WECHAT_MP_APP_SECRET
```

## Runtime Records

Runs write to:

```text
runtime/publish-jobs/<job_id>/
  publish-ledger.json
  asset-upload-map.json
  wechat-draft-payload.json
  wechat-publish-result.json
  wechat-publish-report.md
  raw-responses/
```

## Safety

The system does not publish unless `--submit-publish` or profile `submit_publish: true` is explicitly set. Re-running the same package uses the idempotency key `object_id + package_hash + account_profile` and returns the existing ledger unless `force_new_draft` is enabled.
```

- [ ] **Step 2: Ensure executable CLI metadata**

Modify `package.json` scripts to include:

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "check": "npm run typecheck && npm test && npm run build"
  }
}
```

Keep the existing dependencies and `bin` field.

- [ ] **Step 3: Run full verification**

```bash
npm run check
git status --short
```

Expected: `npm run check` exits 0. `git status --short` shows README and package changes only before commit, plus previously ignored runtime files are absent.

- [ ] **Step 4: Commit docs and final verification**

```bash
git add README.md package.json
git commit -m "docs: document publisher workflow"
git status --short
```

Expected: clean git status except possible local `.DS_Store` files ignored by `.gitignore`.

---

## Self-Review Checklist

- Spec coverage:
  - Independent workspace: Task 1 and README.
  - Bundle import boundary: Task 3.
  - Profile and explicit publish flag: Task 3 and Task 8.
  - Content sanitization and local path blocking: Task 4.
  - Body image upload and cover media ID: Task 5 and Task 6.
  - Draft creation default: Task 6 and Task 8.
  - Optional publish and status polling entry points: Task 5 and Task 8.
  - Publish ledger and idempotency: Task 7 and Task 8.
  - Tests: every task includes failing tests and verification commands.
- Placeholder scan: no implementation step uses incomplete markers.
- Type consistency:
  - `PublishBundle`, `PublishProfile`, `PublishLedger`, `AssetUploadMapEntry` are defined in Task 2 and reused consistently.
  - `WechatClient` methods match `PublishClient` and `UploadClient`.
  - `submitPublish` is controlled by local profile and CLI flag, not by bundle `publishMode`.

