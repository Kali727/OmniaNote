import { useEffect, useMemo } from "react";
import type { OutboxEntry } from "../lib/outboxDb";
import { syncQueue } from "../lib/syncQueue";

const FALLBACK_ICON: Record<OutboxEntry["type"], string> = {
  PHOTO: "🖼️",
  VIDEO: "🎥",
  PDF: "📄",
  NOTE: "📝",
};

const STATUS_META: Record<OutboxEntry["status"], { label: string; icon: string }> = {
  QUEUED: { label: "Queued — waiting for a connection", icon: "🕓" },
  UPLOADING: { label: "Uploading…", icon: "⬆️" },
  SYNCED: { label: "Synced", icon: "✅" },
  FAILED: { label: "Couldn't sync — tap to retry", icon: "⚠️" },
};

export function OutboxRow({ entry }: { entry: OutboxEntry }) {
  const previewBlob = entry.thumbnailBlob ?? (entry.type === "PHOTO" ? entry.fileBlob : undefined);
  const previewUrl = useMemo(() => (previewBlob ? URL.createObjectURL(previewBlob) : null), [previewBlob]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const meta = STATUS_META[entry.status];
  const retryable = entry.status === "FAILED";

  return (
    <div
      className="location-row"
      style={{ marginBottom: "0.6rem", display: "flex", gap: "0.75rem", alignItems: "center", cursor: retryable ? "pointer" : "default" }}
      onClick={retryable ? () => syncQueue.retry(entry.localId) : undefined}
    >
      {previewUrl ? (
        <img src={previewUrl} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
      ) : (
        <span style={{ fontSize: "1.4rem", width: 48, textAlign: "center", flexShrink: 0 }}>{FALLBACK_ICON[entry.type]}</span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.title}</div>
        <div
          className={entry.status === "FAILED" ? "error" : "empty-state"}
          style={{ margin: 0, fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
        >
          <span className={entry.status === "UPLOADING" ? "outbox-status-icon--spin" : undefined}>{meta.icon}</span>
          {entry.status === "FAILED" && entry.errorMessage ? entry.errorMessage : meta.label}
        </div>
      </div>
    </div>
  );
}
