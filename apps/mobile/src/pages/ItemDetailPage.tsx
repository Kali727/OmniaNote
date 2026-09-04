import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { itemsApi, type Item } from "../lib/items";
import { locationsApi, type Folder, type Spot } from "../lib/locations";
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
  const [spots, setSpots] = useState<Spot[]>([]);
  const [savingSpot, setSavingSpot] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [savingFolder, setSavingFolder] = useState(false);

  useEffect(() => {
    if (!itemId) return;
    itemsApi.get(itemId).then(setItem).catch(() => setError("Couldn't load this item."));
  }, [itemId]);

  useEffect(() => {
    if (!item?.locationId) {
      setSpots([]);
      setFolders([]);
      return;
    }
    locationsApi.listSpots(item.locationId).then(setSpots);
    locationsApi.listFolders(item.locationId).then(setFolders);
  }, [item?.locationId]);

  // spotId/folderId: "" means "— None —" in the <select>, which must send an explicit
  // `null` to actually clear the assignment — omitting the key from the request instead
  // means "leave it as it is" (see fileItemSchema), which would silently do nothing.
  async function assignSpot(spotId: string) {
    if (!item || !item.locationId || savingSpot) return;
    const previous = item.spotId;
    setItem({ ...item, spotId: spotId || null });
    setSavingSpot(true);
    try {
      await itemsApi.file(item.id, { locationId: item.locationId, spotId: spotId || null });
    } catch {
      setItem((current) => (current ? { ...current, spotId: previous } : current));
      setError("Couldn't update the spot — try again.");
    } finally {
      setSavingSpot(false);
    }
  }

  async function assignFolder(folderId: string) {
    if (!item || !item.locationId || savingFolder) return;
    const previous = item.folderId;
    setItem({ ...item, folderId: folderId || null });
    setSavingFolder(true);
    try {
      await itemsApi.file(item.id, { locationId: item.locationId, folderId: folderId || null });
    } catch {
      setItem((current) => (current ? { ...current, folderId: previous } : current));
      setError("Couldn't update the folder — try again.");
    } finally {
      setSavingFolder(false);
    }
  }

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

            <div className="section-title">Folder</div>
            {!item.locationId ? (
              <p className="empty-state">File this item to a location from the Inbox to move it into a folder.</p>
            ) : folders.length === 0 ? (
              <p className="empty-state">No folders at this location yet — add one from the location screen.</p>
            ) : (
              <select value={item.folderId ?? ""} disabled={savingFolder} onChange={(e) => assignFolder(e.target.value)}>
                <option value="">— No folder (loose at location) —</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            )}

            <div className="section-title">Spot</div>
            {!item.locationId ? (
              <p className="empty-state">File this item to a location from the Inbox to assign it to a spot.</p>
            ) : spots.length === 0 ? (
              <p className="empty-state">
                No spots at this location yet — add one from the location screen to start tracking history.
              </p>
            ) : (
              <select value={item.spotId ?? ""} disabled={savingSpot} onChange={(e) => assignSpot(e.target.value)}>
                <option value="">— No spot —</option>
                {spots.map((spot) => (
                  <option key={spot.id} value={spot.id}>
                    {spot.name}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
      </div>
    </div>
  );
}
