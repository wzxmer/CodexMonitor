import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useI18n } from "@/features/i18n/I18nProvider";

const GITHUB_URL = "https://github.com/wzxmer/ThreadFleet";
const UPSTREAM_URL = "https://github.com/Dimillian/CodexMonitor";

export function AboutView() {
  const { t } = useI18n();
  const [version, setVersion] = useState<string | null>(null);

  const handleOpenGitHub = () => {
    void openUrl(GITHUB_URL);
  };

  const handleOpenUpstream = () => {
    void openUrl(UPSTREAM_URL);
  };

  useEffect(() => {
    let active = true;
    const fetchVersion = async () => {
      try {
        const value = await getVersion();
        if (active) {
          setVersion(value);
        }
      } catch {
        if (active) {
          setVersion(null);
        }
      }
    };

    void fetchVersion();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="about">
      <div className="about-card">
        <div className="about-header">
          <img
            className="about-icon"
            src="/app-icon.png"
            alt="ThreadFleet icon"
          />
          <div className="about-title">ThreadFleet</div>
        </div>
        <div className="about-version">
          {version ? `${t("about.version")} ${version}` : `${t("about.version")} —`}
        </div>
        <div className="about-tagline">{t("about.tagline")}</div>
        <div className="about-divider" />
        <div className="about-links">
          <button
            type="button"
            className="about-link"
            onClick={handleOpenGitHub}
          >
            GitHub
          </button>
          <span className="about-link-sep">|</span>
          <button
            type="button"
            className="about-link"
            onClick={handleOpenUpstream}
          >
            {t("about.upstream")}
          </button>
        </div>
        <div className="about-footer">{t("about.attribution")}</div>
      </div>
    </div>
  );
}
