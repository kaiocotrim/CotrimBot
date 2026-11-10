export type Session = {
  user: { id: string; name: string; email: string; image?: string | null };
  session: { id: string; activeOrganizationId?: string | null };
};

export type Message = {
  id: number;
  contactId: number;
  content: string;
  direction: 'INCOMING' | 'OUTGOING';
  type: string;
  createdAt: string;
  deletedAt?: string | null;
  private?: boolean;
  senderName?: string | null;
  senderProfilePictureUrl?: string | null;
  sentByUserId?: string | null;
  sentByUser?: { id: string; name: string; image: string | null } | null;
  readAt?: string | null;
  reaction?: string | null;
  pinned?: boolean;
  pinnedUntil?: string | null;
  favorited?: boolean;
  poll?: { question: string; options: string[]; selectableCount: number } | null;
  quotedMessageId?: number | null;
  quotedContent?: string | null;
  quotedSenderName?: string | null;
};

export type Contact = {
  id: number;
  name: string;
  phone: string;
  isGroup: boolean;
  archived: boolean;
  pinned?: boolean;
  assignedUserIds?: string[];
  companyName?: string | null;
  jobTitle?: string | null;
  priority?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  unreadCount: number;
  favoriteMessageCount?: number;
  profilePictureUrl?: string | null;
  messages?: Message[];
};

export type MessagesPage = { messages: Message[]; hasMore: boolean; nextCursor: number | null };

export type Company = { id: string; name: string; image?: string | null; links?: string[] };
export type ContactAssignee = { id: string; name: string; image: string | null };
export type MediaItem = { id: number; type: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT'; content: string; createdAt: string; fileName: string | null; mimeType: string | null; links: string[] };
export type MediaPage = { items: MediaItem[]; hasMore: boolean; nextCursor: number | null };
export type MediaSummary = { count: number; items: MediaItem[] };
export type UploadAttachment = { uri: string; name: string; mimeType: string; size?: number };
