import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { itemsApi, type Item } from "../lib/items";
import { locationsApi, type Folder } from "../lib/locations";
import { ItemTile } from "../components/ItemTile";

export default function LocationPage() {
  const { locationId } = useParams<{ locationId: string }>();
  const navigate = useNavigate();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    if (!locationId) return;
    locationsApi.listFolders(locationId).then((all) => setFolders(all.filter((f) => !f.parentFolderId)));
    itemsApi.listByFolder(locationId).then(setItems);
  }, [locationId]);

  return (
    <div className="screen">
      <div className="topbar">
        <button onClick={() => navigate("/")} style={{ background: "none", border: "none", color: "inherit" }}>
          ← Location
        </button>
      </div>
      <div className="screen__content">
        <div className="section-title">Folders</div>
        {folders.length === 0 ? (
          <p className="empty-state">No folders yet.</p>
        ) : (
          <div className="item-grid">
            {folders.map((folder) => (
              <div key={folder.id} className="item-tile">
                📁 {folder.name}
              </div>
            ))}
          </div>
        )}

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
