import { basename, dirname, resolve } from "node:path";

export class CliInputError extends Error {}

export interface CliOptions {
  root: string;
  jobId: string;
  profileName: string;
  profilePath: string;
  bundleRoot: string;
  runtimeRoot: string;
  submitPublish: boolean;
  forceNewDraft: boolean;
}

export function formatUsage(): string {
  return "Usage: publish-wechat --job <job_id> [--bundle imports/<job_id>] [--profile default] [--submit-publish] [--force]";
}

export function parseCliOptions(args: string[], root: string): CliOptions {
  let jobId: string | undefined;
  let bundlePath: string | undefined;
  let profileName = "default";
  let submitPublish = false;
  let forceNewDraft = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--submit-publish") {
      submitPublish = true;
      continue;
    }
    if (arg === "--force") {
      forceNewDraft = true;
      continue;
    }

    if (arg === "--job" || arg === "--bundle" || arg === "--profile") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new CliInputError(`${arg} requires a value\n${formatUsage()}`);
      }
      if (arg === "--job") jobId = value;
      if (arg === "--bundle") bundlePath = value;
      if (arg === "--profile") profileName = value;
      index += 1;
      continue;
    }

    throw new CliInputError(`Unknown option: ${arg}\n${formatUsage()}`);
  }

  const resolvedRoot = resolve(root);
  const safeProfileName = assertSafeName(profileName, "profile");
  const importsRoot = resolve(resolvedRoot, "imports");

  let safeJobId = jobId ? assertSafeName(jobId, "job") : undefined;
  let bundleRoot: string;

  if (bundlePath) {
    bundleRoot = resolve(resolvedRoot, bundlePath);
    if (dirname(bundleRoot) !== importsRoot) {
      throw new CliInputError("Bundle path must be exactly imports/<job_id>");
    }

    const bundleJobId = assertSafeName(basename(bundleRoot), "bundle job");
    if (safeJobId && safeJobId !== bundleJobId) {
      throw new CliInputError(`--job (${safeJobId}) must match --bundle directory (${bundleJobId})`);
    }
    safeJobId = safeJobId ?? bundleJobId;
  } else {
    if (!safeJobId) {
      throw new CliInputError(formatUsage());
    }
    bundleRoot = resolve(importsRoot, safeJobId);
  }

  return {
    root: resolvedRoot,
    jobId: safeJobId,
    profileName: safeProfileName,
    profilePath: resolve(resolvedRoot, "profiles", `${safeProfileName}.json`),
    bundleRoot,
    runtimeRoot: resolve(resolvedRoot, "runtime"),
    submitPublish,
    forceNewDraft
  };
}

function assertSafeName(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "." || trimmed === ".." || trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) {
    throw new CliInputError(`Unsafe ${label}: ${value}`);
  }
  return trimmed;
}
