#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { FetchHttpClient } from "../dist/src/wechat/http.js";
import { WechatClient } from "../dist/src/wechat/client.js";
import { loadProfile } from "../dist/src/profile/profile.js";
import { runPublishJob } from "../dist/src/publish/orchestrator.js";
import { CliInputError, parseCliOptions } from "../dist/src/publish/cli-options.js";

async function readProfileJson(profilePath) {
  try {
    return JSON.parse(await readFile(profilePath, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
}

function assertProfileObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return { ...value };
  throw new CliInputError("Profile JSON must be an object");
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2), process.cwd());
  const profileJson = assertProfileObject(await readProfileJson(options.profilePath));
  if (options.submitPublish) profileJson.submit_publish = true;
  if (options.forceNewDraft) profileJson.force_new_draft = true;

  const profile = await loadProfile({ accountProfile: options.profileName, env: process.env, profileJson });
  const appId = process.env[profile.appIdEnv];
  const appSecret = process.env[profile.appSecretEnv];
  if (!appId || !appSecret) {
    throw new CliInputError(`Missing credentials in ${profile.appIdEnv} or ${profile.appSecretEnv}`);
  }

  const client = new WechatClient({
    http: new FetchHttpClient(),
    appId,
    appSecret
  });

  const ledger = await runPublishJob({
    bundleRoot: options.bundleRoot,
    runtimeRoot: options.runtimeRoot,
    profile,
    client
  });

  console.log(JSON.stringify({
    status: ledger.status,
    draftMediaId: ledger.draftMediaId,
    publishId: ledger.publishId,
    articleUrl: ledger.articleUrl
  }, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(error instanceof CliInputError ? 2 : 1);
});
