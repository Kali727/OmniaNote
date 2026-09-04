import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { teamApi, type InvitePreview } from "../lib/team";
import { tokenStore } from "../lib/tokenStore";

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    teamApi
      .previewInvite(token)
      .then(setPreview)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "This invite couldn't be found."));
  }, [token]);

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const tokens = await teamApi.acceptInvite(token, { username, password, mobileNumber });
      await tokenStore.setTokens(tokens.accessToken, tokens.refreshToken);
      navigate("/");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Couldn't accept that invite.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen">
      <div className="screen__content">
        <h1>Join the team</h1>

        {loadError && <p className="error">{loadError}</p>}

        {!preview && !loadError && <p className="empty-state">Loading invite…</p>}

        {preview && (
          <>
            <p className="empty-state">
              <strong>{preview.inviterName}</strong> invited <strong>{preview.email}</strong> to join{" "}
              <strong>{preview.accountName}</strong> as {preview.role.toLowerCase()}.
            </p>
            <form className="form" onSubmit={accept}>
              <input
                placeholder="Choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoCapitalize="none"
              />
              <input
                placeholder="Mobile number"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                inputMode="tel"
              />
              <input
                type="password"
                placeholder="Password (10+ characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {submitError && <p className="error">{submitError}</p>}
              <button type="submit" disabled={submitting}>
                {submitting ? "Joining…" : `Join ${preview.accountName}`}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
