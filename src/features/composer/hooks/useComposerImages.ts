import { useCallback, useMemo, useState } from "react";
import { pickAttachmentFiles, saveComposerImages } from "../../../services/tauri";
import { isImageAttachment } from "../../../utils/attachments";

const MAX_COMPOSER_ATTACHMENTS = 10;

type UseComposerImagesArgs = {
  activeThreadId: string | null;
  activeWorkspaceId: string | null;
};

export function useComposerImages({
  activeThreadId,
  activeWorkspaceId,
}: UseComposerImagesArgs) {
  const [imagesByThread, setImagesByThread] = useState<Record<string, string[]>>({});

  const draftKey = useMemo(
    () => activeThreadId ?? `draft-${activeWorkspaceId ?? "none"}`,
    [activeThreadId, activeWorkspaceId],
  );

  const activeImages = imagesByThread[draftKey] ?? [];

  const attachImages = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) {
        return;
      }
      const attachImages = (nextPaths: string[]) => {
        setImagesByThread((prev) => {
          const existing = prev[draftKey] ?? [];
          const merged = Array.from(new Set([...existing, ...nextPaths])).slice(
            0,
            MAX_COMPOSER_ATTACHMENTS,
          );
          return { ...prev, [draftKey]: merged };
        });
      };
      const replaceImages = (sourcePaths: string[], savedPaths: string[]) => {
        setImagesByThread((prev) => {
          const existing = prev[draftKey] ?? [];
          const savedBySource = new Map(
            sourcePaths.map((sourcePath, index) => [sourcePath, savedPaths[index]]),
          );
          const merged = Array.from(
            new Set(existing.map((path) => savedBySource.get(path) ?? path)),
          );
          return { ...prev, [draftKey]: merged };
        });
      };
      attachImages(paths);
      if (!activeWorkspaceId) {
        return;
      }
      const imagePaths = paths.filter(isImageAttachment);
      if (imagePaths.length === 0) {
        return;
      }
      void saveComposerImages(activeWorkspaceId, imagePaths)
        .then((savedPaths) => {
          if (savedPaths.length > 0) {
            replaceImages(imagePaths, savedPaths);
          }
        })
        .catch((error) => {
          console.warn("Failed to save composer image attachments.", error);
        });
    },
    [activeWorkspaceId, draftKey],
  );

  const pickImages = useCallback(async () => {
    const picked = await pickAttachmentFiles();
    if (picked.length === 0) {
      return;
    }
    attachImages(picked);
  }, [attachImages]);

  const removeImage = useCallback(
    (path: string) => {
      setImagesByThread((prev) => {
        const existing = prev[draftKey] ?? [];
        const next = existing.filter((entry) => entry !== path);
        if (next.length === 0) {
          const { [draftKey]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [draftKey]: next };
      });
    },
    [draftKey],
  );

  const clearActiveImages = useCallback(() => {
    setImagesByThread((prev) => {
      if (!(draftKey in prev)) {
        return prev;
      }
      const { [draftKey]: _, ...rest } = prev;
      return rest;
    });
  }, [draftKey]);

  const setImagesForThread = useCallback((threadId: string, images: string[]) => {
    setImagesByThread((prev) => ({ ...prev, [threadId]: images }));
  }, []);

  const removeImagesForThread = useCallback((threadId: string) => {
    setImagesByThread((prev) => {
      if (!(threadId in prev)) {
        return prev;
      }
      const { [threadId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  return {
    activeImages,
    attachImages,
    pickImages,
    removeImage,
    clearActiveImages,
    setImagesForThread,
    removeImagesForThread,
  };
}
