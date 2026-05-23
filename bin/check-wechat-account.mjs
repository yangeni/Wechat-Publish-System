#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { FetchHttpClient } from "../dist/src/wechat/http.js";
import { WechatClient } from "../dist/src/wechat/client.js";
import { loadProfile } from "../dist/src/profile/profile.js";
import { loadRuntimeEnv } from "../dist/src/profile/local-env.js";
import { CliInputError } from "../dist/src/publish/cli-options.js";

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

function maskCredential(value) {
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function assertSafeProfileName(value) {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "." || trimmed === ".." || trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) {
    throw new CliInputError(`Unsafe profile: ${value}`);
  }
  return trimmed;
}

function parseArgs(args) {
  let profileName = "default";
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") return { help: true, profileName };
    if (arg === "--profile") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new CliInputError("--profile requires a value");
      profileName = assertSafeProfileName(value);
      index += 1;
      continue;
    }
    throw new CliInputError(`Unknown option: ${arg}`);
  }
  return { help: false, profileName };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: check-wechat-account [--profile default]");
    return;
  }

  const root = process.cwd();
  const profilePath = resolve(root, "profiles", `${options.profileName}.json`);
  const profileJson = assertProfileObject(await readProfileJson(profilePath));
  const runtimeEnv = await loadRuntimeEnv(root, process.env);
  const profile = await loadProfile({ accountProfile: options.profileName, env: runtimeEnv, profileJson });
  const appId = runtimeEnv[profile.appIdEnv];
  const appSecret = runtimeEnv[profile.appSecretEnv];
  if (!appId || !appSecret) {
    throw new CliInputError(`Missing credentials in ${profile.appIdEnv} or ${profile.appSecretEnv}`);
  }

  const client = new WechatClient({ http: new FetchHttpClient(), appId, appSecret });
  const token = await client.getAccessToken();
  console.log(JSON.stringify({
    status: "ok",
    accountProfile: profile.accountProfile,
    appId: maskCredential(appId),
    accessTokenLength: token.length
  }, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(error instanceof CliInputError ? 2 : 1);
});
