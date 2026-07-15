import { useCallback, useRef, useState } from "react";
import {
  applyWindowsInstallerRepair,
  recoverWindowsInstallerRepair,
  previewWindowsInstallerRepair,
  rollbackWindowsInstallerRepair,
  type WindowsInstallerRepairPreview,
  type WindowsInstallerRepairResult,
} from "@services/tauri";

export type WindowsInstallerRepairPhase =
  | "idle"
  | "previewing"
  | "ready"
  | "applying"
  | "completed"
  | "rollingBack"
  | "rolledBack"
  | "recovering"
  | "recovered"
  | "error";

export type WindowsInstallerRepairState = {
  phase: WindowsInstallerRepairPhase;
  preview: WindowsInstallerRepairPreview | null;
  result: WindowsInstallerRepairResult | null;
  error: string | null;
};

const INITIAL_STATE: WindowsInstallerRepairState = {
  phase: "idle",
  preview: null,
  result: null,
  error: null,
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function createOperationId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function useWindowsInstallerRepair() {
  const [state, setState] =
    useState<WindowsInstallerRepairState>(INITIAL_STATE);
  const busyRef = useRef(false);

  const preview = useCallback(async () => {
    if (busyRef.current) {
      return null;
    }
    busyRef.current = true;
    setState({ phase: "previewing", preview: null, result: null, error: null });
    try {
      const nextPreview = await previewWindowsInstallerRepair();
      setState({
        phase: "ready",
        preview: nextPreview,
        result: null,
        error: null,
      });
      return nextPreview;
    } catch (error) {
      setState({
        phase: "error",
        preview: null,
        result: null,
        error: errorMessage(error),
      });
      return null;
    } finally {
      busyRef.current = false;
    }
  }, []);

  const apply = useCallback(async () => {
    const fingerprint = state.preview?.fingerprint;
    if (
      busyRef.current ||
      state.phase !== "ready" ||
      state.preview?.status !== "repairable" ||
      !fingerprint
    ) {
      return null;
    }
    busyRef.current = true;
    setState((current) => ({ ...current, phase: "applying", error: null }));
    try {
      const result = await applyWindowsInstallerRepair(
        fingerprint,
        createOperationId(),
      );
      if (result.status === "unsupported") {
        setState({
          phase: "error",
          preview: null,
          result: null,
          error: result.message ?? "Windows installer repair is unsupported.",
        });
        return result;
      }
      setState({
        phase: result.status === "completed" ? "completed" : "rolledBack",
        preview: null,
        result,
        error: null,
      });
      return result;
    } catch (error) {
      // Applying can fail because the preview fingerprint expired. Require a new preview.
      setState({
        phase: "error",
        preview: null,
        result: null,
        error: errorMessage(error),
      });
      return null;
    } finally {
      busyRef.current = false;
    }
  }, [state.phase, state.preview]);

  const rollback = useCallback(async () => {
    const transactionId = state.result?.transactionId;
    const postFingerprint = state.result?.fingerprint;
    if (
      busyRef.current ||
      state.phase !== "completed" ||
      !transactionId ||
      !postFingerprint
    ) {
      return null;
    }
    busyRef.current = true;
    setState((current) => ({ ...current, phase: "rollingBack", error: null }));
    try {
      const result = await rollbackWindowsInstallerRepair(
        transactionId,
        postFingerprint,
      );
      if (result.status !== "rolledBack") {
        setState((current) => ({
          ...current,
          phase: "error",
          error:
            result.message ??
            "Windows installer repair rollback is unsupported.",
        }));
        return result;
      }
      setState({ phase: "rolledBack", preview: null, result, error: null });
      return result;
    } catch (error) {
      setState((current) => ({
        ...current,
        phase: "error",
        error: errorMessage(error),
      }));
      return null;
    } finally {
      busyRef.current = false;
    }
  }, [state.phase, state.result]);

  const recover = useCallback(async () => {
    if (busyRef.current) {
      return null;
    }
    busyRef.current = true;
    setState({ phase: "recovering", preview: null, result: null, error: null });
    try {
      const result = await recoverWindowsInstallerRepair();
      if (result.status === "unsupported") {
        setState({
          phase: "error",
          preview: null,
          result: null,
          error: result.message ?? "Windows installer recovery is unsupported.",
        });
        return result;
      }
      setState({ phase: "recovered", preview: null, result: null, error: null });
      return result;
    } catch (error) {
      setState({
        phase: "error",
        preview: null,
        result: null,
        error: errorMessage(error),
      });
      return null;
    } finally {
      busyRef.current = false;
    }
  }, []);

  const reset = useCallback(() => {
    if (!busyRef.current) {
      setState((current) =>
        current.phase === "idle" &&
        current.preview === null &&
        current.result === null &&
        current.error === null
          ? current
          : INITIAL_STATE,
      );
    }
  }, []);

  return {
    state,
    preview,
    apply,
    rollback,
    recover,
    reset,
    busy:
      state.phase === "previewing" ||
      state.phase === "applying" ||
      state.phase === "rollingBack" ||
      state.phase === "recovering",
    canApply:
      state.phase === "ready" &&
      state.preview?.status === "repairable" &&
      Boolean(state.preview.fingerprint),
    canRollback:
      state.phase === "completed" &&
      Boolean(state.result?.transactionId && state.result.fingerprint),
  };
}
