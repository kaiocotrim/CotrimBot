import type { Company, Contact, ContactAssignee, MediaPage, MediaSummary, Message, MessagesPage, Session, UploadAttachment } from './types';
import { attachmentForm } from './message-composer.ts';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function normalizeServer(input: string, allowHttp = false): string {
  let url: URL;
  try { url = new URL(input.trim()); }
  catch { throw new Error('Informe o endereço completo do servidor, começando com https://.'); }
  if ((url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:'))
    || url.username || url.password || url.search || url.hash
    || !['/', '/api', '/api/'].includes(url.pathname)) {
    throw new Error('Use a URL HTTPS do servidor, sem caminhos ou parâmetros.');
  }
  return url.origin;
}

export class Api {
  server: string;
  token: string | null;
  transport: typeof fetch;
  onUnauthorized?: () => void;

  constructor(server: string, token: string | null = null, transport: typeof fetch = fetch) {
    this.server = server;
    this.token = token;
    this.transport = transport;
  }

  async request<T>(path: string, init: RequestInit = {}, timeoutMs = 20000): Promise<T> {
    const response = await this.fetch(path, init, timeoutMs);
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  async fetch(path: string, init: RequestInit = {}, timeoutMs = 20000): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const headers: Record<string, string> = Object.fromEntries(new Headers(init.headers));
    if (!(init.body instanceof FormData) && !headers['content-type']) headers['Content-Type'] = 'application/json';
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    let response: Response;
    try {
      response = await this.transport(`${this.server}/api${path}`, {
        ...init,
        credentials: 'omit',
        signal: controller.signal,
        headers,
      });
    } catch {
      throw new Error('Não foi possível conectar. Confira o servidor e sua conexão.');
    } finally { clearTimeout(timeout); }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      if (response.status === 401 && this.token) this.onUnauthorized?.();
      throw new ApiError(body?.message ?? body?.error ?? `Erro do servidor (${response.status}).`, response.status);
    }
    return response;
  }

  async signIn(email: string, password: string): Promise<{ token: string; session: Session }> {
    const response = await this.fetch('/auth/sign-in/email', {
      method: 'POST', body: JSON.stringify({ email: email.trim(), password }),
    });
    const token = response.headers.get('set-auth-token');
    if (!token) throw new Error('O servidor não retornou uma sessão mobile. Confira o plugin bearer do backend.');
    this.token = token;
    const session = await this.request<Session | null>('/auth/get-session');
    if (!session) throw new ApiError('Não foi possível validar a sessão.', 401);
    return { token, session };
  }

  contacts() { return this.request<Contact[]>('/contacts'); }
  contact(id: number) { return this.request<Contact>(`/contacts/${id}`); }
  assignees() { return this.request<ContactAssignee[]>('/contacts/assignees'); }
  setAssignment(id: number, assignedUserIds: string[]) {
    return this.request<Contact>(`/contacts/${id}/assignment`, { method: 'PATCH', body: JSON.stringify({ assignedUserIds }) });
  }
  setPriority(id: number, priority: NonNullable<Contact['priority']>) {
    return this.request<Contact>(`/contacts/${id}/priority`, { method: 'PATCH', body: JSON.stringify({ priority }) });
  }
  closeConversation(id: number) {
    return this.request<{ message: Message; contact: Contact }>(`/contacts/${id}/close-with-bot`, { method: 'POST' });
  }
  updateContact(id: number, input: { name: string; phone?: string; companyName: string; jobTitle: string }) {
    return this.request<Contact>(`/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
  }
  companies() { return this.request<{ clients: Company[] }>('/clients'); }
  mediaSummary(id: number) { return this.request<MediaSummary>(`/media-library?contactId=${id}&summary=1`); }
  media(id: number, tab: 'media' | 'documents' | 'links', cursor?: number | null) {
    return this.request<MediaPage>(`/media-library?contactId=${id}&tab=${tab}&sort=newest${cursor ? `&cursor=${cursor}` : ''}`);
  }
  messages(contactId: number, before?: number) {
    return this.request<MessagesPage>(`/contacts/${contactId}/messages?limit=40${before ? `&before=${before}` : ''}`);
  }
  send(contactId: number, text: string, replyToMessageId?: number) {
    return this.request<{ message: Message }>(`/contacts/${contactId}/send`, {
      method: 'POST', body: JSON.stringify({ text, includeSignature: true, replyToMessageId }),
    });
  }
  sendMedia(contactId: number, file: UploadAttachment, caption: string, replyToMessageId?: number) {
    return this.request<{ message: Message }>(`/contacts/${contactId}/send-media`, {
      method: 'POST', body: attachmentForm(file, caption, replyToMessageId),
    }, 120000);
  }
  markRead(contactId: number) {
    return this.fetch(`/contacts/${contactId}/messages/read`, { method: 'PATCH' });
  }
}
