# Notification Thread Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Execute this plan task-by-task with tests before implementation.

**Goal:** Notify only on terminal turn events and navigate only after a real notification click.

**Architecture:** Keep completion detection in `useAgentSystemNotifications`. Register notification action handling in `useSystemNotificationThreadLinks`, validate payloads, and reuse its workspace connection/opening flow without a window-focus listener.

**Tech Stack:** React 19, TypeScript, Vitest, Tauri notification plugin.

## Global Constraints

- Preserve macOS, Windows, and Linux notification delivery.
- Fallback notifications must not auto-navigate.
- Do not alter approval or user-input notification generation.

### Task 1: Completion Semantics

**Files:**
- Modify: `src/features/notifications/hooks/useAgentSystemNotifications.ts`
- Test: `src/features/notifications/hooks/useAgentSystemNotifications.test.tsx`

- [ ] Add a regression test proving `onAgentMessageCompleted` does not notify before `onTurnCompleted`.
- [ ] Change message completion to cache text only.
- [ ] Run the focused notification hook test.

### Task 2: Click-Only Navigation

**Files:**
- Modify: `src/features/app/hooks/useSystemNotificationThreadLinks.ts`
- Test: `src/features/app/hooks/useSystemNotificationThreadLinks.test.tsx`

- [ ] Mock notification `onAction` and add action-navigation coverage.
- [ ] Replace the window-focus listener with a notification action listener.
- [ ] Validate `workspaceId` and `threadId` before navigation.
- [ ] Run the focused navigation hook test.

### Task 3: Remove Notification-Sent Coupling

**Files:**
- Modify: `src/features/app/components/MainApp.tsx`
- Modify: `src/features/app/hooks/useUpdaterController.ts`

- [ ] Remove `recordPendingThreadLinkRef` and `onThreadNotificationSent` wiring.
- [ ] Keep the notification action hook mounted with the existing external thread opener.
- [ ] Run typecheck and the full test suite.
