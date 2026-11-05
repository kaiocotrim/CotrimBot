const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export type CsatRecentResponse = {
  id: number;
  rating: number | null;
  comment: string | null;
  sentAt: string;
  answeredAt: string | null;
  contact: { id: number; name: string; phone: string; isGroup: boolean; isSaved: boolean };
};

export type CsatMetrics = {
  period: { from: string; to: string };
  sent: number;
  answered: number;
  pending: number;
  expired: number;
  responseRate: number;
  averageRating: number | null;
  satisfactionScore: number | null;
  commentsCount: number;
  distribution: Record<string, number>;
  recentResponses: CsatRecentResponse[];
};

export async function getCsatMetrics(from: Date, to: Date): Promise<CsatMetrics> {
  const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  const response = await fetch(`${API_URL}/csat/metrics?${params}`, { credentials: "include" });
  if (!response.ok) throw new Error("Não foi possível carregar as métricas CSAT");
  return (await response.json()) as CsatMetrics;
}
