import type { Contact } from "@/types/chat";

export const contactPriorities = [
  { value: "LOW", label: "Baixa", dot: "bg-green-500" },
  { value: "MEDIUM", label: "Média", dot: "bg-yellow-400" },
  { value: "HIGH", label: "Alta", dot: "bg-red-500" },
] as const;

export function getContactPriorityDetails(priority: Contact["priority"]) {
  return contactPriorities.find((option) => option.value === priority);
}

const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 } as const;

export function compareContactsByPriority(first: Contact, second: Contact) {
  const priorityDifference = priorityOrder[second.priority ?? "NONE"] - priorityOrder[first.priority ?? "NONE"];
  if (priorityDifference !== 0) return priorityDifference;

  const firstMessageTime = Date.parse(first.messages?.[0]?.createdAt ?? "") || 0;
  const secondMessageTime = Date.parse(second.messages?.[0]?.createdAt ?? "") || 0;
  return secondMessageTime - firstMessageTime
    || Number(Boolean(second.pinned)) - Number(Boolean(first.pinned));
}
