import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { auth } from "../lib/auth";

interface ChallengeState {
  challengeToken: string;
  method: "TOTP" | "SMS" | "EMAIL";
}

export default function MfaChallengePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as ChallengeState | undefined;
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!state) {
    navigate("/login", { replace: true });
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await auth.verifyMfaChallenge(state!.challengeToken, code);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect code");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen">
      <div className="screen__content">
        <h1>Verify it's you</h1>
        <p className="empty-state">
          {state.method === "TOTP"
            ? "Enter the 6-digit code from your authenticator app."
            : `Enter the 6-digit code sent to your ${state.method === "EMAIL" ? "email" : "phone"}.`}
        </p>
        <form className="form" onSubmit={onSubmit}>
          <input
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            maxLength={6}
            autoFocus
          />
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? "Verifying…" : "Verify"}
          </button>
        </form>
      </div>
    </div>
  );
}
