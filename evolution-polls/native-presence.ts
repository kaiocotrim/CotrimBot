import { createHmac, randomBytes } from 'node:crypto';

const salt = randomBytes(32);
const observed = new WeakSet<object>();
const statuses = new Set(['composing', 'recording', 'paused', 'available', 'unavailable']);
let logWindow = 0;
let logCount = 0;

function jid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/:\d+(?=@)/, '');
  return /^\d+@(s\.whatsapp\.net|lid)$/.test(normalized) ? normalized : null;
}

function identifier(value: unknown) {
  const normalized = jid(value);
  return {
    kind: normalized?.endsWith('@lid') ? 'lid' : normalized ? 'phone' : 'other',
    ref: normalized ? createHmac('sha256', salt).update(normalized).digest('hex').slice(0, 12) : undefined,
  };
}

// Only callers' fixed metadata and HMAC references; never log nodes, URLs or errors.
export function presenceTrace(stage: string, details: Record<string, unknown> = {}) {
  if (process.env.PRESENCE_DEBUG !== 'true') return;
  const now = Date.now();
  if (now - logWindow >= 60_000) { logWindow = now; logCount = 0; }
  if (logCount++ >= 120) return;
  console.info('[evolution-presence]', JSON.stringify({ stage, ...details }));
}

export function presenceSummary(payload: any) {
  const entries = payload?.presences && typeof payload.presences === 'object' ? Object.values(payload.presences) : [];
  return {
    ...identifier(payload?.id),
    states: [...new Set(entries.map((entry: any) => statuses.has(entry?.lastKnownPresence) ? entry.lastKnownPresence : 'other'))],
  };
}

export function observeNativePresence(client: any, options: {
  active: () => boolean;
  ignoreGroups: () => boolean;
  forward: (payload: any) => Promise<unknown>;
}) {
  if (observed.has(client)) return;
  observed.add(client);
  presenceTrace('observer_attached');
  const raw = (node: any) => {
    const child = Array.isArray(node?.content) ? node.content[0] : null;
    const state = node?.tag === 'presence' ? (node?.attrs?.type === 'unavailable' ? 'unavailable' : 'available')
      : child?.attrs?.media === 'audio' ? 'recording' : statuses.has(child?.tag) ? child.tag : 'other';
    presenceTrace('socket_node', { ...identifier(node?.attrs?.from), tag: node?.tag === 'chatstate' ? 'chatstate' : 'presence', state });
  };
  const receive = (payload: any) => {
    const summary = presenceSummary(payload);
    presenceTrace('baileys_event', summary);
    if (!options.active()) { presenceTrace('ignored', { reason: 'inactive' }); return; }
    if (typeof payload?.id !== 'string' || !payload?.presences || typeof payload.presences !== 'object') {
      presenceTrace('ignored', { reason: 'malformed' }); return;
    }
    if (payload.id.endsWith('@g.us') && options.ignoreGroups()) { presenceTrace('ignored', { reason: 'group' }); return; }
    // A real Baileys event bypasses only the message processing queue. Payload unchanged.
    presenceTrace('evolution_forward', summary);
    void Promise.resolve().then(() => options.forward(payload)).then(
      () => presenceTrace('dispatch_returned', summary),
      () => presenceTrace('dispatch_failed', summary),
    );
  };
  const cleanup = () => {
    client.ev.off('presence.update', receive);
    client.ws?.off('CB:presence', raw);
    client.ws?.off('CB:chatstate', raw);
    client.ws?.off('close', cleanup);
    observed.delete(client);
  };
  client.ev.on('presence.update', receive);
  client.ws?.on('CB:presence', raw);
  client.ws?.on('CB:chatstate', raw);
  client.ws?.on('close', cleanup);
}

export async function subscribeNativePresence(channel: any, input: any) {
  if (!channel?.client?.user?.id || typeof channel.client.presenceSubscribe !== 'function') throw new Error('WhatsApp connection unavailable');
  if (typeof input?.number !== 'string' || (input.aliases !== undefined && (!Array.isArray(input.aliases) || input.aliases.length > 1))) throw new Error('Invalid presence subscription');
  const supplied = [input.number, ...(input.aliases ?? [])].map((value) => {
    if (typeof value !== 'string' || value.length > 80) throw new Error('Invalid presence identifier');
    const candidate = value.includes('@') ? value : `${value.replace(/[+()\s-]/g, '')}@s.whatsapp.net`;
    const normalized = jid(candidate);
    if (!normalized) throw new Error('Invalid presence identifier');
    return normalized;
  });
  const targets = new Set<string>(supplied);
  // Read existing mappings only. Do not run USync, onWhatsApp or write session keys.
  if (targets.size === 1 && channel.client.authState?.keys?.get) {
    const original = supplied[0];
    const [user, server] = original.split('@');
    const mappingKey = server === 'lid' ? `${user}_reverse` : user;
    try {
      const mapping = await channel.client.authState.keys.get('lid-mapping', [mappingKey]);
      const mappedUser = mapping?.[mappingKey];
      const alternate = typeof mappedUser === 'string' && /^\d+$/.test(mappedUser)
        ? jid(`${mappedUser}@${server === 'lid' ? 's.whatsapp.net' : 'lid'}`) : null;
      if (alternate) targets.add(alternate);
      presenceTrace('mapping_read', { found: Boolean(alternate), ...identifier(original) });
    } catch { presenceTrace('mapping_unavailable'); }
  }
  for (const target of targets) {
    presenceTrace('subscription_attempt', identifier(target));
    try { await channel.client.presenceSubscribe(target); }
    catch { presenceTrace('subscription_failed', identifier(target)); throw new Error('Unable to subscribe to WhatsApp presence'); }
    presenceTrace('subscription_written', identifier(target));
  }
  // Socket write success is not a remote acknowledgment or proof of future events.
  return { subscribed: true, targets: targets.size };
}
