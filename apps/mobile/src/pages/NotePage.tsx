import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { itemsApi } from "../lib/items";

export default function NotePage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) {
      setError("Give the note a title.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await itemsApi.create({
        type: "NOTE",
        title: title.trim(),
        body: body.trim() || undefined,
        clientCreatedAt: new Date().toISOString(),
      });
      navigate("/inbox");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button onClick={() => navigate("/")} style={{ background: "none", border: "none", color: "inherit" }}>
          ← New note
        </button>
      </div>
      <div className="screen__content">
        <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%", marginBottom: "0.75rem" }} autoFocus />
        <textarea
          placeholder="Details… (attach photos/PDFs after saving)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          style={{ width: "100%", marginBottom: "0.75rem" }}
        />
        {error && <p className="error">{error}</p>}
        <button className="btn-note" style={{ width: "100%", borderRadius: 10, padding: "0.9rem" }} onClick={save} disabled={saving}>
          {saving ? "Saving…" : "✓ Save to Inbox"}
        </button>
      </div>
    </div>
  );
}
