import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { itemsApi, type Item } from "../lib/items";
import { locationsApi, type Location } from "../lib/locations";
import { ItemTile } from "../components/ItemTile";

export default function HomePage() {
  const navigate = useNavigate();
  const [recent, setRecent] = useState<Item[]>([]);
  const [favorites, setFavorites] = useState<Item[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [inboxCount, setInboxCount] = useState(0);

  useEffect(() => {
    itemsApi.listRecent().then(setRecent).catch(() => {});
    itemsApi.listFavorites().then(setFavorites).catch(() => {});
    itemsApi.listInbox().then((inbox) => setInboxCount(inbox.length)).catch(() => {});
    locationsApi.list().then(setLocations).catch(() => {});
  }, []);

  return (
    <div className="screen">
      <div className="topbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>OmniaNote</span>
        <button onClick={() => navigate("/settings")} style={{ background: "none", border: "none", color: "inherit", fontSize: "1.1rem" }} aria-label="Settings">
          ⚙️
        </button>
      </div>
      <div className="screen__content">
        {inboxCount > 0 && (
          <p className="empty-state">
            {inboxCount} item{inboxCount === 1 ? "" : "s"} waiting to be filed —{" "}
            <Link to="/inbox">sort now</Link>
          </p>
        )}

        {locations.length > 1 && (
          <>
            <div className="section-title">Locations</div>
            <div className="location-list">
              {locations.map((loc) => (
                <div key={loc.id} className="location-row" onClick={() => navigate(`/locations/${loc.id}`)}>
                  {loc.name}
                </div>
              ))}
            </div>
          </>
        )}

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
