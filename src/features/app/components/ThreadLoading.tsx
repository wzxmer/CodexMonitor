type ThreadLoadingProps = {
  nested?: boolean;
};

export function ThreadLoading({ nested }: ThreadLoadingProps) {
  return (
    <div
      className={`thread-loading${nested ? " thread-loading-nested" : ""}`}
      aria-label="正在加载 Agents"
    >
      <span className="thread-skeleton thread-skeleton-wide" />
      <span className="thread-skeleton" />
      <span className="thread-skeleton thread-skeleton-short" />
    </div>
  );
}
