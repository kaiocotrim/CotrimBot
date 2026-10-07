import type { CompanyWorkspace, GroupInput, MemberProfileInput } from "@/components/admin/company-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? "Não foi possível concluir a operação.");
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function organizationPath(organizationId: string): string {
  return `/organizations/${encodeURIComponent(organizationId)}`;
}

export function getCompanyWorkspace(organizationId: string): Promise<CompanyWorkspace> {
  return apiRequest(`${organizationPath(organizationId)}/workspace`);
}

export function createCompanyGroup(organizationId: string, input: GroupInput): Promise<{ id: string }> {
  return apiRequest(`${organizationPath(organizationId)}/groups`, { method: "POST", body: JSON.stringify(input) });
}

export function updateCompanyGroup(organizationId: string, groupId: string, input: GroupInput): Promise<{ success: true }> {
  return apiRequest(`${organizationPath(organizationId)}/groups/${encodeURIComponent(groupId)}`, { method: "PUT", body: JSON.stringify(input) });
}

export function deleteCompanyGroup(organizationId: string, groupId: string): Promise<void> {
  return apiRequest(`${organizationPath(organizationId)}/groups/${encodeURIComponent(groupId)}`, { method: "DELETE" });
}

export function updateCompanyMemberProfile(organizationId: string, memberId: string, input: MemberProfileInput): Promise<{ success: true }> {
  return apiRequest(`${organizationPath(organizationId)}/members/${encodeURIComponent(memberId)}/profile`, { method: "PATCH", body: JSON.stringify(input) });
}
