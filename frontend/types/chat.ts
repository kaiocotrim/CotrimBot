// Tipos compartilhados pelos componentes, pelo hook e pelo cliente HTTP.
export type Contact = {
  id: number;
  name: string;
  phone: string;
  profilePictureUrl?: string | null;
};

export type Message = {
  id: number;
  externalId: string;
  content: string;
  direction: "INCOMING" | "OUTGOING";
  contactId: number;
  createdAt: string;
};

export type ContactAvatar = {
  profilePictureUrl: string | null;
};
