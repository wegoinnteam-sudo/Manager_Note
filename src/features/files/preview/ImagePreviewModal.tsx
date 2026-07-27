import { useState } from "react";
import type { AttachmentDTO } from "@shared/types";
import { Modal } from "@/components/Modal";

export function ImagePreviewModal({ attachment, onClose }: { attachment: AttachmentDTO; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const src = `/api/attachments/${attachment.id}/preview`;

  return (
    <Modal
      title={attachment.fileName}
      onClose={onClose}
      headerExtra={
        <>
          <button type="button" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}>
            −
          </button>
          <span style={{ fontSize: 12 }}>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}>
            +
          </button>
          <a href={`/api/attachments/${attachment.id}/download`}>↓ 다운로드</a>
        </>
      }
    >
      <img
        src={src}
        alt={attachment.fileName}
        style={{ maxWidth: "100%", transform: `scale(${zoom})`, transformOrigin: "center center", transition: "transform 0.1s ease" }}
      />
    </Modal>
  );
}
