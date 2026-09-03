import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { itemsApi, type Item } from "../lib/items";
import { locationsApi, type Location } from "../lib/locations";

export default function InboxPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  useEffect(() => {
    itemsApi.listInbox().then(setItems);
    locationsApi.list().then(setLocations);
  }, []);

  async function fileItem(itemId: string, locationId: string) {
    await itemsApi.file(itemId, { locationId });
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button onClick={() => navigate("/")} style={{ background: "none", border: "none", color: "inherit" }}>
          ← Inbox
        </button>
      </div>
      <div className="screen__content">
        {items.length === 0 && <p className="empty-state">Everything's filed. Nice.</p>}
        {items.map((item) => (
          <div key={item.id} className="location-row" style={{ marginBottom: "0.6rem" }}>
            <div style={{ marginBottom: "0.5rem" }}>{item.title}</div>
            {locations.length === 1 ? (
              <button onClick={() => fileItem(item.id, locations[0].id)}>File to {locations[0].name}</button>
            ) : (
              <select defaultValue="" onChange={(e) => e.target.value && fileItem(item.id, e.target.value)}>
                <option value="" disabled>
                  File to…
                </option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
