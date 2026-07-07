export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function isMissingGitRepositoryError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("could not find repository") ||
    message.includes("not a git repository") ||
    (message.includes("repository") && message.includes("notfound")) ||
    message.includes("repository not found") ||
    message.includes("git root not found")
  );
}
