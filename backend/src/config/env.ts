import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "url";

// Permite iniciar o backend tanto dentro de backend/ quanto pela raiz.
// No container, o Compose já injeta essas variáveis no processo.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: path.resolve(__dirname, "../../../.env"),
});

// Falha rápido caso as variáveis do Better Auth não estejam configuradas.
for (const name of ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL"]) {
  if (!process.env[name]) {
    throw new Error(`Variável de ambiente obrigatória não definida: ${name}`);
  }
}

