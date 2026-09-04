import type { AccountRole, AccountTier, InviteTeammateInput } from "@omnianote/shared";
import { apiFetch } from "./apiClient";

export interface TeamMember {
  id: string;
  username: string;
  email: string;
  role: AccountRole;
  createdAt: string;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: AccountRole;
  expiresAt: string;
  createdAt: string;
}

export interface TeamOverview {
  accountName: string;
  tier: AccountTier;
  maxTeamMembers: number | null;
  members: TeamMember[];
  invites: PendingInvite[];
}

export interface InvitePreview {
  email: string;
  role: AccountRole;
  accountName: string;
  inviterName: string;
}

export const teamApi = {
  list: () => apiFetch<TeamOverview>("/team/members"),

  updateAccountName: (name: string) =>
    apiFetch<{ name: string }>("/team/account-name", { method: "PATCH", body: JSON.stringify({ name }) }),

  invite: (input: InviteTeammateInput) =>
    apiFetch<PendingInvite>("/team/invites", { method: "POST", body: JSON.stringify(input) }),

  revokeInvite: (id: string) => apiFetch<void>(`/team/invites/${id}`, { method: "DELETE" }),

  removeMember: (userId: string) => apiFetch<void>(`/team/members/${userId}`, { method: "DELETE" }),

  updateMemberRole: (userId: string, role: AccountRole) =>
    apiFetch<TeamMember>(`/team/members/${userId}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),

  // Public — no auth token exists yet for the invitee.
  previewInvite: (token: string) => apiFetch<InvitePreview>(`/team/invites/${token}`),

  acceptInvite: (token: string, input: { username: string; password: string; mobileNumber: string }) =>
    apiFetch<{ accessToken: string; refreshToken: string }>(`/team/invites/${token}/accept`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
