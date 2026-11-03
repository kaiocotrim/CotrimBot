"use client";

import { useEffect, useState } from "react";
import { authClient, useSession } from "@/lib/auth-client";
import { cacheNotificationIcon } from "@/lib/pwa";

const DEFAULT_ICON = "/icons/icon-192x192.png";

export function useCompanyNotificationIcon() {
  const { data: session } = useSession();
  const organizationId = session?.session.activeOrganizationId;
  const userId = session?.user.id;
  const [brand, setBrand] = useState<{ userId: string; organizationId: string | null | undefined; icon: string } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function load() {
      const { data, error } = await authClient.organization.list();
      if (cancelled || error) return;
      const company = data?.find(company => company.id === organizationId) ?? data?.[0];
      const icon = company?.logo || DEFAULT_ICON;
      setBrand({ userId: userId!, organizationId, icon });
      void cacheNotificationIcon(icon).catch(() => undefined);
    }
    const refresh = () => { void load().catch(() => undefined); };
    refresh();
    window.addEventListener("cotrimbot:company-logo-updated", refresh);
    return () => { cancelled = true; window.removeEventListener("cotrimbot:company-logo-updated", refresh); };
  }, [organizationId, userId]);

  return brand && brand.userId === userId && brand.organizationId === organizationId ? brand.icon : DEFAULT_ICON;
}
