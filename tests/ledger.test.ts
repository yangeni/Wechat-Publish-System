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
