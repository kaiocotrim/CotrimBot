import type { Api } from './api';

// Native images do not share the browser's cookie session or base URL.
export function imageSource(api: Pick<Api, 'server' | 'token'>, input?: string | null) {
  if (!input?.trim()) return undefined;
  if (/^data:image\//i.test(input)) return { uri: input };
  try {
    const url = new URL(input.trim(), `${api.server}/`);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return undefined;
    const authenticated = url.origin === new URL(api.server).origin && url.pathname.startsWith('/api/');
    return { uri: url.href, ...(authenticated && api.token ? { headers: { Authorization: `Bearer ${api.token}` } } : {}) };
  } catch { return undefined; }
}

export function messageImageSource(api: Pick<Api, 'server' | 'token'>, id: number) {
  return imageSource(api, `/api/messages/${id}/media`)!;
}

export function imageCaption(content: string, type: string) {
  const text = content.trim();
  if (!text || /^(\[(imagem|image|foto|figurinha|sticker)\])$/i.test(text) || text.toUpperCase() === type) return '';
  return content;
}
