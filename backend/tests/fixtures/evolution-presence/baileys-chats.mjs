// Original Baileys 7.0.0-rc.9 parser/subscription; transport and emitter are injected in offline tests.
export function attachBaileysChats({ev,ws,sendNode}) {
 const S_WHATSAPP_NET='s.whatsapp.net';const shouldIgnoreJid=jid=>jid.endsWith('@g.us');
 const logger={error(){throw new Error('Invalid fixture node')}};let next=0;const generateMessageTag=()=>String(++next);
    const presenceSubscribe = (toJid, tcToken) => sendNode({
        tag: 'presence',
        attrs: {
            to: toJid,
            id: generateMessageTag(),
            type: 'subscribe'
        },
        content: tcToken
            ? [
                {
                    tag: 'tctoken',
                    attrs: {},
                    content: tcToken
                }
            ]
            : undefined
    });
    const handlePresenceUpdate = ({ tag, attrs, content }) => {
        let presence;
        const jid = attrs.from;
        const participant = attrs.participant || attrs.from;
        if (shouldIgnoreJid(jid) && jid !== S_WHATSAPP_NET) {
            return;
        }
        if (tag === 'presence') {
            presence = {
                lastKnownPresence: attrs.type === 'unavailable' ? 'unavailable' : 'available',
                lastSeen: attrs.last && attrs.last !== 'deny' ? +attrs.last : undefined
            };
        }
        else if (Array.isArray(content)) {
            const [firstChild] = content;
            let type = firstChild.tag;
            if (type === 'paused') {
                type = 'available';
            }
            if (firstChild.attrs?.media === 'audio') {
                type = 'recording';
            }
            presence = { lastKnownPresence: type };
        }
        else {
            logger.error({ tag, attrs, content }, 'recv invalid presence node');
        }
        if (presence) {
            ev.emit('presence.update', { id: jid, presences: { [participant]: presence } });
        }
    };
 ws.on('CB:presence',handlePresenceUpdate);ws.on('CB:chatstate',handlePresenceUpdate);
 return {presenceSubscribe};
}
