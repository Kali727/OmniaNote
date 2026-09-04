import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { itemsApi, type Item } from "../lib/items";
import { locationsApi, type Location } from "../lib/locations";
import { ItemTile } from "../components/ItemTile";
import { OutboxRow } from "../components/OutboxRow";
import { useOutbox } from "../lib/syncQueue";
import { useOnlineStatus } from "../lib/network";

export default function HomePage() {
  const navigate = useNavigate();
  const [recent, setRecent] = useState<Item[]>([]);
  const [favorites, setFavorites] = useState<Item[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [inboxCount, setInboxCount] = useState(0);
  const [newLocationName, setNewLocationName] = useState("");
  const [addingLocation, setAddingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const outbox = useOutbox();
  const online = useOnlineStatus();

  useEffect(() => {
    locationsApi.list().then(setLocations).catch(() => {});
  }, []);

  useEffect(() => {
    // Refetch whenever the outbox changes — a queued capture reaching the
    // server (or a status flip in between) is exactly when the "real" server
    // copy should start appearing here instead of the local placeholder.
    itemsApi.listRecent().then(setRecent).catch(() => {});
    itemsApi.listFavorites().then(setFavorites).catch(() => {});
    itemsApi.listInbox().then((inbox) => setInboxCount(inbox.length)).catch(() => {});
  }, [outbox]);

  async function addLocation(e: FormEvent) {
    e.preventDefault();
    const name = newLocationName.trim();
    if (!name) return;
    setAddingLocation(true);
    setLocationError(null);
    try {
      const location = await locationsApi.create({ name });
      setLocations((prev) => [...prev, location]);
      setNewLocationName("");
    } catch (err) {
      setLocationError(err instanceof Error ? err.message : "Couldn't add that location.");
    } finally {
      setAddingLocation(false);
    }
  }

  return (
    <div className="screen">
      <div className="topbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>OmniaNote</span>
        <div style={{ display: "flex", gap: "0.9rem" }}>
          <button onClick={() => navigate("/search")} style={{ background: "none", border: "none", color: "inherit", fontSize: "1.1rem" }} aria-label="Search">
            🔍
          </button>
          <button onClick={() => navigate("/settings")} style={{ background: "none", border: "none", color: "inherit", fontSize: "1.1rem" }} aria-label="Settings">
            ⚙️
          </button>
        </div>
      </div>
      <div className="screen__content">
        {!online && (
          <div className="offline-banner">
            📴 You're offline — captures are saved on this device and will sync automatically once
            you're back online.
          </div>
        )}

        {outbox.length > 0 && (
          <>
            <div className="section-title">Syncing</div>
            {outbox.map((entry) => (
              <OutboxRow key={entry.localId} entry={entry} />
            ))}
          </>
        )}

        {inboxCount > 0 && (
          <p className="empty-state">
            {inboxCount} item{inboxCount === 1 ? "" : "s"} waiting to be filed —{" "}
            <Link to="/inbox">sort now</Link>
          </p>
        )}

        <div className="section-title">Locations</div>
        {locations.length > 0 && (
          <div className="location-list" style={{ marginBottom: "0.75rem" }}>
            {locations.map((loc) => (
              <div key={loc.id} className="location-row" onClick={() => navigate(`/locations/${loc.id}`)}>
                {loc.name}
              </div>
            ))}
          </div>
        )}
        <form onSubmit={addLocation} style={{ display: "flex", gap: "0.5rem" }}>
          <input
            placeholder="e.g. Main Building"
            value={newLocationName}
            onChange={(e) => setNewLocationName(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={addingLocation || !newLocationName.trim()}>
            Add
          </button>
        </form>
        {locationError && <p className="error">{locationError}</p>}

        <div className="section-title">Favorites</div>
        {favorites.length === 0 ? (
          <p className="empty-state">Nothing pinned yet. Long-press an item to favorite it.</p>
        ) : (
          <div className="item-grid">
            {favorites.map((item) => (
              <ItemTile key={item.id} item={item} />
            ))}
          </div>
        )}

        <div className="section-title">Recent</div>
        {recent.length === 0 ? (
          <p className="empty-state">Nothing captured yet — tap Photo or Note below to start.</p>
        ) : (
          <div className="item-grid">
            {recent.map((item) => (
              <ItemTile key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      <div className="capture-bar">
        <button className="btn-photo" onClick={() => navigate("/capture")}>
          📷 Photo
        </button>
        <button className="btn-note" onClick={() => navigate("/note/new")}>
          📝 Note
        </button>
      </div>
    </div>
  );
}
