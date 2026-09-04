import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { itemsApi, type Item } from "../lib/items";
import { locationsApi, type Folder } from "../lib/locations";
import { ItemTile } from "../components/ItemTile";

export default function FolderPage() {
  const { locationId, folderId } = useParams<{ locationId: string; folderId: string }>();
  const navigate = useNavigate();
  const [allFolders, setAllFolders] = useState<Folder[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [newFolderName, setNewFolderName] = useState("");
  const [addingFolder, setAddingFolder] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);

  useEffect(() => {
    if (!locationId || !folderId) return;
    locationsApi.listFolders(locationId).then(setAllFolders);
    itemsApi.listByFolder(locationId, folderId).then(setItems);
  }, [locationId, folderId]);

  const folder = allFolders.find((f) => f.id === folderId);
  const subfolders = allFolders.filter((f) => f.parentFolderId === folderId);

  async function addFolder(e: FormEvent) {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name || !locationId || !folderId) return;
    setAddingFolder(true);
    setFolderError(null);
    try {
      const created = await locationsApi.createFolder({ locationId, name, parentFolderId: folderId });
      setAllFolders((prev) => [...prev, created]);
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
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "inherit" }}>
          ← {folder?.name ?? "Folder"}
        </button>
      </div>
      <div className="screen__content">
        <div className="section-title">Subfolders</div>
        {subfolders.length > 0 && (
          <div className="item-grid" style={{ marginBottom: "0.75rem" }}>
            {subfolders.map((sub) => (
              <div
                key={sub.id}
                className="item-tile"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.85rem", padding: "0.5rem", textAlign: "center" }}
                onClick={() => navigate(`/locations/${locationId}/folders/${sub.id}`)}
              >
                📁 {sub.name}
              </div>
            ))}
          </div>
        )}
        <form onSubmit={addFolder} style={{ display: "flex", gap: "0.5rem" }}>
          <input
            placeholder="e.g. Linens"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={addingFolder || !newFolderName.trim()}>
            Add
          </button>
        </form>
        {folderError && <p className="error">{folderError}</p>}

        <div className="section-title">Items</div>
        {items.length === 0 ? (
          <p className="empty-state">Nothing filed directly in this folder yet.</p>
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
