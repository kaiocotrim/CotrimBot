export const CONTACT_AVATAR_FAILED = "contact-avatar-failed";
export const CONTACT_AVATAR_UPDATED = "contact-avatar-updated";

export type ContactAvatarEvent = CustomEvent<{ contactId: number }>;
