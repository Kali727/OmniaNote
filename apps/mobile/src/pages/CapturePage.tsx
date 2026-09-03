import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { itemsApi } from "../lib/items";

export default function CapturePage() {
  const navigate = useNavigate();
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function takePhoto() {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      quality: 85,
    });
    if (!photo.webPath) return;
    const blob = await fetch(photo.webPath).then((r) => r.blob());
    setPhotoBlob(blob);
    setPhotoPreview(photo.webPath);
  }

  async function save() {
    if (!photoBlob || !title.trim()) {
      setError("Take a photo and give it a title first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await itemsApi.captureMedia("PHOTO", title.trim(), photoBlob, "jpg", "image/jpeg");
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
          ← New photo
        </button>
      </div>
      <div className="screen__content">
        {!photoPreview ? (
          <button className="btn-photo" style={{ width: "100%", padding: "2rem", borderRadius: 12, border: "none" }} onClick={takePhoto}>
            📷 Open camera
          </button>
        ) : (
          <>
            <img src={photoPreview} alt="Captured" style={{ width: "100%", borderRadius: 12, marginBottom: "1rem" }} />
            <input
              placeholder="e.g. stained carpet, room 312"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ width: "100%", marginBottom: "0.75rem" }}
              autoFocus
            />
            {error && <p className="error">{error}</p>}
            <button className="btn-photo" style={{ width: "100%", border: "none", borderRadius: 10, padding: "0.9rem" }} onClick={save} disabled={saving}>
              {saving ? "Saving…" : "✓ Save to Inbox"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
