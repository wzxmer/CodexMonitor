# Local Session Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Execute tasks sequentially with focused tests and diff review after every phase.

**Goal:** Build a multi-`CODEX_HOME` local session manager that preserves discoverability across profile switches, supports safe search and session operations, and adds opt-in archive-age-based permanent cleanup.

**Architecture:** Use a hybrid model: Rust safely scans configured session sources for indexing/search/deletion, while source-scoped Codex app-server runtimes perform resume and archive operations. Keep session-manager UI state separate from normal sidebar state. Deliver in three independently releasable phases.

**Tech Stack:** React, TypeScript, Tauri, Rust, serde, existing Codex app-server JSON-RPC, Vitest, Cargo tests.

## Global Constraints

- Do not scan other Windows user accounts.
- Do not search reasoning, tool calls, or command output.
- Do not physically rewrite session `cwd`.
- Permanent deletion must be opt-in, archived-only, exact-file, path-bounded, and double-confirmed.
- Automatic permanent deletion defaults off and uses archive age only.
- Shared backend behavior belongs in `src-tauri/src/shared/*`; app and daemon remain thin adapters.
- New UI text must be added to every locale in `src/features/i18n/strings.ts`.
- Do not modify or delete session files when parsing or mapping confidence is insufficient.
- Use `D:\DevKnowledgeBase` as the durable knowledge base; project ID is `codex-monitor`.
- Before each Task, retrieve only relevant shared/project notes and verify them against current source/spec files.
- Before a Task can be marked complete, record validated reusable knowledge when present, update the knowledge index, and run the knowledge quality check. Do not create filler notes when no durable knowledge exists.
- Requirement changes require immutable pre-change snapshots, a requirement-change record, synchronized canonical spec/plan updates, and superseded links instead of deletion.
- BUG fixes require a structured bug record covering symptom, impact, root cause, excluded causes, final fix, regression verification, and reusable constraint.

---

## Phase 1: Sources, Index, Browse, Search

### Task 1: Define source and session contracts

**Files:**
- Modify: `src/types.ts`
- Modify: `src-tauri/src/types.rs`
- Create: `src-tauri/src/shared/session_manager_core.rs`
- Create: `src-tauri/src/shared/session_manager_core/types.rs`
- Modify: `src-tauri/src/shared/mod.rs`
- Test: Rust unit tests beside new modules

- [ ] Define `SessionSource`, `ManagedSession`, scan status, search request/result, progress, file confidence, and source-scoped session key types.
- [ ] Normalize Windows paths and define case-insensitive source identity.
- [ ] Add serialization contract tests for camelCase payloads.
- [ ] Run focused Rust tests.

### Task 2: Persist and discover session sources

**Files:**
- Modify: `src/types.ts`
- Modify: `src-tauri/src/types.rs`
- Modify: `src/features/settings/hooks/useAppSettings.ts`
- Modify: `src-tauri/src/storage.rs`
- Create: `src-tauri/src/shared/session_manager_core/sources.rs`
- Test: settings migration and Rust source tests

- [ ] Add persisted source list with name, path, enabled state, discovery time, and system flags.
- [ ] Ensure current configured home and default home are upserted automatically.
- [ ] Record successful historical `CODEX_HOME` use without removing old entries.
- [ ] Support add, rename, disable, remove, and rescan operations; removal never touches disk.
- [ ] Add legacy settings migration and normalization tests.

### Task 3: Implement safe multi-source indexing

**Files:**
- Create: `src-tauri/src/shared/session_manager_core/scanner.rs`
- Create: `src-tauri/src/shared/session_manager_core/parser.rs`
- Create: `src-tauri/src/shared/session_manager_core/file_map.rs`
- Test: fixtures under `src-tauri/src/shared/session_manager_core/tests/`

- [ ] Discover active and archived session files only beneath validated source roots.
- [ ] Parse summary metadata, timestamps, cwd, source kind, parent/sub-agent metadata, and file mapping confidence.
- [ ] Isolate source failures and bound scan concurrency.
- [ ] Preserve missing-project sessions and mark their state.
- [ ] Refuse deletion eligibility for invalid or ambiguous mappings.
- [ ] Add fixtures for multiple homes, duplicate thread IDs, malformed files, archived files, missing projects, and sub-agents.

### Task 4: Expose app and daemon contracts

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Create: app adapter module beside existing backend adapters
- Modify: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
- Create: `src-tauri/src/bin/codex_monitor_daemon/rpc/session_manager.rs`
- Modify: `src-tauri/src/bin/codex_monitor_daemon.rs`
- Modify: `src-tauri/src/remote_backend/mod.rs`
- Modify: `src/services/tauri.ts`
- Test: RPC routing and wrapper tests

- [ ] Add list sources, update source, scan sessions, fetch page, and cancel scan/search commands.
- [ ] Keep payloads identical across local Tauri and daemon RPC paths.
- [ ] Add remote retry classification only for idempotent list/search operations.
- [ ] Add contract tests.

### Task 5: Build independent sidebar manager mode

**Files:**
- Modify: `src/features/app/components/SidebarHeader.tsx`
- Modify: `src/features/app/components/Sidebar.tsx`
- Create: `src/features/sessions/hooks/useSessionManager.ts`
- Create: `src/features/sessions/components/SessionManagerList.tsx`
- Create: `src/features/sessions/components/SessionManagerRow.tsx`
- Create: `src/features/sessions/components/SessionManagerToolbar.tsx`
- Modify: app/layout orchestration props
- Modify: `src/features/i18n/strings.ts`
- Modify: relevant sidebar CSS
- Test: component and hook tests

- [ ] Add header icon between Home and Organize.
- [ ] Add `workspaces | sessionManager` mode with independent query, scroll, pagination, filters, and selection state.
- [ ] Preserve normal sidebar state across mode switches.
- [ ] Render source, cwd/project, ID, archive status, availability, and project-missing state.
- [ ] Hide sub-agents by default; add one show-sub-agents toggle.
- [ ] Make manager refresh scan only session sources.

### Task 6: Add fixed-scope content search

**Files:**
- Create: `src-tauri/src/shared/session_manager_core/search.rs`
- Modify: scanner/parser helpers
- Modify: session manager hooks/components
- Test: Rust search fixtures and frontend progress/cancel tests

- [ ] Search summary fields immediately.
- [ ] Start content search at two characters.
- [ ] Extract only user messages and final agent replies.
- [ ] Exclude reasoning, tools, command output, and approvals by tests.
- [ ] Stream batches and progress; cancel stale query tasks.
- [ ] Add memory cache keyed by source, thread ID, and file modification time.
- [ ] Mark incomplete results for oversized or partially parsed files.

### Phase 1 Verification

- [ ] Run targeted frontend and Rust tests.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run test`.
- [ ] Run `cd src-tauri && cargo check`.
- [ ] Review diff for source isolation, path handling, and normal-sidebar regressions.

---

## Phase 2: Source-Scoped Session Operations

### Task 7: Add source-scoped app-server runtime pool

**Files:**
- Create: `src-tauri/src/shared/session_manager_core/runtime.rs`
- Modify: `src-tauri/src/backend/app_server.rs`
- Modify: app and daemon state definitions
- Test: Rust runtime lifecycle tests

- [ ] Key runtime sessions by normalized source identity and workspace context.
- [ ] Spawn app-server with source-specific `CODEX_HOME` without modifying global settings.
- [ ] Reuse runtime per source, track last activity, and close idle runtimes safely.
- [ ] Prevent auth/config/session leakage between sources.
- [ ] Keep restored thread routing bound to its source.

### Task 8: Continue original session

**Files:**
- Modify: shared session manager core and adapters
- Modify: `src/services/tauri.ts`
- Modify: manager row/menu components
- Modify: main app navigation orchestration
- Test: action and integration tests

- [ ] Resume via source runtime and original thread ID.
- [ ] Resolve or create workspace from cwd without changing current global `CODEX_HOME`.
- [ ] Display active source label in the resumed thread UI.
- [ ] Exit manager mode only after successful resume.
- [ ] Preserve manager state on failure.

### Task 9: Archive and batch archive

**Files:**
- Modify: shared session manager core and runtime
- Modify: manager selection/action components
- Create: archive result summary UI
- Test: partial-failure and source-routing tests

- [ ] Archive through source-specific app-server.
- [ ] Record archive timestamp only after confirmed success.
- [ ] Support single and multi-select archive.
- [ ] Continue remaining sessions after one failure.
- [ ] Refresh manager and normal lists after success.

### Task 10: Derive into current task

**Files:**
- Create: frontend derivation preview/confirmation component
- Create: shared extraction/format helper
- Modify: thread start/send orchestration
- Test: extraction and new-thread integration tests

- [ ] Extract title, user messages, and final agent replies only.
- [ ] Build deterministic structured handoff content.
- [ ] Preview destination workspace and source session.
- [ ] Create a new thread in current workspace and send the handoff.
- [ ] Persist source session key as derivation metadata.
- [ ] Never mutate the original session.

### Phase 2 Verification

- [ ] Run targeted frontend and Rust tests.
- [ ] Run full frontend validation and `cargo check`.
- [ ] Review runtime shutdown, source routing, and partial-failure handling.

---

## Phase 3: Permanent Cleanup

### Task 11: Add archive-time ledger and audit log

**Files:**
- Create: `src-tauri/src/shared/session_manager_core/ledger.rs`
- Create: `src-tauri/src/shared/session_manager_core/audit.rs`
- Modify: storage paths/types
- Test: migration and timestamp-priority tests

- [ ] Store archive time by source/session key.
- [ ] Prefer reliable upstream time, then confirmed local archive time, then first discovery time.
- [ ] Ensure first discovery of legacy archives never makes them immediately eligible.
- [ ] Store content-free deletion audit entries.

### Task 12: Implement exact-file permanent deletion

**Files:**
- Create: `src-tauri/src/shared/session_manager_core/delete.rs`
- Modify: app/daemon adapters and frontend service
- Create: permanent-delete confirmation UI
- Test: extensive path-safety tests

- [ ] Revalidate root, file mapping, thread ID, archived state, and archive time immediately before deletion.
- [ ] Reject symlink escape, directory targets, ambiguous mapping, and non-archived sessions.
- [ ] Delete only exact validated files.
- [ ] Show child count; default to parent-only deletion.
- [ ] Support optional explicitly confirmed child deletion.
- [ ] Refresh indexes and write audit result.

### Task 13: Add opt-in automatic deletion settings

**Files:**
- Modify: `src/types.ts`
- Modify: `src-tauri/src/types.rs`
- Modify: `src/features/settings/hooks/useAppSettings.ts`
- Modify: `src/features/settings/components/sections/SettingsSessionSection.tsx`
- Create: enable-warning and immediate-cleanup confirmation components
- Modify: `src/features/i18n/strings.ts`
- Test: settings and confirmation tests

- [ ] Add default-off enable flag and 30/60/90/180-day retention.
- [ ] Clicking enable scans and previews eligible count.
- [ ] Require second explicit irreversible-action confirmation before persisting enabled state.
- [ ] Cancel leaves setting disabled.
- [ ] Enabling never deletes immediately.
- [ ] Immediate cleanup always requires a fresh second confirmation.

### Task 14: Add cleanup scheduler

**Files:**
- Create: `src-tauri/src/shared/session_manager_core/cleanup.rs`
- Modify: app and daemon startup/lifecycle adapters
- Test: scheduler and eligibility tests

- [ ] Check once after startup when sources are available.
- [ ] Run at most once per 24 hours.
- [ ] Delay first automatic deletion until next startup or 24 hours after enablement.
- [ ] Revalidate every candidate and exclude current, active, running, pinned, unavailable, and unmapped sessions.
- [ ] Never auto-cascade child deletion.
- [ ] Continue after per-session failures and record audit results.
- [ ] Stop scheduling new cleanup when disabled.

### Phase 3 Verification

- [ ] Run destructive-path safety tests first.
- [ ] Run full frontend tests and typecheck.
- [ ] Run `cargo test` for session manager modules and `cargo check`.
- [ ] Review all filesystem operations for resolved-path containment and non-recursive deletion.
- [ ] Manually verify default-off and double-confirm behavior.

---

## Final Acceptance

- [ ] Switching current `CODEX_HOME` never hides recorded historical sources.
- [ ] Duplicate thread IDs across sources remain distinct.
- [ ] Search scope matches the approved fixed fields only.
- [ ] Old-source resume remains source-bound.
- [ ] Derivation creates a new thread without mutating source history.
- [ ] Automatic permanent deletion cannot enable without explicit double confirmation.
- [ ] Cleanup uses archive age and never immediately deletes newly discovered legacy archives.
- [ ] Unsafe or uncertain file mappings are never deleted.
- [ ] App and daemon contracts remain in parity.
- [ ] Every completed Task has passed the knowledge-value decision; durable knowledge is classified, indexed, and quality-checked.
- [ ] Any requirement changes preserve old spec/plan snapshots and traceable supersession links.
