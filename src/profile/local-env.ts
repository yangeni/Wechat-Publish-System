import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function loadRuntimeEnv(root: string, baseEnv: NodeJS.ProcessEnv): Promise<NodeJS.ProcessEnv> {
  const localEnv = await readLocalEnv(root);
  return { ...localEnv, ...baseEnv };
}

export function parseEnvFile(content: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = line.slice(0, equalsIndex).trim();
    const rawValue = line.slice(equalsIndex + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    env[key] = unquoteEnvValue(rawValue);
  }
  return env;
}

async function readLocalEnv(root: string): Promise<NodeJS.ProcessEnv> {
  try {
    return parseEnvFile(await readFile(join(root, ".env.local"), "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
}

function unquoteEnvValue(value: string): string {
  const commentIndex = value.search(/\s#/);
  const withoutComment = commentIndex >= 0 ? value.slice(0, commentIndex).trimEnd() : value;
  if (withoutComment.length < 2) return withoutComment;
  const first = withoutComment[0];
  const last = withoutComment[withoutComment.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return withoutComment.slice(1, -1);
  }
  return withoutComment;
}
