import dotenv from "dotenv";
import path from "node:path";

// Permite iniciar o backend tanto dentro de backend/ quanto pela raiz.
// No container, o Compose já injeta essas variáveis no processo.
dotenv.config({
  path: [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../.env"),
  ],
});
