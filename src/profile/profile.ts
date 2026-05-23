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
