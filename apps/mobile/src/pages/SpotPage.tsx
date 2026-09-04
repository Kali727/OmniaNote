import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { itemsApi, type Item } from "../lib/items";
import { locationsApi, type Spot } from "../lib/locations";
import { STAMP_META } from "../lib/stamps";

const FALLBACK_ICON: Record<Item["type"], string> = {
  PHOTO: "🖼️",
  VIDEO: "🎥",
  PDF: "📄",
  NOTE: "📝",
};

export default function SpotPage() {
  const { spotId } = useParams<{ spotId: string }>();
  const navigate = useNavigate();
  const [spot, setSpot] = useState<Spot | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!spotId) return;
    Promise.all([locationsApi.getSpot(spotId), itemsApi.listBySpot(spotId)])
      .then(([spotData, history]) => {
        setSpot(spotData);
        setItems(history);
      })
      .finally(() => setLoading(false));
  }, [spotId]);

  return (
    <div className="screen">
      <div className="topbar">
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "inherit" }}>
          ← {spot?.name ?? "Spot history"}
        </button>
      </div>
      <div className="screen__content">
        <div className="section-title">History</div>
        {loading && <p className="empty-state">Loading…</p>}
        {!loading && items.length === 0 && (
          <p className="empty-state">Nothing logged against this spot yet — assign an item to it from the item's detail screen.</p>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className="location-row"
            style={{ marginBottom: "0.6rem", display: "flex", gap: "0.75rem", alignItems: "center", cursor: "pointer" }}
            onClick={() => navigate(`/items/${item.id}`)}
          >
            {item.thumbnailUrl ? (
              <img
                src={item.thumbnailUrl}
                alt=""
                style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover", flexShrink: 0 }}
              />
            ) : (
              <span style={{ fontSize: "1.4rem", width: 48, textAlign: "center", flexShrink: 0 }}>
                {FALLBACK_ICON[item.type]}
              </span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
              <div style={{ color: "var(--ink-soft)", fontSize: "0.8rem", marginTop: "0.2rem" }}>
                {new Date(item.clientCreatedAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
                {item.stamps.length > 0 && (
                  <span style={{ marginLeft: "0.5rem" }}>
                    {item.stamps.map((stamp) => (
                      <span key={stamp} title={STAMP_META[stamp].label}>
                        {STAMP_META[stamp].emoji}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
