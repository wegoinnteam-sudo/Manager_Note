import { useCallback, useRef, useState } from "react";
import type { AttachmentDTO } from "@shared/types";
import { ApiClientError, uploadAttachment } from "@/lib/api";
import { ALLOWED_UPLOAD_EXTENSIONS } from "@shared/types";
import { compressImageForUpload } from "@/lib/imageCompression";

export interface UploadItem {
  id: string;
  fileName: string;
  sizeBytes: number;
  progress: number;
  status: "uploading" | "success" | "error";
  errorMessage?: string;
  attachment?: AttachmentDTO;
}

const MAX_UPLOAD_MB = Number((import.meta as any).env?.VITE_MAX_UPLOAD_MB ?? 50);

function extensionOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx + 1).toLowerCase();
}

export function useUploadQueue(pageId: string, onUploaded: () => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const controllers = useRef(new Map<string, AbortController>());

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const uploadOne = useCallback(
    async (file: File) => {
      const id = crypto.randomUUID();
      const ext = extensionOf(file.name);

      if (!(ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(ext)) {
        setItems((prev) => [
          ...prev,
          { id, fileName: file.name, sizeBytes: file.size, progress: 0, status: "error", errorMessage: `허용되지 않은 파일 형식입니다: .${ext || "?"}` },
        ]);
        return;
      }

      const maxBytes = MAX_UPLOAD_MB * 1024 * 1024;
      setItems((prev) => [...prev, { id, fileName: file.name, sizeBytes: file.size, progress: 0, status: "uploading" }]);

      const upload = file.size > maxBytes ? await compressImageForUpload(file, maxBytes) : file;
      if (upload.size > maxBytes) {
        updateItem(id, { status: "error", errorMessage: `파일 크기는 ${MAX_UPLOAD_MB}MB를 초과할 수 없습니다.` });
        return;
      }
      if (upload !== file) updateItem(id, { fileName: upload.name, sizeBytes: upload.size });

      const controller = new AbortController();
      controllers.current.set(id, controller);

      uploadAttachment(pageId, upload, {
        idempotencyKey: id,
        signal: controller.signal,
        onProgress: (pct) => updateItem(id, { progress: pct }),
      })
        .then((attachment) => {
          updateItem(id, { status: "success", progress: 100, attachment });
          onUploaded();
        })
        .catch((err) => {
          const message = err instanceof ApiClientError ? err.message : "업로드에 실패했습니다.";
          updateItem(id, { status: "error", errorMessage: message });
        })
        .finally(() => controllers.current.delete(id));
    },
    [pageId, onUploaded, updateItem],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      for (const file of Array.from(files)) void uploadOne(file);
    },
    [uploadOne],
  );

  const cancel = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
  }, []);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  return { items, addFiles, cancel, dismiss };
}
