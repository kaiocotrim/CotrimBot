import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { type CsatDatabase, getCsatMetrics } from "../services/csat.service.js";

const DEFAULT_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function createCsatRouter(database: CsatDatabase = prisma) {
  const router = Router();

  // GET /csat/metrics?from=ISO&to=ISO - Métricas CSAT do período (padrão: últimos 30 dias).
  router.get("/csat/metrics", async (req, res) => {
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    if (from === null || to === null) {
      return res.status(400).json({ message: "Datas inválidas. Use o formato ISO 8601." });
    }

    const end = to ?? new Date();
    const start = from ?? new Date(end.getTime() - DEFAULT_PERIOD_MS);
    if (start > end) {
      return res.status(400).json({ message: "A data inicial não pode ser posterior à final." });
    }

    try {
      res.json(await getCsatMetrics(database, { from: start, to: end }));
    } catch (error) {
      console.error("Erro ao calcular métricas CSAT:", error);
      res.status(500).json({ message: "Erro ao calcular métricas CSAT" });
    }
  });

  return router;
}

export const csatRouter = createCsatRouter();
