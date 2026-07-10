# Session ID Resume And Model Refresh Implementation Plan

> **For agentic workers:** Implement tasks sequentially; keep session-management scope excluded.

**Goal:** Add workspace-scoped session-ID resume with full returned history, plus reliable model refresh on reconnect and manual request.

**Architecture:** Reuse existing `thread/resume` hydration path through a new explicit thread action. Keep prompt state in a focused hook and render through existing modal shell. Extend `useModels` with connection-generation refresh semantics and expose manual refresh through composer model UI without clearing stale data.

**Tech Stack:** React, TypeScript, Vitest, Tauri IPC, existing design-system modal/select primitives.

## Global Constraints

- Do not implement global local-session management, search, deletion, migration, or CC Switch behavior in this change.
- Keep backend contracts unchanged; existing `resume_thread` and `model_list` commands are sufficient.
- All new user-facing text must use `src/features/i18n/strings.ts` for every locale.
- Restored history must use existing hydration with `replaceLocal: true` and `trimItems: false`.
- Preserve existing model selection when refresh succeeds; preserve stale model list when refresh fails.

---

### Task 1: Explicit session-ID resume action

**Files:**
- Modify: `src/features/threads/hooks/useThreadActions.ts`
- Modify: `src/features/threads/hooks/useThreads.ts`
- Test: `src/features/threads/hooks/useThreadActions.test.tsx`

- [ ] Add `resumeThreadById(workspaceId, threadId)` that trims input, force-resumes with replacement, activates only after success, and returns the restored ID or `null`.
- [ ] Verify full returned history dispatches with `trimItems: false`.
- [ ] Verify failed resume does not create or activate a phantom thread.

### Task 2: Resume prompt and workspace menu

**Files:**
- Create: `src/features/threads/hooks/useResumeThreadPrompt.ts`
- Create: `src/features/threads/components/ResumeThreadPrompt.tsx`
- Modify: `src/features/app/components/AppModals.tsx`
- Modify: `src/features/app/hooks/useMainAppModals.ts`
- Modify: `src/features/app/components/Sidebar.tsx`
- Modify: `src/features/app/components/SidebarWorkspaceGroups.tsx`
- Modify: `src/features/app/hooks/useMainAppLayoutSurfaces.ts`
- Modify: `src/features/app/components/MainApp.tsx`
- Test: prompt, sidebar, and action tests adjacent to modified modules

- [ ] Add workspace menu item “通过会话 ID 恢复”.
- [ ] Add controlled modal with trim/non-empty validation, busy state, service error, Enter confirm, Escape/cancel behavior.
- [ ] On success close modal and activate restored session; on failure retain input.

### Task 3: Model reconnect and manual refresh

**Files:**
- Modify: `src/features/models/hooks/useModels.ts`
- Modify: `src/features/composer/components/Composer.tsx`
- Modify: `src/features/composer/components/ComposerMetaBar.tsx`
- Modify: relevant app/layout prop plumbing
- Test: `src/features/models/hooks/useModels.test.tsx`
- Test: `src/features/composer/components/ComposerMetaBar.test.tsx`

- [ ] Track disconnected-to-connected transitions and refresh once per transition.
- [ ] Keep current models visible while refresh runs.
- [ ] Expose `isRefreshingModels` and `refreshModels` to model menu.
- [ ] Add manual refresh control with disabled/loading state.
- [ ] Preserve valid user selection; fallback only when selected model disappears.

### Task 4: Localization and validation

**Files:**
- Modify: `src/features/i18n/strings.ts`

- [ ] Add all prompt, menu, refresh, success, and error strings for supported locales.
- [ ] Run focused tests.
- [ ] Run `npm run typecheck` and `npm run test`.
- [ ] Review final diff for regressions and unrelated edits.
