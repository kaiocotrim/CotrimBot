"use client";

import { useState } from "react";
import type { OrganizationMember } from "./company-types";

export function CompanyMemberAvatar({ member, size = "medium" }: {
  member: Pick<OrganizationMember, "displayName" | "user">;
  size?: "small" | "medium";
}) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const image = member.user.image?.trim() || null;
  const name = member.displayName || member.user.name;
  const initial = (name.trim()[0] || member.user.email[0] || "?").toUpperCase();
  const sizeClass = size === "small" ? "size-8 text-xs" : "size-10 text-sm";

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.07] bg-white/[0.055] font-semibold text-zinc-200 ${sizeClass}`}
    >
      {image && image !== failedImage ? (
        // A imagem do perfil pode ser uma URL externa ou uma data URL dinâmica.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          className="size-full object-cover"
          onError={() => setFailedImage(image)}
        />
      ) : initial}
    </span>
  );
}
