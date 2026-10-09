export function contactDisplayName(contact: {
  name: string;
  phone: string;
  isGroup: boolean;
  isSaved: boolean;
}): string {
  return contact.isGroup || contact.isSaved ? contact.name : contact.phone;
}
