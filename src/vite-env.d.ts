/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_TENCENT_UPDATE_MANIFEST_URL?: string;
  readonly VITE_ALIYUN_UPDATE_MANIFEST_URL?: string;
  readonly VITE_TENCENT_CODEX_CLI_MANIFEST_URL?: string;
  readonly VITE_ALIYUN_CODEX_CLI_MANIFEST_URL?: string;
}
declare const __APP_COMMIT_HASH__: string;
declare const __APP_BUILD_DATE__: string;
declare const __APP_GIT_BRANCH__: string;
