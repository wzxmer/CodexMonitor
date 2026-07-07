export type ErrorToast = {
  id: string;
  title: string;
  message: string;
  durationMs?: number;
};

export type ErrorToastInput = Omit<ErrorToast, "id"> & {
  id?: string;
};

type ErrorToastListener = (toast: ErrorToast) => void;

const errorToastListeners = new Set<ErrorToastListener>();

function makeToastId() {
  return `error-toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isMissingGitRepositoryToast(input: ErrorToastInput) {
  const message = `${input.title}\n${input.message}`.toLowerCase();
  return (
    message.includes("could not find repository") ||
    message.includes("not a git repository")
  );
}

export function pushErrorToast(input: ErrorToastInput) {
  if (isMissingGitRepositoryToast(input)) {
    return input.id ?? makeToastId();
  }

  const toast: ErrorToast = {
    id: input.id ?? makeToastId(),
    title: input.title,
    message: input.message,
    durationMs: input.durationMs,
  };

  for (const listener of errorToastListeners) {
    try {
      listener(toast);
    } catch (error) {
      console.error("[toasts] error toast listener failed", error);
    }
  }

  return toast.id;
}

export function subscribeErrorToasts(listener: ErrorToastListener) {
  errorToastListeners.add(listener);
  return () => {
    errorToastListeners.delete(listener);
  };
}

