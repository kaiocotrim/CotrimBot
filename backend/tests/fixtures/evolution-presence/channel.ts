// Original method excerpts from Evolution cd800f2; fixture members below replace infrastructure.
const Events = {PRESENCE_UPDATE:'presence.update'};
class BadRequestException extends Error {}
const isJidGroup=jid=>jid.endsWith('@g.us');const delay=async()=>{};
export class ChannelFixture {
  client;endSession=false;localSettings={groupsIgnore:false};eventProcessingQueue=Promise.resolve();
  configService={get:()=>({})};logger={error(error){throw error}};
  messageHandle={};
  whatsappNumber=async()=>[];
  constructor(client,forward){this.client=client;this.sendDataWebhook=forward;}
  sendDataWebhook;
  findSettings=async()=>this.localSettings;
  start(){this.eventHandler();}
  private eventHandler() {
    this.client.ev.process(async (events) => {
      this.eventProcessingQueue = this.eventProcessingQueue.then(async () => {
        try {
          if (!this.endSession) {
            const database = this.configService.get<Database>('DATABASE');
            const settings = await this.findSettings();

            if (events.call) {
              const call = events.call[0];

              if (settings?.rejectCall && call.status == 'offer') {
                this.client.rejectCall(call.id, call.from);
              }

              if (settings?.msgCall?.trim().length > 0 && call.status == 'offer') {
                if (call.from.endsWith('@lid')) {
                  call.from = await this.client.signalRepository.lidMapping.getPNForLID(call.from as string);
                }
                const msg = await this.client.sendMessage(call.from, { text: settings.msgCall });

                this.client.ev.emit('messages.upsert', { messages: [msg], type: 'notify' });
              }

              this.sendDataWebhook(Events.CALL, call);
            }

            if (events['connection.update']) {
              this.connectionUpdate(events['connection.update']);
            }

            if (events['creds.update']) {
              this.instance.authState.saveCreds();
            }

            if (events['messaging-history.set']) {
              const payload = events['messaging-history.set'];
              await this.messageHandle['messaging-history.set'](payload);
            }

            if (events['messages.upsert']) {
              const payload = events['messages.upsert'];

              // this.messageProcessor.processMessage(payload, settings);
              await this.messageHandle['messages.upsert'](payload, settings);
            }

            if (events['messages.update']) {
              const payload = events['messages.update'];
              await this.messageHandle['messages.update'](payload, settings);
            }

            if (events['message-receipt.update']) {
              const payload = events['message-receipt.update'] as MessageUserReceiptUpdate[];
              const remotesJidMap: Record<string, number> = {};

              for (const event of payload) {
                if (typeof event.key.remoteJid === 'string' && typeof event.receipt.readTimestamp === 'number') {
                  remotesJidMap[event.key.remoteJid] = event.receipt.readTimestamp;
                }
              }

              await Promise.all(
                Object.keys(remotesJidMap).map(async (remoteJid) =>
                  this.updateMessagesReadedByTimestamp(remoteJid, remotesJidMap[remoteJid]),
                ),
              );
            }

            if (events['presence.update']) {
              const payload = events['presence.update'];

              if (settings?.groupsIgnore && payload.id.includes('@g.us')) {
                return;
              }

              this.sendDataWebhook(Events.PRESENCE_UPDATE, payload);
            }

            if (!settings?.groupsIgnore) {
              if (events['groups.upsert']) {
                const payload = events['groups.upsert'];
                this.groupHandler['groups.upsert'](payload);
              }

              if (events['groups.update']) {
                const payload = events['groups.update'];
                this.groupHandler['groups.update'](payload);
              }

              if (events['group-participants.update']) {
                const payload = events['group-participants.update'] as any;
                this.groupHandler['group-participants.update'](payload);
              }
            }

            if (events['chats.upsert']) {
              const payload = events['chats.upsert'];
              this.chatHandle['chats.upsert'](payload);
            }

            if (events['chats.update']) {
              const payload = events['chats.update'];
              this.chatHandle['chats.update'](payload);
            }

            if (events['chats.delete']) {
              const payload = events['chats.delete'];
              this.chatHandle['chats.delete'](payload);
            }

            if (events['contacts.upsert']) {
              const payload = events['contacts.upsert'];
              this.contactHandle['contacts.upsert'](payload);
            }

            if (events['contacts.update']) {
              const payload = events['contacts.update'];
              this.contactHandle['contacts.update'](payload);
            }

            if (events[Events.LABELS_ASSOCIATION]) {
              const payload = events[Events.LABELS_ASSOCIATION];
              this.labelHandle[Events.LABELS_ASSOCIATION](payload, database);
              return;
            }

            if (events[Events.LABELS_EDIT]) {
              const payload = events[Events.LABELS_EDIT];
              this.labelHandle[Events.LABELS_EDIT](payload);
              return;
            }
          }
        } catch (error) {
          this.logger.error(error);
        }
      });
    });
  }

  public async sendPresence(data: SendPresenceDto) {
    try {
      const { number } = data;

      const isWA = (await this.whatsappNumber({ numbers: [number] }))?.shift();

      if (!isWA.exists && !isJidGroup(isWA.jid) && !isWA.jid.includes('@broadcast')) {
        throw new BadRequestException(isWA);
      }

      const sender = isWA.jid;

      if (data?.delay && data?.delay > 20000) {
        let remainingDelay = data?.delay;
        while (remainingDelay > 20000) {
          await this.client.presenceSubscribe(sender);

          await this.client.sendPresenceUpdate((data?.presence as WAPresence) ?? 'composing', sender);

          await delay(20000);

          await this.client.sendPresenceUpdate('paused', sender);

          remainingDelay -= 20000;
        }
        if (remainingDelay > 0) {
          await this.client.presenceSubscribe(sender);

          await this.client.sendPresenceUpdate((data?.presence as WAPresence) ?? 'composing', sender);

          await delay(remainingDelay);

          await this.client.sendPresenceUpdate('paused', sender);
        }
      } else {
        await this.client.presenceSubscribe(sender);

        await this.client.sendPresenceUpdate((data?.presence as WAPresence) ?? 'composing', sender);

        await delay(data?.delay);

        await this.client.sendPresenceUpdate('paused', sender);
      }

      return { presence: data.presence };
    } catch (error) {
      this.logger.error(error);
      throw new BadRequestException(error.toString());
    }
  }

}
