import { Router } from 'express';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// The installer reads this ASCII/hex payload from its filename. Its bytes and
// signature remain identical for all servers; no build or outbound request occurs.
export function desktopDownloadName(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2000) throw new Error('Invalid server');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid server');
  const origin = url.origin;
  if (origin.length > 110) throw new Error('Server URL too long');
  return `CotrimBot--${Buffer.from(origin, 'ascii').toString('hex')}.exe`;
}

const defaultInstaller = fileURLToPath(new URL(
  `${import.meta.url.endsWith('.ts') ? '../../../' : '../../../../'}desktop/dist/CotrimBot-Setup-1.1.0-x64.exe`, import.meta.url));

export function createDesktopRouter(installerPath = process.env.COTRIMBOT_DESKTOP_INSTALLER_PATH ?? defaultInstaller) {
  const router = Router();
  router.get('/desktop/download', async (req, res) => {
    let filename: string;
    try { filename = desktopDownloadName(req.query.server); }
    catch { res.status(400).json({ message: 'Informe a URL HTTPS do servidor, sem caminho, credenciais ou parâmetros (máximo de 110 caracteres).' }); return; }
    const artifact = path.resolve(installerPath);
    try { await access(artifact); }
    catch { res.status(503).json({ message: 'O instalador ainda não foi disponibilizado neste servidor.' }); return; }
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.download(artifact, filename, error => {
      if (error && !res.headersSent) res.status(503).end();
    });
  });
  return router;
}

export const desktopRouter = createDesktopRouter();
