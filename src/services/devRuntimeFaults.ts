type ThreadNotFoundFailure = {
  error: {
    code: -32600;
    message: string;
  };
};

let sendUserMessageThreadNotFoundId: string | null = null;

export function armDevSendUserMessageThreadNotFoundOnce(threadId: string) {
  if (!import.meta.env.DEV) {
    return false;
  }
  const normalizedThreadId = threadId.trim();
  if (!normalizedThreadId) {
    return false;
  }
  sendUserMessageThreadNotFoundId = normalizedThreadId;
  return true;
}

export function clearDevRuntimeFaults() {
  sendUserMessageThreadNotFoundId = null;
}

export function consumeDevSendUserMessageThreadNotFound(): ThreadNotFoundFailure | null {
  if (!import.meta.env.DEV || !sendUserMessageThreadNotFoundId) {
    return null;
  }
  const threadId = sendUserMessageThreadNotFoundId;
  sendUserMessageThreadNotFoundId = null;
  return {
    error: {
      code: -32600,
      message: `thread not found: ${threadId}`,
    },
  };
}
