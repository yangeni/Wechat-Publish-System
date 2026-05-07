#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FetchHttpClient } from "../dist/src/wechat/http.js";
import { WechatClient } from "../dist/src/wechat/client.js";
import { loadProfile } from "../dist/src/profile/profile.js";
import { runPublishJob } from "../dist/src/publish/orchestrator.js";

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
}

async function readProfileJson(profilePath) {
  try {
    return JSON.parse(await readFile(profilePath, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
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
const profileJson = await readProfileJson(profilePath);
profileJson.submit_publish = submitPublish;

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

console.log(JSON.stringify({
  status: ledger.status,
  draftMediaId: ledger.draftMediaId,
  publishId: ledger.publishId,
  articleUrl: ledger.articleUrl
}, null, 2));
