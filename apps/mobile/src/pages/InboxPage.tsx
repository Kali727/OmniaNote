import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { itemsApi, type Item } from "../lib/items";
import { locationsApi, type Folder, type Location, type Spot } from "../lib/locations";
import { OutboxRow } from "../components/OutboxRow";
import { useOutbox } from "../lib/syncQueue";

// What the user has picked for one inbox item so far, before "File" is tapped —
// folder/spot stay editable in the same row instead of requiring a trip into the
// item's own detail page afterwards.
interface FilingDraft {
  locationId: string;
  folderId: string;
  spotId: string;
}

export default function InboxPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [drafts, setDrafts] = useState<Record<string, FilingDraft>>({});
  const [locationContents, setLocationContents] = useState<Record<string, { folders: Folder[]; spots: Spot[] }>>({});
  const [filingError, setFilingError] = useState<string | null>(null);
  const outbox = useOutbox();

  useEffect(() => {
    locationsApi.list().then(setLocations);
  }, []);

  useEffect(() => {
    itemsApi.listInbox().then((inbox) => {
      setItems(inbox);
      // A single-location account has only one sensible choice — preselect it so the
      // folder/spot pickers are visible immediately instead of needing an extra tap.
      if (locations.length === 1) {
        const [only] = locations;
        setDrafts((prev) => {
          const next = { ...prev };
          for (const item of inbox) {
            if (!next[item.id]) next[item.id] = { locationId: only.id, folderId: "", spotId: "" };
          }
          return next;
        });
        loadLocationContents(only.id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outbox, locations]);

  function loadLocationContents(locationId: string) {
    if (locationContents[locationId]) return;
    Promise.all([locationsApi.listFolders(locationId), locationsApi.listSpots(locationId)]).then(
      ([folders, spots]) => setLocationContents((prev) => ({ ...prev, [locationId]: { folders, spots } })),
    );
  }

  function pickLocation(itemId: string, locationId: string) {
    setDrafts((prev) => ({ ...prev, [itemId]: { locationId, folderId: "", spotId: "" } }));
    if (locationId) loadLocationContents(locationId);
  }

  function pickFolder(itemId: string, folderId: string) {
    setDrafts((prev) => ({ ...prev, [itemId]: { ...prev[itemId], folderId } }));
  }

  function pickSpot(itemId: string, spotId: string) {
    setDrafts((prev) => ({ ...prev, [itemId]: { ...prev[itemId], spotId } }));
  }

  async function fileItem(itemId: string) {
    const draft = drafts[itemId];
    if (!draft?.locationId) return;
    setFilingError(null);
    try {
      await itemsApi.file(itemId, {
        locationId: draft.locationId,
        folderId: draft.folderId || null,
        spotId: draft.spotId || null,
      });
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    } catch (err) {
      setFilingError(err instanceof Error ? err.message : "Couldn't file that item — try again.");
    }
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button onClick={() => navigate("/")} style={{ background: "none", border: "none", color: "inherit" }}>
          ← Inbox
        </button>
      </div>
      <div className="screen__content">
        {outbox.map((entry) => (
          <OutboxRow key={entry.localId} entry={entry} />
        ))}
        {items.length === 0 && outbox.length === 0 && <p className="empty-state">Everything's filed. Nice.</p>}
        {filingError && <p className="error">{filingError}</p>}
        {items.map((item) => {
          const draft = drafts[item.id];
          const contents = draft?.locationId ? locationContents[draft.locationId] : undefined;
          return (
            <div key={item.id} className="location-row" style={{ marginBottom: "0.6rem", display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
              {item.thumbnailUrl && (
                <img src={item.thumbnailUrl} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <div>{item.title}</div>
                <select value={draft?.locationId ?? ""} onChange={(e) => pickLocation(item.id, e.target.value)}>
                  <option value="" disabled>
                    File to…
                  </option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
                {draft?.locationId && (
                  <>
                    <select value={draft.folderId} onChange={(e) => pickFolder(item.id, e.target.value)} disabled={!contents}>
                      <option value="">— No folder —</option>
                      {contents?.folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          📁 {folder.name}
                        </option>
                      ))}
                    </select>
                    <select value={draft.spotId} onChange={(e) => pickSpot(item.id, e.target.value)} disabled={!contents}>
                      <option value="">— No spot —</option>
                      {contents?.spots.map((spot) => (
                        <option key={spot.id} value={spot.id}>
                          📍 {spot.name}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => fileItem(item.id)}>File</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
