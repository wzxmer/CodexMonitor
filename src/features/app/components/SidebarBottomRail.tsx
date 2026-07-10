import ScrollText from "lucide-react/dist/esm/icons/scroll-text";
import Settings from "lucide-react/dist/esm/icons/settings";
import User from "lucide-react/dist/esm/icons/user";
import X from "lucide-react/dist/esm/icons/x";
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import {
  MenuTrigger,
  PopoverSurface,
} from "../../design-system/components/popover/PopoverPrimitives";
import { useI18n } from "@/features/i18n/I18nProvider";
import { useMenuController } from "../hooks/useMenuController";
import type { ThirdPartyKeyUsageSnapshot } from "../utils/thirdPartyKeyUsage";
import type { CodexKeyProfile } from "@/types";

type SidebarBottomRailProps = {
  sessionPercent: number | null;
  weeklyPercent: number | null;
  sessionResetLabel: string | null;
  weeklyResetLabel: string | null;
  creditsLabel: string | null;
  showWeekly: boolean;
  thirdPartyUsageTokens: number | null;
  thirdPartyUsageCostUsd: number | null;
  thirdPartyProviderUsage: ThirdPartyKeyUsageSnapshot | null;
  thirdPartyUsageMultiplier: number;
  codexKeyProfiles: CodexKeyProfile[];
  activeCodexKeyProfileId: string | null;
  onSelectCodexKeyProfile: (profileId: string) => void;
  onThirdPartyUsageMultiplierChange: (multiplier: number) => void;
  onOpenSettings: () => void;
  onOpenDebug: () => void;
  showDebugButton: boolean;
  showAccountSwitcher: boolean;
  accountLabel: string;
  accountActionLabel: string;
  accountDisabled: boolean;
  accountSwitching: boolean;
  accountCancelDisabled: boolean;
  onSwitchAccount: () => void;
  onCancelSwitchAccount: () => void;
};

type UsageRowProps = {
  label: string;
  percent: number | null;
  resetLabel: string | null;
};

function UsageRow({ label, percent, resetLabel }: UsageRowProps) {
  return (
    <div className="sidebar-usage-row">
      <div className="sidebar-usage-row-head">
        <span className="sidebar-usage-name">{label}</span>
        <span className="sidebar-usage-value">
          {percent === null ? "--" : `${percent}%`}
        </span>
      </div>
      <div className="sidebar-usage-bar" aria-hidden>
        <span className="sidebar-usage-bar-fill" style={{ width: `${percent ?? 0}%` }} />
      </div>
      {resetLabel && <div className="sidebar-usage-reset">{resetLabel}</div>}
    </div>
  );
}

function formatTokenCount(tokens: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(Math.max(0, tokens));
}

function formatEstimatedCost(costUsd: number) {
  const estimate = Math.max(0, costUsd);
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: estimate >= 1 ? 2 : 4,
    minimumFractionDigits: estimate > 0 && estimate < 1 ? 4 : 2,
  }).format(estimate);
}

function formatUsdValue(value: number | null) {
  if (value === null) {
    return "--";
  }
  const amount = Math.max(0, value);
  const formatted = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: amount >= 1 ? 2 : 4,
    minimumFractionDigits: amount > 0 && amount < 1 ? 4 : 2,
  }).format(amount);
  return `$${formatted}`;
}

function formatMultiplier(multiplier: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 4,
  }).format(Math.max(0, multiplier));
}

type ThirdPartyUsageSummaryProps = {
  tokens: number;
  costUsd: number | null;
  providerUsage: ThirdPartyKeyUsageSnapshot | null;
  multiplier: number;
  keyProfiles: CodexKeyProfile[];
  activeKeyProfileId: string | null;
  onSelectKeyProfile: (profileId: string) => void;
  onMultiplierChange: (multiplier: number) => void;
};

function ThirdPartyUsageSummary({
  tokens,
  costUsd,
  providerUsage,
  multiplier,
  keyProfiles,
  activeKeyProfileId,
  onSelectKeyProfile,
  onMultiplierChange,
}: ThirdPartyUsageSummaryProps) {
  const { t } = useI18n();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(() => String(multiplier));
  const skipNextCommitRef = useRef(false);

  useEffect(() => {
    if (!isEditing) {
      setDraft(String(multiplier));
    }
  }, [isEditing, multiplier]);

  const commitDraft = () => {
    if (skipNextCommitRef.current) {
      skipNextCommitRef.current = false;
      return;
    }
    const next = Number(draft);
    if (Number.isFinite(next) && next >= 0) {
      onMultiplierChange(next);
    } else {
      setDraft(String(multiplier));
    }
    setIsEditing(false);
  };

  const handleMultiplierKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
    if (event.key === "Escape") {
      skipNextCommitRef.current = true;
      setDraft(String(multiplier));
      setIsEditing(false);
      event.currentTarget.blur();
    }
  };

  const handleMultiplierBlur = (_event: FocusEvent<HTMLInputElement>) => {
    commitDraft();
  };

  return (
    <div className="sidebar-usage-third-party">
      {keyProfiles.length > 0 && (
        <div className="sidebar-usage-stat">
          <span>{t("sidebar.usageGroup")}</span>
          <select
            className="sidebar-usage-group-select"
            value={activeKeyProfileId ?? ""}
            aria-label={t("sidebar.usageGroup")}
            onChange={(event) => onSelectKeyProfile(event.target.value)}
          >
            <option value="">{t("settings.codex.defaultEnvVars")}</option>
            {keyProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.groupName?.trim() || profile.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {providerUsage ? (
        <>
          <div className="sidebar-usage-stat">
            <span>{t("sidebar.usageBalance")}</span>
            <strong>{formatUsdValue(providerUsage.balanceUsd)}</strong>
          </div>
          <div className="sidebar-usage-stat">
            <span>{t("sidebar.usageTodayCost")}</span>
            <strong>{formatUsdValue(providerUsage.todayCostUsd)}</strong>
          </div>
          <div className="sidebar-usage-stat">
            <span>{t("sidebar.usageMultiplier")}</span>
            {isEditing ? (
              <input
                className="sidebar-usage-multiplier-input"
                type="number"
                min="0"
                step="0.01"
                value={draft}
                aria-label={t("sidebar.usageMultiplier")}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={handleMultiplierBlur}
                onKeyDown={handleMultiplierKeyDown}
                autoFocus
              />
            ) : (
              <button
                type="button"
                className="sidebar-usage-multiplier-button"
                onClick={() => setIsEditing(true)}
                title={t("sidebar.usageEditMultiplier")}
              >
                x{formatMultiplier(multiplier)}
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="sidebar-usage-stat">
            <span>{t("sidebar.usageConsumed")}</span>
            <strong>{formatTokenCount(tokens)}</strong>
          </div>
          <div className="sidebar-usage-stat">
            <span>{t("sidebar.usageEstimatedCost")}</span>
            <strong>
              {costUsd === null ? "≈ " : "$"}
              {formatEstimatedCost(
                costUsd ?? (Math.max(0, tokens) / 1_000_000) * Math.max(0, multiplier),
              )}
            </strong>
          </div>
          <div className="sidebar-usage-stat">
            <span>{t("sidebar.usageMultiplier")}</span>
            {isEditing ? (
              <input
                className="sidebar-usage-multiplier-input"
                type="number"
                min="0"
                step="0.01"
                value={draft}
                aria-label={t("sidebar.usageMultiplier")}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={handleMultiplierBlur}
                onKeyDown={handleMultiplierKeyDown}
                autoFocus
              />
            ) : (
              <button
                type="button"
                className="sidebar-usage-multiplier-button"
                onClick={() => setIsEditing(true)}
                title={t("sidebar.usageEditMultiplier")}
              >
                x{formatMultiplier(multiplier)}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function SidebarBottomRail({
  sessionPercent,
  weeklyPercent,
  sessionResetLabel,
  weeklyResetLabel,
  creditsLabel,
  showWeekly,
  thirdPartyUsageTokens,
  thirdPartyUsageCostUsd,
  thirdPartyProviderUsage,
  thirdPartyUsageMultiplier,
  codexKeyProfiles,
  activeCodexKeyProfileId,
  onSelectCodexKeyProfile,
  onThirdPartyUsageMultiplierChange,
  onOpenSettings,
  onOpenDebug,
  showDebugButton,
  showAccountSwitcher,
  accountLabel,
  accountActionLabel,
  accountDisabled,
  accountSwitching,
  accountCancelDisabled,
  onSwitchAccount,
  onCancelSwitchAccount,
}: SidebarBottomRailProps) {
  const { t } = useI18n();
  const accountMenu = useMenuController();
  const {
    isOpen: accountMenuOpen,
    containerRef: accountMenuRef,
    close: closeAccountMenu,
    toggle: toggleAccountMenu,
  } = accountMenu;

  useEffect(() => {
    if (!showAccountSwitcher) {
      closeAccountMenu();
    }
  }, [closeAccountMenu, showAccountSwitcher]);

  return (
    <div className="sidebar-bottom-rail">
      <div className="sidebar-usage-panel">
        <div className="sidebar-usage-header">
          <div className="sidebar-usage-kicker">{t("sidebar.usage")}</div>
          {thirdPartyUsageTokens === null && creditsLabel && (
            <div className="sidebar-usage-credits">{creditsLabel}</div>
          )}
        </div>
        {thirdPartyUsageTokens !== null ? (
          <ThirdPartyUsageSummary
            tokens={thirdPartyUsageTokens}
            costUsd={thirdPartyUsageCostUsd}
            providerUsage={thirdPartyProviderUsage}
            multiplier={thirdPartyUsageMultiplier}
            keyProfiles={codexKeyProfiles}
            activeKeyProfileId={activeCodexKeyProfileId}
            onSelectKeyProfile={onSelectCodexKeyProfile}
            onMultiplierChange={onThirdPartyUsageMultiplierChange}
          />
        ) : (
          <div className="sidebar-usage-list">
            <UsageRow
              label={t("sidebar.session")}
              percent={sessionPercent}
              resetLabel={sessionResetLabel}
            />
            {showWeekly && (
              <UsageRow
                label={t("sidebar.weekly")}
                percent={weeklyPercent}
                resetLabel={weeklyResetLabel}
              />
            )}
          </div>
        )}
      </div>
      <div
        className={`sidebar-bottom-actions${showAccountSwitcher ? "" : " is-compact"}`}
      >
        {showAccountSwitcher && (
          <div className="sidebar-account-menu" ref={accountMenuRef}>
            <MenuTrigger
              isOpen={accountMenuOpen}
              popupRole="dialog"
              className="ghost sidebar-labeled-button sidebar-account-trigger"
              activeClassName="is-open"
              onClick={toggleAccountMenu}
              aria-label={t("sidebar.account")}
            >
              <span className="sidebar-account-trigger-content">
                <span className="sidebar-account-avatar" aria-hidden>
                  <User size={12} aria-hidden />
                </span>
                <span className="sidebar-account-trigger-label">{t("sidebar.account")}</span>
              </span>
            </MenuTrigger>
            {accountMenuOpen && (
              <PopoverSurface className="sidebar-account-popover" role="dialog">
                <div className="sidebar-account-title">{t("sidebar.account")}</div>
                <div className="sidebar-account-value">{accountLabel}</div>
                <div className="sidebar-account-actions-row">
                  <button
                    type="button"
                    className="primary sidebar-account-action"
                    onClick={onSwitchAccount}
                    disabled={accountDisabled}
                    aria-busy={accountSwitching}
                  >
                    <span className="sidebar-account-action-content">
                      {accountSwitching && (
                        <span className="sidebar-account-spinner" aria-hidden />
                      )}
                      <span>{accountActionLabel}</span>
                    </span>
                  </button>
                  {accountSwitching && (
                    <button
                      type="button"
                      className="secondary sidebar-account-cancel"
                      onClick={onCancelSwitchAccount}
                      disabled={accountCancelDisabled}
                      aria-label={t("sidebar.cancelAccountSwitch")}
                      title={t("sidebar.cancel")}
                    >
                      <X size={12} aria-hidden />
                    </button>
                  )}
                </div>
              </PopoverSurface>
            )}
          </div>
        )}
        <div className="sidebar-utility-actions">
            <button
              className="ghost sidebar-labeled-button sidebar-utility-button"
              type="button"
              onClick={onOpenSettings}
              aria-label={t("sidebar.openSettings")}
            >
              <span className="sidebar-labeled-button-icon" aria-hidden>
                <Settings size={14} aria-hidden />
              </span>
              <span>{t("settings.title")}</span>
            </button>
          {showDebugButton && (
            <button
              className="ghost sidebar-utility-button"
              type="button"
              onClick={onOpenDebug}
              aria-label={t("sidebar.openDebugLog")}
            >
              <ScrollText size={14} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
