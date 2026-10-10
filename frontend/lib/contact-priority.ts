import type { Contact } from "@/types/chat";

export const contactPriorities = [
  { value: "LOW", label: "Baixa", dot: "bg-green-500" },
  { value: "MEDIUM", label: "Média", dot: "bg-yellow-400" },
  { value: "HIGH", label: "Alta", dot: "bg-red-500" },
] as const;

export function getContactPriorityDetails(priority: Contact["priority"]) {
  return contactPriorities.find((option) => option.value === priority);
}
