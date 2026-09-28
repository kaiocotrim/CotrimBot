import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import path from "node:path";

// Centraliza também as variáveis do frontend no .env da raiz do projeto.
const rootEnvPath = path.resolve(process.cwd(), "../.env");
if (existsSync(rootEnvPath)) {
  const nodeProcess = process as NodeJS.Process & {
    loadEnvFile: (filePath: string) => void;
  };
  nodeProcess.loadEnvFile(rootEnvPath);
}

const nextConfig: NextConfig = {
  /* config options here */

  output: 'export',
  // Se estiver usando tags de imagem do Next.js, adicione isso para evitar erros no export estático:
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
