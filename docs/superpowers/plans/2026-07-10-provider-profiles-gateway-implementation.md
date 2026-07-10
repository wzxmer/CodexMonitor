# Provider Profiles and Gateway Implementation Plan

> **For agentic workers:** Execute inline task-by-task. Do not commit or upload this plan unless the user explicitly requests it.

**Goal:** Finish CodexMonitor provider profiles so model, context window, output cap, gateway, model discovery, usage display, and session persistence work together without modifying global Codex configuration.

**Architecture:** Keep persisted profile data in `AppSettings`, derive one per-session runtime object in `provider_profiles_core`, and pass only process-local arguments/environment into app-server launch. Keep compatibility translation and output-token enforcement inside `provider_gateway_core`; keep settings UI as an adapter over the existing persistence contract.

**Tech Stack:** Rust, Tokio, Reqwest, Tauri, React, TypeScript, Vitest.

## Global Constraints

- Never write profile values into global `CODEX_HOME/config.toml`.
- Preserve one shared `CODEX_HOME` so local thread history remains available across profile switches.
- Gateway mode must not expose the real provider key to Codex child processes.
- Profile changes affect new or reconnected sessions only.
- App and daemon launch paths must stay behaviorally identical.
- Development docs remain local-only unless explicitly requested.

---

### Task 1: Runtime Profile Overrides

**Files:**
- Modify: `src-tauri/src/shared/provider_profiles_core.rs`
- Modify: `src-tauri/src/codex/mod.rs`
- Modify: `src-tauri/src/bin/codex_monitor_daemon.rs`
- Test: `src-tauri/src/shared/provider_profiles_core.rs`

**Interfaces:**
- Produce: `CodexKeyRuntime { env, codex_args, gateway_shutdown }`
- Consume: existing workspace-resolved Codex argument string.

- [ ] Add tests proving model and context overrides append `-c model=...` and `-c model_context_window=...` without replacing user arguments.
- [ ] Implement shell-safe argument serialization through `shell_words::join`.
- [ ] Pass derived arguments through both app and daemon spawn adapters.
- [ ] Run `cargo test provider_profiles --lib` and `cargo check`.

### Task 2: Gateway Output Cap

**Files:**
- Modify: `src-tauri/src/shared/provider_gateway_core.rs`
- Modify: `src-tauri/src/shared/provider_profiles_core.rs`
- Test: `src-tauri/src/shared/provider_gateway_core.rs`

**Interfaces:**
- Add: `ProviderGatewayConfig.max_output_tokens: Option<u64>`
- Enforce: translated Chat Completions `max_tokens` never exceeds profile cap.

- [ ] Add tests for absent, lower, and higher request limits.
- [ ] Apply the profile cap during Responses-to-Chat conversion.
- [ ] Preserve uncapped behavior when profile value is empty.
- [ ] Run focused Rust tests and `cargo check`.

### Task 3: Settings and Discovery Verification

**Files:**
- Modify when required: `src/features/settings/components/sections/SettingsCodexSection.tsx`
- Modify when required: `src/features/settings/hooks/useAppSettings.ts`
- Test: `src/features/settings/hooks/useAppSettings.test.ts`
- Test: `src/features/settings/components/SettingsView.test.tsx`

**Interfaces:**
- Persist: provider kind, URL, key, model, context window, max output tokens, gateway flag, cached models.
- Discover: `providerModelList(baseUrl, apiKey)`.

- [ ] Verify add/edit/delete/select and manual-model fallback behavior.
- [ ] Add missing regression tests only where behavior is uncovered.
- [ ] Run targeted Vitest files and `npm run typecheck`.

### Task 4: Usage and Session Continuity

**Files:**
- Verify: `src/features/app/hooks/useThirdPartyKeyUsage.ts`
- Verify: `src/features/app/utils/thirdPartyKeyUsage.ts`
- Verify: `src-tauri/src/codex/home.rs`
- Verify: `src-tauri/src/shared/provider_profiles_core.rs`

**Interfaces:**
- Usage reads active profile credentials without changing launch state.
- Runtime overrides never set `CODEX_HOME`.

- [ ] Verify profile switching keeps the same configured/global Codex home.
- [ ] Verify third-party usage only activates for supported profile URLs.
- [ ] Run targeted frontend tests and Rust profile tests.

### Task 5: Final Validation and Review

**Files:** all provider/profile-owned files touched above.

- [ ] Run `npm run typecheck`.
- [ ] Run targeted tests, then `npm run test`.
- [ ] Run `cd src-tauri && cargo check`.
- [ ] Review diff for key leakage, session-history isolation, app/daemon drift, and unrelated edits.
- [ ] Report remaining provider-specific compatibility risks; do not publish.
