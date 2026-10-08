export const permissionSections = [
  {
    label: "Conversas",
    permissions: [
      ["CONVERSATIONS_VIEW", "Visualizar conversas"],
      ["CONVERSATIONS_REPLY", "Responder mensagens"],
      ["CONVERSATIONS_START", "Enviar novas mensagens"],
      ["CONVERSATIONS_CLOSE", "Encerrar conversas"],
      ["CONVERSATIONS_REOPEN", "Reabrir conversas"],
      ["CONVERSATIONS_FORWARD", "Encaminhar mensagens"],
      ["MESSAGES_DELETE", "Excluir mensagens"],
    ],
  },
  {
    label: "Contatos",
    permissions: [
      ["CONTACTS_VIEW", "Visualizar contatos"],
      ["CONTACTS_CREATE", "Criar contatos"],
      ["CONTACTS_EDIT", "Editar contatos"],
      ["CONTACTS_DELETE", "Excluir contatos"],
    ],
  },
  {
    label: "Grupos e empresa",
    permissions: [
      ["COMPANY_MEMBERS_VIEW", "Visualizar usuários da empresa"],
      ["COMPANY_MEMBERS_INVITE", "Convidar usuários"],
      ["COMPANY_MEMBERS_EDIT", "Editar usuários"],
      ["COMPANY_GROUPS_CREATE", "Criar grupos"],
      ["COMPANY_GROUPS_EDIT", "Editar grupos"],
      ["COMPANY_GROUPS_DELETE", "Excluir grupos"],
    ],
  },
  {
    label: "Configurações",
    permissions: [
      ["SETTINGS_ACCESS", "Acessar configurações"],
      ["SETTINGS_WHATSAPP_MANAGE", "Configurar WhatsApp"],
      ["SETTINGS_COMPANY_MANAGE", "Gerenciar empresa"],
    ],
  },
] as const;

export type PermissionKey = typeof permissionSections[number]["permissions"][number][0];

export const permissionLabels = Object.fromEntries(
  permissionSections.flatMap<readonly [PermissionKey, string]>((section) => section.permissions),
) as Record<PermissionKey, string>;

export type OrganizationSummary = { id: string; name: string; slug: string; logo?: string | null };

export type OrganizationMember = {
  id: string;
  userId: string;
  role: "owner" | "admin" | "member";
  jobTitle?: string | null;
  displayName?: string | null;
  signature?: string | null;
  signatureEnabled: boolean;
  user: { id: string; name: string; email: string; image?: string | null };
  groups: { id: string; name: string }[];
  effectivePermissions: PermissionKey[];
};

export type CompanyGroup = {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  memberIds: string[];
  permissions: PermissionKey[];
};

export type CompanyWorkspace = {
  currentRole: OrganizationMember["role"];
  canManage: boolean;
  allPermissions: PermissionKey[];
  members: OrganizationMember[];
  groups: CompanyGroup[];
};

export type GroupInput = {
  name: string;
  description: string;
  memberIds: string[];
  permissions: PermissionKey[];
};

export type MemberProfileInput = {
  displayName: string;
  jobTitle: string;
  signature: string;
  signatureEnabled: boolean;
};
