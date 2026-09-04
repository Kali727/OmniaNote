import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { AccountRole } from "@omnianote/shared";
import { teamApi, type TeamOverview } from "../lib/team";
import { mfaApi, type Profile } from "../lib/mfa";

const ROLES: AccountRole[] = ["OWNER", "ADMIN", "MEMBER"];

export default function TeamPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [team, setTeam] = useState<TeamOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AccountRole>("MEMBER");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSent, setInviteSent] = useState(false);

  async function refresh() {
    const [p, t] = await Promise.all([mfaApi.getProfile(), teamApi.list()]);
    setProfile(p);
    setTeam(t);
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load your team"))
      .finally(() => setLoading(false));
  }, []);

  const canManage = profile?.role === "OWNER" || profile?.role === "ADMIN";
  const isOwner = profile?.role === "OWNER";
  const atLimit = team && team.maxTeamMembers !== null && team.members.length + team.invites.length >= team.maxTeamMembers;

  async function saveAccountName(e: FormEvent) {
    e.preventDefault();
    const name = nameDraft.trim();
    if (!name) return;
    setSavingName(true);
    try {
      await teamApi.updateAccountName(name);
      setTeam((prev) => (prev ? { ...prev, accountName: name } : prev));
      setEditingName(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't rename the team");
    } finally {
      setSavingName(false);
    }
  }

  async function sendInvite(e: FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    setInviting(true);
    setInviteError(null);
    setInviteSent(false);
    try {
      await teamApi.invite({ email, role: inviteRole });
      setInviteEmail("");
      setInviteSent(true);
      await refresh();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Couldn't send that invite");
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(userId: string, role: AccountRole) {
    setError(null);
    try {
      await teamApi.updateMemberRole(userId, role);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change that role");
    }
  }

  async function removeMember(userId: string) {
    setError(null);
    try {
      await teamApi.removeMember(userId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove that member");
    }
  }

  async function revokeInvite(id: string) {
    setError(null);
    try {
      await teamApi.revokeInvite(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't revoke that invite");
    }
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button onClick={() => navigate("/settings")} style={{ background: "none", border: "none", color: "inherit" }}>
          ← Team
        </button>
      </div>
      <div className="screen__content">
        {loading && <p className="empty-state">Loading…</p>}
        {error && <p className="error">{error}</p>}

        {team && profile && (
          <>
            {editingName ? (
              <form onSubmit={saveAccountName} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.4rem" }}>
                <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} style={{ flex: 1 }} autoFocus />
                <button type="submit" disabled={savingName || !nameDraft.trim()}>
                  Save
                </button>
              </form>
            ) : (
              <h1
                style={{ margin: "0 0 0.4rem", cursor: isOwner ? "pointer" : "default" }}
                onClick={() => {
                  if (!isOwner) return;
                  setNameDraft(team.accountName);
                  setEditingName(true);
                }}
                title={isOwner ? "Tap to rename" : undefined}
              >
                {team.accountName}
                {isOwner && <span style={{ fontSize: "0.7rem", color: "var(--ink-soft)", marginLeft: "0.5rem" }}>✏️</span>}
              </h1>
            )}
            <p className="empty-state" style={{ marginTop: 0 }}>
              {team.tier} plan — {team.members.length + team.invites.length}
              {team.maxTeamMembers !== null ? ` of ${team.maxTeamMembers}` : ""} team members
            </p>

            <div className="section-title">Members</div>
            <div className="location-list" style={{ marginBottom: "1rem" }}>
              {team.members.map((member) => {
                const isMe = member.id === profile.id;
                const canRemove = canManage && !isMe && (isOwner || member.role === "MEMBER");
                return (
                  <div key={member.id} className="location-row" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {member.username}
                        {isMe && <span style={{ color: "var(--ink-soft)" }}> (you)</span>}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>{member.email}</div>
                    </div>
                    {isOwner && !isMe ? (
                      <select value={member.role} onChange={(e) => changeRole(member.id, e.target.value as AccountRole)}>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>{member.role}</span>
                    )}
                    {canRemove && (
                      <button onClick={() => removeMember(member.id)} style={{ background: "none", border: "none", color: "var(--danger)" }}>
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {team.invites.length > 0 && (
              <>
                <div className="section-title">Pending invites</div>
                <div className="location-list" style={{ marginBottom: "1rem" }}>
                  {team.invites.map((invite) => (
                    <div key={invite.id} className="location-row" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{invite.email}</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>
                          {invite.role} — expires {new Date(invite.expiresAt).toLocaleDateString()}
                        </div>
                      </div>
                      {canManage && (
                        <button onClick={() => revokeInvite(invite.id)} style={{ background: "none", border: "none", color: "var(--danger)" }}>
                          Revoke
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {canManage && (
              <>
                <div className="section-title">Invite a teammate</div>
                {atLimit ? (
                  <p className="empty-state">
                    Your {team.tier} plan is at its team member limit — upgrade to invite more people.
                  </p>
                ) : (
                  <form onSubmit={sendInvite} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <input
                      placeholder="teammate@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      autoCapitalize="none"
                      style={{ flex: "1 1 200px" }}
                    />
                    <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as AccountRole)}>
                      {ROLES.filter((r) => r !== "OWNER").map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button type="submit" disabled={inviting || !inviteEmail.trim()}>
                      {inviting ? "Sending…" : "Invite"}
                    </button>
                  </form>
                )}
                {inviteError && <p className="error">{inviteError}</p>}
                {inviteSent && !inviteError && <p className="empty-state">Invite sent.</p>}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
