# Notification Thread Navigation Design

## Goal

Prevent intermediate agent messages from producing completion notifications and prevent ordinary window focus from changing the active conversation.

## Behavior

- A successful completion notification is emitted only after `turnCompleted`.
- A non-retryable `turnError` may emit an error notification.
- `agentMessageCompleted` only stores the latest message text for the eventual completion notification.
- Regaining application focus never changes the selected workspace or thread.
- A notification action opens its target thread only when the notification plugin reports an actual user action and the payload contains valid `workspaceId` and `threadId` strings.
- Fallback notifications without action events do not change the selected thread.

## Architecture

`useAgentSystemNotifications` owns notification timing and content. `useSystemNotificationThreadLinks` owns validated notification-action navigation and startup queuing. The updater controller no longer passes a notification-sent callback into navigation state.

## Verification

- An intermediate message followed by more work sends no notification.
- The same turn sends one notification after `turnCompleted`, using the stored message text.
- A focus event with no notification action does not navigate.
- A valid notification action navigates to its target thread.
- Invalid notification payloads are ignored.
