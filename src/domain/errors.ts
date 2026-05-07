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
