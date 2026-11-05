"use client";

import { useEffect, useState } from "react";
import { getCsatMetrics, type CsatMetrics } from "@/lib/csat-api";

const PERIODS = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function formatPercent(value: number | null) {
  return value === null ? "—" : `${value}%`;
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function CsatDashboard() {
  const [days, setDays] = useState(30);
  const [metrics, setMetrics] = useState<CsatMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const to = new Date();
    const from = new Date(to.getTime() - days * DAY_MS);
    getCsatMetrics(from, to)
      .then((data) => {
        if (!active) return;
        setMetrics(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Erro ao carregar métricas");
      });
    return () => {
      active = false;
    };
  }, [days]);

  const maxDistribution = metrics ? Math.max(1, ...Object.values(metrics.distribution)) : 1;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">CSAT</h1>
          <p className="text-sm text-muted-foreground">Satisfação dos clientes após o encerramento dos atendimentos.</p>
        </div>
        <div className="flex gap-2">
          {PERIODS.map((period) => (
            <button
              key={period.days}
              type="button"
              onClick={() => setDays(period.days)}
              className={`rounded-md border px-3 py-1.5 text-sm ${days === period.days ? "font-semibold" : "text-muted-foreground"}`}
            >
              {period.label}
            </button>
          ))}
        </div>
      </header>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!metrics && !error && <p className="text-sm text-muted-foreground">Carregando métricas...</p>}

      {metrics && (
        <>
          <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Kpi label="Pontuação CSAT" value={formatPercent(metrics.satisfactionScore)} hint="Notas 4 e 5" />
            <Kpi label="Nota média" value={metrics.averageRating?.toFixed(2) ?? "—"} hint="Escala de 1 a 5" />
            <Kpi label="Taxa de resposta" value={formatPercent(metrics.responseRate)} />
            <Kpi label="Pesquisas enviadas" value={String(metrics.sent)} hint={`${metrics.pending} pendentes · ${metrics.expired} expiradas`} />
          </section>

          <section className="rounded-xl border p-4">
            <h2 className="mb-4 font-semibold">Distribuição das notas</h2>
            <ul className="flex flex-col gap-2">
              {Object.entries(metrics.distribution).map(([rating, count]) => (
                <li key={rating} className="flex items-center gap-3 text-sm">
                  <span className="w-6 text-right">{rating}</span>
                  <div className="h-3 flex-1 rounded bg-muted">
                    <div className="h-3 rounded bg-primary" style={{ width: `${(count / maxDistribution) * 100}%` }} />
                  </div>
                  <span className="w-8 text-right text-muted-foreground">{count}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border p-4">
            <h2 className="mb-4 font-semibold">Respostas recentes</h2>
            {metrics.recentResponses.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma resposta no período.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {metrics.recentResponses.map((response) => (
                  <li key={response.id} className="flex flex-col gap-1 py-3 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-medium">{response.contact.name}</span>
                      <span className="text-muted-foreground">
                        {new Date(response.answeredAt ?? response.sentAt).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <span>Nota: {response.rating ?? "—"}</span>
                    {response.comment && <p className="text-muted-foreground">“{response.comment}”</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
