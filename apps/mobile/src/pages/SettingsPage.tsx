import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { mfaApi, type Profile } from "../lib/mfa";

type Step =
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "overview" }
  | { name: "choose" }
  | { name: "totp-verify"; qrCodeDataUrl: string; secret: string }
  | { name: "email-verify" }
  | { name: "backup-codes"; codes: string[]; method: "TOTP" | "EMAIL" };

export default function SettingsPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [step, setStep] = useState<Step>({ name: "loading" });
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    mfaApi
      .getProfile()
      .then((p) => {
        setProfile(p);
        setStep({ name: "overview" });
      })
      .catch((err) => setStep({ name: "error", message: err instanceof Error ? err.message : "Failed to load" }));
  }, []);

  async function beginTotp() {
    setFormError(null);
    try {
      const { qrCodeDataUrl, secret } = await mfaApi.startTotpEnroll();
      setStep({ name: "totp-verify", qrCodeDataUrl, secret });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't start enrollment");
    }
  }

  async function beginEmail() {
    setFormError(null);
    try {
      await mfaApi.startEmailEnroll();
      setStep({ name: "email-verify" });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't send the code");
    }
  }

  async function submitCode() {
    if (step.name !== "totp-verify" && step.name !== "email-verify") return;
    setSubmitting(true);
    setFormError(null);
    try {
      const method = step.name === "totp-verify" ? "TOTP" : "EMAIL";
      const { backupCodes } =
        method === "TOTP" ? await mfaApi.confirmTotpEnroll(code) : await mfaApi.confirmEmailEnroll(code);
      setStep({ name: "backup-codes", codes: backupCodes, method });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Incorrect code");
    } finally {
      setSubmitting(false);
    }
  }

  function finishBackupCodes() {
    if (profile && step.name === "backup-codes") {
      setProfile({ ...profile, mfaEnabled: true, mfaPreferred: step.method });
    }
    setCode("");
    setStep({ name: "overview" });
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button onClick={() => navigate("/")} style={{ background: "none", border: "none", color: "inherit" }}>
          ← Security
        </button>
      </div>
      <div className="screen__content">
        {step.name === "loading" && <p className="empty-state">Loading…</p>}

        {step.name === "error" && <p className="error">{step.message}</p>}

        {step.name === "overview" && profile && (
          <>
            <div className="section-title">Two-factor authentication</div>
            {profile.mfaEnabled ? (
              <p className="empty-state">
                Enabled via {profile.mfaPreferred === "TOTP" ? "authenticator app" : "email codes"}.
              </p>
            ) : (
              <>
                <p className="empty-state">
                  Not enabled yet. Add a second step at login so a leaked password alone isn't enough to get in.
                </p>
                <button className="btn-note" style={{ width: "100%", borderRadius: 10, padding: "0.9rem", marginBottom: "0.6rem" }} onClick={() => setStep({ name: "choose" })}>
                  Set up two-factor authentication
                </button>
              </>
            )}
          </>
        )}

        {step.name === "choose" && (
          <>
            <div className="section-title">Choose a method</div>
            {formError && <p className="error">{formError}</p>}
            <div className="location-row" style={{ marginBottom: "0.6rem", cursor: "pointer" }} onClick={beginTotp}>
              <strong>Authenticator app</strong>
              <div style={{ fontSize: "0.85rem", color: "var(--ink-soft)", marginTop: "0.2rem" }}>
                Works offline. Needs an app like Google Authenticator or 1Password.
              </div>
            </div>
            <div className="location-row" style={{ cursor: "pointer" }} onClick={beginEmail}>
              <strong>Email codes</strong>
              <div style={{ fontSize: "0.85rem", color: "var(--ink-soft)", marginTop: "0.2rem" }}>
                We'll send a 6-digit code to your account email each time you sign in.
              </div>
            </div>
          </>
        )}

        {step.name === "totp-verify" && (
          <>
            <div className="section-title">Scan this with your authenticator app</div>
            <img src={step.qrCodeDataUrl} alt="TOTP QR code" style={{ width: 200, height: 200, background: "#fff", padding: 8, borderRadius: 8 }} />
            <p className="empty-state">
              Can't scan? Enter this key manually: <code>{step.secret}</code>
            </p>
            <input
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              style={{ width: "100%", marginBottom: "0.75rem" }}
              autoFocus
            />
            {formError && <p className="error">{formError}</p>}
            <button className="btn-note" style={{ width: "100%", borderRadius: 10, padding: "0.9rem" }} onClick={submitCode} disabled={submitting || code.length !== 6}>
              {submitting ? "Verifying…" : "Verify and enable"}
            </button>
          </>
        )}

        {step.name === "email-verify" && (
          <>
            <div className="section-title">Check your email</div>
            <p className="empty-state">Enter the 6-digit code we just sent to {profile?.email}.</p>
            <input
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              style={{ width: "100%", marginBottom: "0.75rem" }}
              autoFocus
            />
            {formError && <p className="error">{formError}</p>}
            <button className="btn-note" style={{ width: "100%", borderRadius: 10, padding: "0.9rem" }} onClick={submitCode} disabled={submitting || code.length !== 6}>
              {submitting ? "Verifying…" : "Verify and enable"}
            </button>
          </>
        )}

        {step.name === "backup-codes" && (
          <>
            <div className="section-title">Save your backup codes</div>
            <p className="empty-state">
              Each one lets you sign in once if you lose access to your {step.method === "EMAIL" ? "email" : "authenticator app"}.
              They're shown only this once — save them somewhere safe now.
            </p>
            <div className="location-row" style={{ fontFamily: "monospace", lineHeight: 1.8, marginBottom: "1rem" }}>
              {step.codes.map((c) => (
                <div key={c}>{c}</div>
              ))}
            </div>
            <button className="btn-note" style={{ width: "100%", borderRadius: 10, padding: "0.9rem" }} onClick={finishBackupCodes}>
              I've saved these
            </button>
          </>
        )}
      </div>
    </div>
  );
}
