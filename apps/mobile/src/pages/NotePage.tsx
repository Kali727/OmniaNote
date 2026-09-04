import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { syncQueue } from "../lib/syncQueue";
import { useDictation } from "../lib/dictation";

export default function NotePage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appendDictatedText = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBody((prev) => (prev && !prev.endsWith("\n") ? `${prev} ${trimmed}` : `${prev}${trimmed}`));
  }, []);
  const dictation = useDictation(appendDictatedText);

  async function save() {
    if (!title.trim()) {
      setError("Give the note a title.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await syncQueue.enqueue({
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
        <div style={{ position: "relative", marginBottom: "0.75rem" }}>
          <textarea
            placeholder="Details… (attach photos/PDFs after saving)"
            value={dictation.listening ? `${body}${dictation.interimText ? (body ? " " : "") + dictation.interimText : ""}` : body}
            onChange={(e) => setBody(e.target.value)}
            readOnly={dictation.listening}
            rows={8}
            style={{ width: "100%" }}
          />
          {dictation.supported && (
            <button
              type="button"
              onClick={dictation.listening ? dictation.stop : dictation.start}
              aria-label={dictation.listening ? "Stop dictation" : "Start dictation"}
              className={dictation.listening ? "mic-btn mic-btn--active" : "mic-btn"}
            >
              {dictation.listening ? "⏹" : "🎤"}
            </button>
          )}
        </div>
        {dictation.listening && <p className="empty-state" style={{ marginTop: "-0.5rem" }}>Listening…</p>}
        {dictation.error && <p className="error">{dictation.error}</p>}
        {error && <p className="error">{error}</p>}
        <button
          className="btn-note"
          style={{ width: "100%", borderRadius: 10, padding: "0.9rem" }}
          onClick={save}
          disabled={saving || dictation.listening}
        >
          {saving ? "Saving…" : dictation.listening ? "Stop dictation to save" : "✓ Save to Inbox"}
        </button>
      </div>
    </div>
  );
}
