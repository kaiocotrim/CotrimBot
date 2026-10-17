# Offline presence fixtures

Evolution method excerpts and webhook controller come from commit `cd800f2976e1e5b682fbf86a01ee4d85ae61f370` (2.3.7).
Baileys parsing/subscription comes from the published npm package `baileys@7.0.0-rc.9`, `lib/Socket/chats.js`.
The copies are unpatched; tests apply the repository patch to temporary copies.
`channel.ts` wraps original methods with injected infrastructure. `chat.router.ts` keeps only the upstream route insertion contract.
The WebhookController and Baileys presence parsing/subscription methods are upstream code, not new parsers.
The fixture event emitter models the unbuffered presence event contract. HTTP, Socket.IO and the browser are real and local.
Axios is replaced by a fetch adapter to the local HTTP server; Prisma/auth infrastructure is replaced by fixtures.
No tests contact WhatsApp, write session keys or inject presence into production. License notices are retained alongside excerpts.

Original Evolution source SHA-256:

```json
{
  "src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts": "d920d4fdd3cae90cb0369ad501774388388f28475135562f6977628efa913d0c",
  "src/api/integrations/event/webhook/webhook.controller.ts": "8d7dd73a3d658cca0a827fdf97f674446c33fc8372fa9f89462921215c5df090"
}
```
