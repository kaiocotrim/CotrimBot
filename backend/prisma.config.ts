import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

dotenv.config({ path: "../.env" });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Variável de ambiente obrigatória não definida: DATABASE_URL");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
