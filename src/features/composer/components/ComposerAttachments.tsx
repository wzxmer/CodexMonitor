import { convertFileSrc } from "@tauri-apps/api/core";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronUp from "lucide-react/dist/esm/icons/chevron-up";
import Copy from "lucide-react/dist/esm/icons/copy";
import FileText from "lucide-react/dist/esm/icons/file-text";
import Image from "lucide-react/dist/esm/icons/image";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import X from "lucide-react/dist/esm/icons/x";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import {
  attachmentDisplayName,
  decodeTextAttachmentDataUrl,
  isImageAttachment,
} from "../../../utils/attachments";
import { useI18n } from "@/features/i18n/I18nProvider";

type ComposerAttachmentsProps = {
  attachments: string[];
  disabled: boolean;
  onRemoveAttachment?: (path: string) => void;
  onRestoreTextAttachment?: (path: string, text: string) => void;
};

function fileTitle(path: string) {
  return attachmentDisplayName(path);
}

function attachmentPreviewSrc(path: string) {
  if (!isImageAttachment(path)) {
    return "";
  }
  if (path.startsWith("data:")) {
    return path;
  }
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  try {
    return convertFileSrc(path);
  } catch {
    return "";
  }
}

function ComposerImagePreview({
  src,
  label,
  onClose,
}: {
  src: string;
  label: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return createPortal(
    <div className="composer-image-preview" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="composer-image-preview-content" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="composer-image-preview-close"
          onClick={onClose}
          aria-label={t("common.close")}
        >
          <X size={16} aria-hidden />
        </button>
        <img src={src} alt={label} />
      </div>
    </div>,
    document.body,
  );
}

async function copyImageAttachment(previewSrc: string, fallbackText: string) {
  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      const response = await fetch(previewSrc);
      const sourceBlob = await response.blob();
      const clipboardBlob = await convertImageBlobToPng(sourceBlob);
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": clipboardBlob }),
      ]);
      return;
    }
  } catch {
    await navigator.clipboard?.writeText(fallbackText);
    return;
  }
  await navigator.clipboard?.writeText(fallbackText);
}

async function convertImageBlobToPng(blob: Blob) {
  if (blob.type === "image/png") {
    return blob;
  }
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context unavailable");
    }
    context.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((pngBlob) => {
        if (pngBlob) {
          resolve(pngBlob);
        } else {
          reject(new Error("Image conversion failed"));
        }
      }, "image/png");
    });
  } finally {
    bitmap.close();
  }
}

export function ComposerAttachments({
  attachments,
  disabled,
  onRemoveAttachment,
  onRestoreTextAttachment,
}: ComposerAttachmentsProps) {
  const { t } = useI18n();
  const [expandedAttachments, setExpandedAttachments] = useState<Set<string>>(
    () => new Set(),
  );
  const [previewImage, setPreviewImage] = useState<{ src: string; label: string } | null>(null);
  if (attachments.length === 0) {
    return null;
  }

  const toggleExpanded = (path: string) => {
    setExpandedAttachments((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <div className="composer-attachments">
      {attachments.map((path) => {
        const title = fileTitle(path);
        const titleAttr = path.startsWith("data:image/")
          ? t("composer.pastedImage")
          : path.startsWith("data:")
            ? t("composer.pastedAttachment")
            : path;
        const previewSrc = attachmentPreviewSrc(path);
        const textAttachment = decodeTextAttachmentDataUrl(path);
        const expanded = expandedAttachments.has(path);
        const lineCount = textAttachment
          ? textAttachment.text.split("\n").length
          : 0;
        const characterCount = textAttachment
          ? Array.from(textAttachment.text).length
          : 0;
        return (
          <div
            key={path}
            className={`composer-attachment${textAttachment ? " is-text-attachment" : ""}`}
            title={titleAttr}
          >
            <div className="composer-attachment-main">
              {previewSrc && (
                <span className="composer-attachment-preview" aria-hidden>
                  <img src={previewSrc} alt="" />
                </span>
              )}
              {previewSrc ? (
                <button
                  type="button"
                  className="composer-attachment-open"
                  onClick={() => setPreviewImage({ src: previewSrc, label: title })}
                  disabled={disabled}
                  aria-label={`${t("composer.openImage")} ${title}`}
                >
                  <span className="composer-attachment-thumb" aria-hidden>
                    <img src={previewSrc} alt="" />
                  </span>
                  <span className="composer-attachment-copy">
                    <span className="composer-attachment-name">{title}</span>
                  </span>
                </button>
              ) : (
                <>
                  <span className="composer-icon" aria-hidden>
                    {isImageAttachment(path) ? <Image size={14} /> : <FileText size={14} />}
                  </span>
                  <span className="composer-attachment-copy">
                    <span className="composer-attachment-name">{title}</span>
                    {textAttachment && (
                      <span className="composer-attachment-meta">
                        {t("composer.textAttachmentStats")
                          .replace("{characters}", String(characterCount))
                          .replace("{lines}", String(lineCount))}
                      </span>
                    )}
                  </span>
                </>
              )}
              {previewSrc && (
                <button
                  type="button"
                  className="composer-attachment-copy-image"
                  onClick={() => {
                    void copyImageAttachment(previewSrc, path).catch((error) => {
                      console.warn("Failed to copy image attachment.", error);
                    });
                  }}
                  disabled={disabled}
                  aria-label={`${t("composer.copyImage")} ${title}`}
                  title={t("composer.copyImage")}
                >
                  <Copy size={13} aria-hidden />
                </button>
              )}
              {textAttachment && (
                <button
                  type="button"
                  className="composer-attachment-action"
                  onClick={() => toggleExpanded(path)}
                  aria-expanded={expanded}
                  disabled={disabled}
                >
                  {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  {expanded ? t("composer.collapsePreview") : t("composer.expandPreview")}
                </button>
              )}
              {textAttachment && onRestoreTextAttachment && (
                <button
                  type="button"
                  className="composer-attachment-action"
                  onClick={() => onRestoreTextAttachment(path, textAttachment.text)}
                  disabled={disabled}
                >
                  <RotateCcw size={13} />
                  {t("composer.restoreToEditor")}
                </button>
              )}
              <button
                type="button"
                className="composer-attachment-remove"
                onClick={() => onRemoveAttachment?.(path)}
                aria-label={`${t("composer.remove")} ${title}`}
                disabled={disabled}
              >
                <X size={12} aria-hidden />
              </button>
            </div>
            {textAttachment && expanded && (
              <pre className="composer-attachment-text-preview">{textAttachment.text}</pre>
            )}
          </div>
        );
      })}
      {previewImage && (
        <ComposerImagePreview
          src={previewImage.src}
          label={previewImage.label}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
}
