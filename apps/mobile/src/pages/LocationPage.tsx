import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { itemsApi, type Item } from "../lib/items";
import { locationsApi, type Folder, type Location, type Spot } from "../lib/locations";
import { ItemTile } from "../components/ItemTile";

export default function LocationPage() {
  const { locationId } = useParams<{ locationId: string }>();
  const navigate = useNavigate();
  const [location, setLocation] = useState<Location | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [newSpotName, setNewSpotName] = useState("");
  const [addingSpot, setAddingSpot] = useState(false);
  const [spotError, setSpotError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [addingFolder, setAddingFolder] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);

  useEffect(() => {
    if (!locationId) return;
    locationsApi.list().then((all) => setLocation(all.find((l) => l.id === locationId) ?? null));
    locationsApi.listFolders(locationId).then((all) => setFolders(all.filter((f) => !f.parentFolderId)));
    locationsApi.listSpots(locationId).then(setSpots);
    itemsApi.listByFolder(locationId).then(setItems);
  }, [locationId]);

  async function addSpot(e: FormEvent) {
    e.preventDefault();
    const name = newSpotName.trim();
    if (!name || !locationId) return;
    setAddingSpot(true);
    setSpotError(null);
    try {
      const spot = await locationsApi.createSpot({ locationId, name });
      setSpots((prev) => [...prev, spot].sort((a, b) => a.name.localeCompare(b.name)));
      setNewSpotName("");
    } catch (err) {
      setSpotError(err instanceof Error ? err.message : "Couldn't add that spot.");
    } finally {
      setAddingSpot(false);
    }
  }

  async function addFolder(e: FormEvent) {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name || !locationId) return;
    setAddingFolder(true);
    setFolderError(null);
    try {
      const folder = await locationsApi.createFolder({ locationId, name });
      setFolders((prev) => [...prev, folder].sort((a, b) => a.name.localeCompare(b.name)));
      setNewFolderName("");
    } catch (err) {
      setFolderError(err instanceof Error ? err.message : "Couldn't add that folder.");
    } finally {
      setAddingFolder(false);
    }
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button onClick={() => navigate("/")} style={{ background: "none", border: "none", color: "inherit" }}>
          ← {location?.name ?? "Location"}
        </button>
      </div>
      <div className="screen__content">
        <div className="section-title">Spots</div>
        <p className="empty-state" style={{ marginTop: "-0.4rem" }}>
          Recurring assets or fixtures — track a spot's full maintenance history over time.
        </p>
        {spots.length > 0 && (
          <div className="location-list" style={{ marginBottom: "0.75rem" }}>
            {spots.map((spot) => (
              <div key={spot.id} className="location-row" onClick={() => navigate(`/spots/${spot.id}`)}>
                📍 {spot.name}
              </div>
            ))}
          </div>
        )}
        <form onSubmit={addSpot} style={{ display: "flex", gap: "0.5rem" }}>
          <input
            placeholder="e.g. AC Unit, Room 312"
            value={newSpotName}
            onChange={(e) => setNewSpotName(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={addingSpot || !newSpotName.trim()}>
            Add
          </button>
        </form>
        {spotError && <p className="error">{spotError}</p>}

        <div className="section-title">Folders</div>
        <p className="empty-state" style={{ marginTop: "-0.4rem" }}>
          Organize items into folders and subfolders — tap one to open it.
        </p>
        {folders.length > 0 && (
          <div className="item-grid" style={{ marginBottom: "0.75rem" }}>
            {folders.map((folder) => (
              <div
                key={folder.id}
                className="item-tile"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.85rem", padding: "0.5rem", textAlign: "center" }}
                onClick={() => navigate(`/locations/${locationId}/folders/${folder.id}`)}
              >
                📁 {folder.name}
              </div>
            ))}
          </div>
        )}
        <form onSubmit={addFolder} style={{ display: "flex", gap: "0.5rem" }}>
          <input
            placeholder="e.g. Housekeeping Supplies"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={addingFolder || !newFolderName.trim()}>
            Add
          </button>
        </form>
        {folderError && <p className="error">{folderError}</p>}

        <div className="section-title">Loose items</div>
        {items.length === 0 ? (
          <p className="empty-state">Nothing filed directly at this location yet.</p>
        ) : (
          <div className="item-grid">
            {items.map((item) => (
              <ItemTile key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
