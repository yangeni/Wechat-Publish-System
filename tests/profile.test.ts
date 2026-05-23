import { describe, expect, it } from "vitest";
import { loadProfile } from "../src/profile/profile.js";

describe("loadProfile", () => {
  it("keeps submitPublish false by default even when bundle suggests publish", async () => {
    const profile = await loadProfile({
      accountProfile: "default",
      env: {},
      profileJson: {}
    });
    expect(profile.submitPublish).toBe(false);
    expect(profile.appIdEnv).toBe("WECHAT_MP_APP_ID");
    expect(profile.appSecretEnv).toBe("WECHAT_MP_APP_SECRET");
  });

  it("requires explicit local profile opt-in for submitPublish", async () => {
    const profile = await loadProfile({
      accountProfile: "release",
      env: {},
      profileJson: { submit_publish: true, force_new_draft: true }
    });
    expect(profile.accountProfile).toBe("release");
    expect(profile.submitPublish).toBe(true);
    expect(profile.forceNewDraft).toBe(true);
  });
});
