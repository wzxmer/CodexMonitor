import type { SessionSourceSnapshot } from "@/types";

export type ThreadListRuntimeContext = {
  sourceId: string | null;
  runtimeGeneration: number;
};

export type ThreadListContinuityState = {
  sourceId: string | null;
  runtimeGeneration: number;
  listGeneration: number;
  requestId: string;
  requestSequence: number;
  paginationComplete: boolean;
  verifiedSnapshot: SessionSourceSnapshot | null;
  staleThreadIds: string[];
};

export type ThreadListVerifiedCache = {
  sourceId: string | null;
  verifiedSnapshot: SessionSourceSnapshot | null;
};
