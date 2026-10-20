"use client";

import { Avatar } from "@/components/chat/avatar";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import type { TeamTypingMember } from "@/hooks/use-contact-team-typing";

export function TeamTypingBadge({ members, label }: { members: TeamTypingMember[]; label: string }) {
  const names = members.slice(0, 2).map((member) => member.name).join(" e ");
  return (
    <div role="status" aria-label={label} className="flex max-w-full items-center gap-2 py-1.5 pr-3 pl-1.5">
      {members.length > 0 && <div aria-hidden="true" className="flex shrink-0 -space-x-1.5">
        {members.slice(0, 2).map((member) => <span key={member.userId} data-team-typing-avatar className="rounded-full"><Avatar contact={{ name: member.name, profilePictureUrl: member.image }} className="size-6 text-[10px] text-zinc-200" /></span>)}
      </div>}
      <span className="min-w-0 truncate text-[11px] font-medium text-zinc-300">{names || label}{members.length > 2 && <span className="ml-1 text-zinc-500">+{members.length - 2}</span>}</span>
      <TypingIndicator label={label} decorative className="shrink-0 gap-1.5 px-1 text-zinc-400" />
    </div>
  );
}
