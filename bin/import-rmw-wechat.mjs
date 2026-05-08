#!/usr/bin/env node
import { importRmwWechatPackage } from "../dist/src/import/rmw-wechat.js";

function usage() {
  return "Usage: import-rmw-wechat --writer-root <path> --object <object_id> [--job <job_id>] [--author CLngs] [--force]";
}

function argValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function parseArgs(args) {
  if (args.includes("--help") || args.includes("-h")) return { help: true };
  const known = new Set(["--writer-root", "--object", "--job", "--author", "--force"]);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!known.has(arg)) throw new Error(`Unknown option: ${arg}\n${usage()}`);
    if (arg !== "--force") index += 1;
  }
  const writerRoot = argValue(args, "--writer-root", process.env.RMW_ROOT ?? "");
  const objectId = argValue(args, "--object", "");
  if (!writerRoot || !objectId) throw new Error(usage());
  return {
    help: false,
    writerRoot,
    objectId,
    jobId: argValue(args, "--job", objectId),
    author: argValue(args, "--author", "CLngs"),
    force: args.includes("--force")
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const result = await importRmwWechatPackage({
    writerRoot: options.writerRoot,
    publisherRoot: process.cwd(),
    objectId: options.objectId,
    jobId: options.jobId,
    author: options.author,
    force: options.force
  });
  console.log(JSON.stringify({
    status: "imported",
    jobId: result.jobId,
    bundleRoot: result.bundleRoot,
    assetCount: result.assetPaths.length
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
