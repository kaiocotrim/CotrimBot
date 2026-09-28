import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  output: 'export',
  // Se estiver usando tags de imagem do Next.js, adicione isso para evitar erros no export estático:
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
