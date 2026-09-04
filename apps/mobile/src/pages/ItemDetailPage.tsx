import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { itemsApi, type Item } from "../lib/items";
import { STAMP_META, STAMP_ORDER } from "../lib/stamps";
import type { StampType } from "@omnianote/shared";

const FALLBACK_ICON: Record<Item["type"], string> = {
  PHOTO: "🖼️",
  VIDEO: "🎥",
  PDF: "📄",
  NOTE: "📝",
};

export default function ItemDetailPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<(Item & { downloadUrl: string | null }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingStamps, setSavingStamps] = useState(false);

  useEffect(() => {
    if (!itemId) return;
    itemsApi.get(itemId).then(setItem).catch(() => setError("Couldn't load this item."));
  }, [itemId]);

  async function toggleStamp(stamp: StampType) {
    if (!item || savingStamps) return;
    const next = item.stamps.includes(stamp) ? item.stamps.filter((s) => s !== stamp) : [...item.stamps, stamp];
    const previous = item.stamps;
    setItem({ ...item, stamps: next });
    setSavingStamps(true);
    try {
      await itemsApi.setStamps(item.id, next);
    } catch {
      setItem((current) => (current ? { ...current, stamps: previous } : current));
      setError("Couldn't save that stamp — try again.");
    } finally {
      setSavingStamps(false);
    }
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "inherit" }}>
          ← Back
        </button>
      </div>
      <div className="screen__content">
        {error && <p className="error">{error}</p>}
        {!item && !error && <p className="empty-state">Loading…</p>}

        {item && (
          <>
            <div className="detail-preview">
              {item.type === "PHOTO" && (item.downloadUrl || item.thumbnailUrl) ? (
                <img src={item.downloadUrl ?? item.thumbnailUrl ?? undefined} alt="" />
              ) : (
                <div className="detail-preview__icon">{FALLBACK_ICON[item.type]}</div>
              )}
            </div>

            <div className="detail-title">{item.title}</div>
            {item.body && <p style={{ whiteSpace: "pre-wrap", marginBottom: "1.2rem" }}>{item.body}</p>}

            <div className="section-title">Stamps</div>
            <div className="stamp-picker">
              {STAMP_ORDER.map((stamp) => {
                const active = item.stamps.includes(stamp);
                const meta = STAMP_META[stamp];
                return (
                  <button
                    key={stamp}
                    className={`stamp-chip${active ? " stamp-chip--active" : ""}`}
                    style={{ "--stamp-color": meta.color } as CSSProperties}
                    onClick={() => toggleStamp(stamp)}
                  >
                    <span>{meta.emoji}</span>
                    <span>{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
