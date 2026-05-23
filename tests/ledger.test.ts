import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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

  it("rejects unsafe job ids", async () => {
    const root = await mkdtemp(join(tmpdir(), "wechat-ledger-"));
    expect(() => createLedgerPaths(root, "../../escape")).toThrow();
    expect(() => createLedgerPaths(root, ".")).toThrow();
  });

  it("skips malformed duplicate ledgers with non-string finishedAt", async () => {
    const root = await mkdtemp(join(tmpdir(), "wechat-ledger-"));
    await writeLedger(createLedgerPaths(root, "VALID"), {
      jobId: "VALID",
      objectId: "DRPUB-026",
      accountProfile: "default",
      packageHash: "hash",
      idempotencyKey: "DRPUB-026:hash:default",
      draftMediaId: "VALID_DRAFT_MEDIA_ID",
      assetMap: [],
      startedAt: "2026-05-07T00:00:00.000Z",
      status: "draft_saved"
    });
    const badJobDir = join(root, "publish-jobs", "BAD");
    await mkdir(badJobDir, { recursive: true });
    await writeFile(join(badJobDir, "publish-ledger.json"), JSON.stringify({
      jobId: "BAD",
      objectId: "DRPUB-026",
      accountProfile: "default",
      packageHash: "hash",
      idempotencyKey: "DRPUB-026:hash:default",
      assetMap: [],
      startedAt: "2026-05-07T00:00:01.000Z",
      finishedAt: 123,
      status: "draft_saved"
    }), "utf8");

    const existing = await existingLedgerForKey(root, "DRPUB-026:hash:default");
    expect(existing?.draftMediaId).toBe("VALID_DRAFT_MEDIA_ID");
  });

  it("returns newest valid ledger when duplicate idempotency keys exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "wechat-ledger-"));
    await writeLedger(createLedgerPaths(root, "AAA-OLD"), {
      jobId: "AAA-OLD",
      objectId: "DRPUB-026",
      accountProfile: "default",
      packageHash: "hash",
      idempotencyKey: "DRPUB-026:hash:default",
      draftMediaId: "OLD_DRAFT_MEDIA_ID",
      assetMap: [],
      startedAt: "2026-05-07T00:00:00.000Z",
      finishedAt: "2026-05-07T00:00:01.000Z",
      status: "draft_saved"
    });
    await writeLedger(createLedgerPaths(root, "ZZZ-NEW"), {
      jobId: "ZZZ-NEW",
      objectId: "DRPUB-026",
      accountProfile: "default",
      packageHash: "hash",
      idempotencyKey: "DRPUB-026:hash:default",
      draftMediaId: "NEW_DRAFT_MEDIA_ID",
      assetMap: [],
      startedAt: "2026-05-07T00:00:02.000Z",
      finishedAt: "2026-05-07T00:00:03.000Z",
      status: "draft_saved"
    });
    const existing = await existingLedgerForKey(root, "DRPUB-026:hash:default");
    expect(existing?.draftMediaId).toBe("NEW_DRAFT_MEDIA_ID");
  });

  it("skips malformed ledgers even when idempotency key matches", async () => {
    const root = await mkdtemp(join(tmpdir(), "wechat-ledger-"));
    const jobDir = join(root, "publish-jobs", "JOB-001");
    await mkdir(jobDir, { recursive: true });
    await writeFile(join(jobDir, "publish-ledger.json"), JSON.stringify({
      idempotencyKey: "DRPUB-026:hash:default"
    }), "utf8");
    const existing = await existingLedgerForKey(root, "DRPUB-026:hash:default");
    expect(existing).toBeUndefined();
  });
});
