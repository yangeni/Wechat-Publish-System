# WeChat Publisher System

This workspace publishes prepared article bundles to a WeChat official account.

Default behavior is draft-only:

```bash
npm run build
./bin/publish-wechat.mjs --job JOB-001 --profile default
```

Publishing to readers requires an explicit flag:

```bash
npm run build
./bin/publish-wechat.mjs --job JOB-001 --profile default --submit-publish
```

## Bundle Contract

Place input bundles in:

```text
imports/<job_id>/
  bundle.json
  article.html
  article.md
  assets/
  cover/
```

All paths inside `bundle.json` are resolved relative to the bundle root.

## Writer Handoff

Import an existing Research Media Writer WeChat package into this workspace:

```bash
npm run writer:import -- --writer-root /path/to/research-media-writer-v3 --object DRPUB-026 --force
```

Then create a WeChat draft:

```bash
npm run build
./bin/publish-wechat.mjs --job DRPUB-026 --profile default
```

The import command copies only the Writer WeChat package files into `imports/<job_id>/`. It does not call WeChat APIs.

## Credentials

Profiles name environment variables. Secrets stay outside runtime records.

The default profile uses these names:

```text
WECHAT_MP_APP_ID
WECHAT_MP_APP_SECRET
```

Set them in your shell, or put them in a local ignored `.env.local` file:

```text
WECHAT_MP_APP_ID=wx...
WECHAT_MP_APP_SECRET=...
```

Check account connectivity without uploading assets or creating drafts:

```bash
npm run account:check
```

The check only requests an access token and does not print the token or secret.

## Profiles

The default tracked profile is `profiles/default.json`. It names the credential environment variables and keeps `submit_publish` disabled.

## Runtime Records

Runs write to:

```text
runtime/publish-jobs/<job_id>/
  publish-ledger.json
  asset-upload-map.json
  wechat-draft-payload.json
  wechat-publish-result.json
  wechat-publish-report.md
  raw-responses/
```

## Safety

The system does not publish unless `--submit-publish` or profile `submit_publish: true` is explicitly set. Re-running the same package uses the idempotency key `object_id + package_hash + account_profile` and returns the existing ledger unless `force_new_draft` is enabled.

## Verification

Run the full local check with:

```bash
npm run check
```
