# Provider Profiles and Gateway Design

## Goal

CodexMonitor should let users switch Codex CLI runtime keys and OpenAI-compatible providers without editing global Codex configuration. Users can enter a provider URL and API key, fetch available models, select a model, optionally override context limits, and run CodexMonitor-launched Codex sessions through that profile.

The feature is Codex-only. It does not manage Claude, Gemini, or other CLI config files.

## Product Principles

- Do not modify global `CODEX_HOME/config.toml` for provider switching.
- Reuse global Codex configuration as the baseline for all settings not owned by the selected profile.
- Make provider switching seamless for users who only want to change keys or base URLs.
- Support common OpenAI-compatible providers through one public compatibility layer, not provider-specific private protocol rewrites.
- Keep raw provider keys inside CodexMonitor settings and avoid exposing them to Codex child processes when the gateway is enabled.

## Settings Navigation

Settings should be reorganized around user intent:

- `General`: theme, language, UI scale, startup behavior.
- `Codex`: Codex binary path, `CODEX_HOME`, global `config.toml` status, doctor and diagnostics.
- `Providers`: provider profiles, active/default profile, URL/key entry, model discovery, model selection, context window override.
- `Gateway`: local OpenAI-compatible gateway enablement, port, compatibility mode, request logging controls, connection diagnostics.
- `Features`: Codex feature flags such as collaboration modes, apps, background terminal, steering, and personality.
- `Remote`: daemon, mobile backend, Tailscale, remote endpoint/token settings.
- `Advanced`: direct global `config.toml` editor, logs, and advanced diagnostics.

Existing `Key Profile` UI should become `Provider Profiles`.

## Provider Profile Model

Each profile represents one runtime override layer for CodexMonitor-launched Codex sessions.

```ts
type ProviderProfile = {
  id: string;
  name: string;
  kind: "openai" | "deepseek" | "openrouter" | "custom";
  baseUrl: string;
  apiKey: string;
  model: string | null;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  useGateway: boolean;
  lastModelRefreshAtMs: number | null;
  cachedModels: ProviderModel[];
};

type ProviderModel = {
  id: string;
  name: string | null;
  contextWindow: number | null;
};
```

Rules:

- `baseUrl` and `apiKey` are required for a profile to be runnable.
- `model = null` means inherit the effective global Codex model.
- `contextWindow = null` means inherit Codex/default model context behavior.
- `maxOutputTokens = null` means do not override output token limits.
- `cachedModels` is advisory UI state; users can always type a model manually.

## Global Config Inheritance

CodexMonitor should treat global Codex config as a baseline:

- Inherit MCP servers, agents, skills, feature flags, personality, and other global Codex settings.
- Inherit model/provider only when no active profile override is selected or when the selected profile leaves a field empty.
- Never write provider profile values back to global `config.toml`.

Effective runtime config:

```text
effective config = global CODEX_HOME/config.toml
                 + selected ProviderProfile runtime overrides
                 + workspace-specific settings
```

This avoids profile drift when the user edits global MCP, agents, or feature settings.

## Model Discovery

After users enter `baseUrl` and `apiKey`, the Providers page should offer `Test and Fetch Models`.

Request:

```http
GET {normalizedBaseUrl}/models
Authorization: Bearer <apiKey>
```

Normalization:

- Trim whitespace.
- Add `https://` when scheme is missing.
- Add `/v1` when the host is provider-like and no API prefix is present.
- Preserve explicit paths users enter.
- Reject non-HTTP(S) schemes.

Response support:

- Primary format: OpenAI-compatible `{ "data": [{ "id": "model-id" }] }`.
- Optional metadata: display name and context length when providers expose stable fields.
- If `/models` is unsupported, keep the profile valid and allow manual model entry.

Error categories shown to users:

- Invalid URL.
- Unauthorized API key.
- Provider does not support model listing.
- Network or TLS failure.
- Unsupported response format.

## Context Window Override

Profiles can optionally override context window size.

User controls:

- Empty: inherit default.
- Presets: `32k`, `64k`, `128k`, `200k`, `1M`.
- Custom positive integer.

Semantics:

- The override is CodexMonitor/Codex runtime metadata, not a guarantee from the provider.
- The provider may still reject requests that exceed its real limit.
- Gateway errors for context overflow should be normalized into clear user-facing messages.

## Gateway

The local gateway is an OpenAI-compatible adapter managed by CodexMonitor.

Flow:

```text
Codex CLI
  -> http://127.0.0.1:<port>/v1/*
  -> CodexMonitor gateway
  -> selected provider baseUrl
```

When gateway is enabled, CodexMonitor launches Codex with:

```text
OPENAI_BASE_URL=http://127.0.0.1:<port>/v1
OPENAI_API_KEY=<non-secret placeholder>
```

The gateway injects the real provider API key when forwarding requests.

Gateway MVP endpoints:

- `GET /v1/models`
- `POST /v1/chat/completions`
- Pass-through for other `/v1/*` endpoints only when safe and needed.

Compatibility behavior:

- Forward common OpenAI fields: `model`, `messages`, `stream`, `tools`, `tool_choice`, `temperature`, `top_p`, `max_tokens`, `max_completion_tokens`.
- Optionally strip unknown or provider-rejected fields.
- Normalize `max_tokens` and `max_completion_tokens` where possible.
- Preserve streaming and emit OpenAI-style SSE chunks.
- Normalize provider errors to `{ error: { message, type, code } }`.
- Avoid logging secrets. Request logging must redact `Authorization`, API keys, and message bodies by default.

Provider presets:

- `openai`: default `https://api.openai.com/v1`, minimal transformation.
- `deepseek`: default `https://api.deepseek.com/v1`, OpenAI-compatible transformation.
- `openrouter`: default `https://openrouter.ai/api/v1`, allow required OpenRouter headers later.
- `custom`: user supplied URL, OpenAI-compatible best effort.

## Runtime Integration

Profile selection affects only new or reconnected Codex sessions.

Launch behavior:

- No active profile: existing behavior, global Codex config only.
- Active profile without gateway: inject selected `OPENAI_API_KEY`, optional `OPENAI_BASE_URL`, and optional model/context overrides.
- Active profile with gateway: inject local gateway URL and placeholder key; gateway owns the real provider credentials.

Existing sessions should not be mutated mid-run. UI should show when reconnect is required.

## App and Daemon Parity

Provider profile behavior must work for local app and remote daemon paths.

Shared core owns:

- Profile normalization.
- Model discovery request construction and response parsing.
- Effective runtime override calculation.
- Gateway request normalization and error mapping.

Adapters own:

- Tauri commands.
- Daemon JSON-RPC methods.
- Process launch environment injection.
- UI IPC wrappers.

## Migration

Existing `codexKeyProfiles` migrate into `providerProfiles`:

- `name` preserved.
- `key` maps to `apiKey`.
- `baseUrl` maps to `baseUrl`.
- `kind = "custom"` unless base URL matches a known preset.
- `model = null`.
- `contextWindow = null`.
- `useGateway = false` for backwards-compatible behavior.

Existing `activeCodexKeyProfileId` maps to `activeProviderProfileId`.

## Testing

Focused validation:

- Settings migration from `codexKeyProfiles` to `providerProfiles`.
- URL normalization for common base URL forms.
- Model discovery success, unauthorized, unsupported response, and network failure.
- Effective runtime override calculation with and without active profile.
- Process environment injection for direct mode and gateway mode.
- Gateway request forwarding with secret redaction.
- Gateway streaming response normalization.
- App/daemon RPC parity for model discovery and profile persistence.

Project validation after implementation:

```bash
npm run typecheck
npm run test
cd src-tauri && cargo check
```

## Non-Goals

- Do not manage Claude, Gemini, or other CLI configuration.
- Do not edit global `config.toml` for provider switching.
- Do not guarantee every provider-private extension works.
- Do not expose raw provider keys to Codex child processes when gateway mode is enabled.
- Do not mutate already-running sessions when profile changes.

## Implementation Decisions

- Direct mode remains available for backwards compatibility, but new non-OpenAI provider profiles should default to gateway mode.
- Provider keys remain in the existing settings persistence path for the MVP. A later secure-storage migration can move keys into OS keychain/credential storage without changing the profile UI contract.
- Context window and model overrides should use the least invasive supported runtime path. Prefer Codex launch/runtime parameters when available; otherwise generate a temporary per-session config overlay under the app data directory and point only that Codex process at it. Never write these overrides into global `config.toml`.
