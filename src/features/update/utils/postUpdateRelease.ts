export const STORAGE_KEY_PENDING_POST_UPDATE_VERSION =
  "codexmonitor.pendingPostUpdateVersion";
const GITHUB_RELEASES_API_BASE =
  "https://api.github.com/repos/wzxmer/CodexMonitor/releases";
const GITHUB_RELEASES_WEB_BASE =
  "https://github.com/wzxmer/CodexMonitor/releases";

type GitHubReleaseResponse = {
  tag_name?: string;
  html_url?: string;
  body?: string | null;
  assets?: GitHubReleaseAssetResponse[];
};

type GitHubReleaseAssetResponse = {
  name?: string;
  browser_download_url?: string;
  size?: number;
  digest?: string | null;
};

type MirrorReleaseManifest = {
  version?: string;
  htmlUrl?: string;
  body?: string | null;
  assets?: MirrorReleaseAsset[];
};

type MirrorReleaseAsset = {
  name?: string;
  size?: number;
  sha256?: string;
  url?: string;
};

export type PostUpdateReleaseInfo = {
  body: string | null;
  htmlUrl: string;
  tag: string | null;
};

export type ReleasePlatform = "windows" | "macos" | "linux" | "unknown";

export type ReleaseAsset = {
  name: string;
  urls: string[];
  size?: number;
  sha256?: string;
};

export type ReleaseUpdateInfo = {
  version: string;
  htmlUrl: string;
  body: string | null;
  asset: ReleaseAsset;
};

const MIRROR_MANIFEST_URLS = [
  import.meta.env.VITE_TENCENT_UPDATE_MANIFEST_URL,
  import.meta.env.VITE_ALIYUN_UPDATE_MANIFEST_URL,
].filter((value): value is string => Boolean(value?.trim()));

function normalizeSha256(value: string | null | undefined): string | undefined {
  const normalized = value?.trim().replace(/^sha256:/i, "").toLowerCase();
  return normalized && /^[a-f0-9]{64}$/.test(normalized) ? normalized : undefined;
}

function normalizeStoredVersion(value: string): string {
  let normalized = value.trim();
  while (normalized.startsWith("v") || normalized.startsWith("V")) {
    normalized = normalized.slice(1);
  }
  return normalized.trim();
}

export function normalizeReleaseVersion(value: string): string {
  return normalizeStoredVersion(value);
}

export function buildReleaseTagUrl(version: string): string {
  const normalized = normalizeStoredVersion(version);
  const tag = normalized.length > 0 ? `v${normalized}` : "latest";
  return `${GITHUB_RELEASES_WEB_BASE}/tag/${encodeURIComponent(tag)}`;
}

export function detectReleasePlatform(): ReleasePlatform {
  const platformText = [
    navigator.userAgent,
    navigator.platform,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (platformText.includes("win")) {
    return "windows";
  }
  if (platformText.includes("mac") || platformText.includes("darwin")) {
    return "macos";
  }
  if (platformText.includes("linux") || platformText.includes("x11")) {
    return "linux";
  }
  return "unknown";
}

export function isReleaseVersionNewer(
  candidateVersion: string,
  currentVersion: string,
): boolean {
  const candidate = parseVersionParts(candidateVersion);
  const current = parseVersionParts(currentVersion);
  if (!candidate || !current) {
    return normalizeStoredVersion(candidateVersion) !== normalizeStoredVersion(currentVersion);
  }
  for (let index = 0; index < Math.max(candidate.length, current.length); index += 1) {
    const candidatePart = candidate[index] ?? 0;
    const currentPart = current[index] ?? 0;
    if (candidatePart > currentPart) {
      return true;
    }
    if (candidatePart < currentPart) {
      return false;
    }
  }
  return false;
}

export function selectReleaseAsset(
  assets: ReleaseAsset[],
  platform: ReleasePlatform,
): ReleaseAsset | null {
  const usableAssets = assets.filter((asset) => {
    const name = asset.name.toLowerCase();
    return (
      asset.urls.some((url) =>
        url.startsWith("https://github.com/wzxmer/CodexMonitor/releases/download/"),
      ) &&
      !name.endsWith(".sig") &&
      !name.endsWith(".zip") &&
      !name.endsWith(".blockmap")
    );
  });
  const preferredExtensions =
    platform === "windows"
      ? [".msi", ".exe"]
      : platform === "macos"
        ? [".dmg"]
        : platform === "linux"
          ? [".appimage", ".rpm"]
          : [".msi", ".exe", ".dmg", ".appimage", ".rpm"];

  for (const extension of preferredExtensions) {
    const match = usableAssets.find((asset) =>
      asset.name.toLowerCase().endsWith(extension),
    );
    if (match) {
      return match;
    }
  }
  return null;
}

function selectMirrorReleaseAsset(
  assets: ReleaseAsset[],
  platform: ReleasePlatform,
): ReleaseAsset | null {
  const preferredExtensions =
    platform === "windows"
      ? [".msi", ".exe"]
      : platform === "macos"
        ? [".dmg"]
        : platform === "linux"
          ? [".appimage", ".rpm"]
          : [".msi", ".exe", ".dmg", ".appimage", ".rpm"];
  return preferredExtensions
    .map((extension) =>
      assets.find((asset) => asset.name.toLowerCase().endsWith(extension)),
    )
    .find((asset): asset is ReleaseAsset => Boolean(asset)) ?? null;
}

function parseMirrorUpdate(
  payload: MirrorReleaseManifest,
  currentVersion: string,
  platform: ReleasePlatform,
): ReleaseUpdateInfo | null {
  const version = normalizeStoredVersion(payload.version ?? "");
  if (!version || !isReleaseVersionNewer(version, currentVersion)) return null;
  const assets = (payload.assets ?? [])
    .map((asset): ReleaseAsset | null => {
      const name = asset.name?.trim();
      const url = asset.url?.trim();
      const sha256 = normalizeSha256(asset.sha256);
      if (!name || !url || !sha256) return null;
      return { name, urls: [url], size: asset.size, sha256 };
    })
    .filter((asset): asset is ReleaseAsset => asset !== null);
  const selectedAsset = selectMirrorReleaseAsset(assets, platform);
  if (!selectedAsset) {
    throw new Error("No compatible installer asset found in the update mirror.");
  }
  return {
    version,
    htmlUrl: payload.htmlUrl?.trim() || buildReleaseTagUrl(version),
    body: payload.body?.trim() ? payload.body : null,
    asset: selectedAsset,
  };
}

async function fetchMirrorUpdate(
  manifestUrl: string,
  currentVersion: string,
  platform: ReleasePlatform,
): Promise<ReleaseUpdateInfo | null> {
  const response = await fetch(manifestUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Update mirror request failed (${response.status}).`);
  }
  return parseMirrorUpdate(
    (await response.json()) as MirrorReleaseManifest,
    currentVersion,
    platform,
  );
}

export async function fetchLatestReleaseUpdate(
  currentVersion: string,
  platform: ReleasePlatform = detectReleasePlatform(),
  mirrorManifestUrls: string[] = MIRROR_MANIFEST_URLS,
): Promise<ReleaseUpdateInfo | null> {
  let githubError: unknown;
  try {
    const response = await fetch(`${GITHUB_RELEASES_API_BASE}/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`GitHub releases request failed (${response.status}).`);
    }

    const payload = (await response.json()) as GitHubReleaseResponse;
    const releaseVersion = normalizeStoredVersion(payload.tag_name ?? "");
    if (!releaseVersion || !isReleaseVersionNewer(releaseVersion, currentVersion)) return null;

    const assets = (payload.assets ?? [])
      .map((asset): ReleaseAsset | null => {
        const name = asset.name?.trim();
        const url = asset.browser_download_url?.trim();
        if (!name || !url) return null;
        return {
          name,
          urls: [url],
          size: asset.size,
          sha256: normalizeSha256(asset.digest),
        };
      })
      .filter((asset): asset is ReleaseAsset => asset !== null);
    const selectedAsset = selectReleaseAsset(assets, platform);
    if (!selectedAsset) {
      throw new Error("No compatible installer asset found in the latest release.");
    }

    for (const manifestUrl of mirrorManifestUrls) {
      try {
        const mirrorUpdate = await fetchMirrorUpdate(manifestUrl, currentVersion, platform);
        if (mirrorUpdate?.version === releaseVersion && mirrorUpdate.asset.name === selectedAsset.name) {
          selectedAsset.urls.push(...mirrorUpdate.asset.urls);
          selectedAsset.sha256 ??= mirrorUpdate.asset.sha256;
          selectedAsset.size ??= mirrorUpdate.asset.size;
        }
      } catch {
        // GitHub remains usable when a mirror is offline.
      }
    }
    return {
      version: releaseVersion,
      htmlUrl: payload.html_url?.trim() || buildReleaseTagUrl(releaseVersion),
      body: payload.body?.trim() ? payload.body : null,
      asset: selectedAsset,
    };
  } catch (error) {
    githubError = error;
  }

  let mirrorUpdate: ReleaseUpdateInfo | null = null;
  for (const manifestUrl of mirrorManifestUrls) {
    try {
      const candidate = await fetchMirrorUpdate(manifestUrl, currentVersion, platform);
      if (!candidate) continue;
      if (!mirrorUpdate) {
        mirrorUpdate = candidate;
      } else if (
        candidate.version === mirrorUpdate.version &&
        candidate.asset.name === mirrorUpdate.asset.name
      ) {
        mirrorUpdate.asset.urls.push(...candidate.asset.urls);
      }
    } catch {
      // Continue to the next configured mirror.
    }
  }
  if (mirrorUpdate) return mirrorUpdate;
  throw githubError;
}

export function savePendingPostUpdateVersion(version: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const normalized = normalizeStoredVersion(version);
  if (!normalized) {
    return;
  }
  try {
    window.localStorage.setItem(
      STORAGE_KEY_PENDING_POST_UPDATE_VERSION,
      normalized,
    );
  } catch {
    // Best-effort persistence.
  }
}

export function loadPendingPostUpdateVersion(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PENDING_POST_UPDATE_VERSION);
    if (!raw) {
      return null;
    }
    const normalized = normalizeStoredVersion(raw);
    return normalized || null;
  } catch {
    return null;
  }
}

export function clearPendingPostUpdateVersion(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY_PENDING_POST_UPDATE_VERSION);
  } catch {
    // Best-effort persistence.
  }
}

function parseVersionParts(value: string): number[] | null {
  const normalized = normalizeStoredVersion(value);
  if (!normalized) {
    return null;
  }
  const core = normalized.split("-", 1)[0];
  const parts = core.split(".");
  if (parts.some((part) => !/^\d+$/.test(part))) {
    return null;
  }
  return parts.map((part) => Number(part));
}

export async function fetchReleaseNotesForVersion(
  version: string,
): Promise<PostUpdateReleaseInfo> {
  const normalized = normalizeStoredVersion(version);
  if (!normalized) {
    throw new Error("Invalid release version.");
  }

  const candidates = [`v${normalized}`, normalized];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const tag = candidate.trim();
    if (!tag || seen.has(tag)) {
      continue;
    }
    seen.add(tag);
    const url = `${GITHUB_RELEASES_API_BASE}/tags/${encodeURIComponent(tag)}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
      },
    });
    if (response.status === 404) {
      continue;
    }
    if (!response.ok) {
      throw new Error(`GitHub releases request failed (${response.status}).`);
    }
    const payload = (await response.json()) as GitHubReleaseResponse;
    const body = payload.body?.trim() ? payload.body : null;
    const htmlUrl =
      payload.html_url && payload.html_url.trim().length > 0
        ? payload.html_url
        : buildReleaseTagUrl(normalized);
    const resultTag =
      payload.tag_name && payload.tag_name.trim().length > 0
        ? payload.tag_name
        : null;
    return {
      body,
      htmlUrl,
      tag: resultTag,
    };
  }

  throw new Error(`Could not find GitHub release for version ${normalized}.`);
}
