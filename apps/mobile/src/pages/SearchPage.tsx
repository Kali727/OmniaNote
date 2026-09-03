import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { searchApi } from "../lib/search";
import type { Item } from "../lib/items";
import { ItemTile } from "../components/ItemTile";

const DEBOUNCE_MS = 300;

export default function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const thisRequest = ++requestId.current;
      try {
        const hits = await searchApi.search(trimmed);
        if (thisRequest === requestId.current) {
          setResults(hits);
          setError(null);
        }
      } catch (err) {
        if (thisRequest === requestId.current) {
          setError(err instanceof Error ? err.message : "Search failed");
        }
      } finally {
        if (thisRequest === requestId.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  return (
    <div className="screen">
      <div className="topbar">
        <button onClick={() => navigate("/")} style={{ background: "none", border: "none", color: "inherit" }}>
          ← Search
        </button>
      </div>
      <div className="screen__content">
        <input
          placeholder="Search titles and notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: "100%", marginBottom: "1rem" }}
          autoFocus
        />

        {error && <p className="error">{error}</p>}

        {!query.trim() && !error && <p className="empty-state">Search across every note and photo title.</p>}

        {query.trim() && !loading && results.length === 0 && !error && (
          <p className="empty-state">No matches for "{query.trim()}".</p>
        )}

        {results.length > 0 && (
          <div className="item-grid">
            {results.map((item) => (
              <ItemTile key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
