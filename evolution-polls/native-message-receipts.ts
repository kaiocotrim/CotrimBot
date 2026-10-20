const observed = new WeakSet<object>();

function userJid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/:\d+(?=@)/, '');
  return /^\d+@(s\.whatsapp\.net|lid)$/.test(normalized) ? normalized : null;
}

export function observeNativeMessageReceipts(client: any, options: {
  active: () => boolean;
  ignoreGroups: () => boolean;
  forward: (payload: any) => Promise<unknown> | unknown;
}) {
  if (!client?.ev?.on || observed.has(client)) return;
  observed.add(client);
  client.ev.on('message-receipt.update', (events: any[]) => {
    if (!options.active() || options.ignoreGroups() || !Array.isArray(events)) return;
    for (const event of events) {
      const key = event?.key;
      const recipient = userJid(event?.receipt?.userJid);
      if (!recipient || key?.fromMe !== true || typeof key.id !== 'string' || !/^\d+(?:-\d+)?@g\.us$/.test(key.remoteJid ?? '')) continue;
      void (async () => {
        let phone: string | null = recipient.endsWith('@s.whatsapp.net') ? recipient : null;
        if (!phone) {
          try { phone = userJid(await client.signalRepository?.lidMapping?.getPNForLID(recipient)); } catch { /* Preserve LID when no mapping exists. */ }
        }
        const receipt: Record<string, unknown> = { userJid: recipient, phoneJid: phone?.endsWith('@s.whatsapp.net') ? phone : null };
        for (const field of ['receiptTimestamp', 'readTimestamp', 'playedTimestamp']) {
          const timestamp = Number(event.receipt[field]);
          if (Number.isFinite(timestamp) && timestamp > 0) receipt[field] = timestamp;
        }
        if (!receipt.receiptTimestamp && !receipt.readTimestamp && !receipt.playedTimestamp) return;
        await options.forward({ key: { id: key.id, remoteJid: key.remoteJid, fromMe: true }, receipt });
      })().catch(() => console.warn('[message-receipts] Unable to forward a group receipt.'));
    }
  });
}
