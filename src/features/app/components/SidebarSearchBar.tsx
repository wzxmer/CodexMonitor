import X from "lucide-react/dist/esm/icons/x";
import { useI18n } from "@/features/i18n/I18nProvider";

type SidebarSearchBarProps = {
  isSearchOpen: boolean;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onClearSearch: () => void;
};

export function SidebarSearchBar({
  isSearchOpen,
  searchQuery,
  onSearchQueryChange,
  onClearSearch,
}: SidebarSearchBarProps) {
  const { t } = useI18n();
  return (
    <div className={`sidebar-search${isSearchOpen ? " is-open" : ""}`}>
      {isSearchOpen && (
        <input
          className="sidebar-search-input"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder={t("sidebar.searchThreads")}
          aria-label={t("sidebar.searchThreads")}
          data-tauri-drag-region="false"
          autoFocus
        />
      )}
      {isSearchOpen && searchQuery.length > 0 && (
        <button
          type="button"
          className="sidebar-search-clear"
          onClick={onClearSearch}
          aria-label={t("sidebar.clearSearch")}
          data-tauri-drag-region="false"
        >
          <X size={12} aria-hidden />
        </button>
      )}
    </div>
  );
}
