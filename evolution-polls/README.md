# Evolution 2.3.7: native poll votes and presence

This image keeps upstream commit `cd800f2976e1e5b682fbf86a01ee4d85ae61f370`, the original Baileys dependency and the existing poll vote patch. It adds presence diagnostics and an authenticated subscription route without changing message sending, database schemas, WhatsApp sessions or authentication guards.

The existing `POST /message/sendPollVote/:instanceName` route is preserved. It uses the connected Baileys instance, poll encryption key and native relay. Its routing and encryption regression tests remain in `backend/tests/`.

Presence changes:

- `POST /chat/subscribePresence/:instanceName` accepts `{number, aliases?: [alternate]}`. It preserves supplied PN/LID identifiers, reads an existing session mapping only when needed, and calls `presenceSubscribe`. It sends no `sendPresenceUpdate`, chatstate or message and writes no session keys.
- The real `client.ev.on('presence.update')` listener forwards the original payload without waiting for the message processing queue. The old queued presence branch is removed to prevent duplicate forwarding. Other queued handlers and the original `sendPresence` endpoint stay unchanged.
- Optional `PRESENCE_DEBUG=true` traces the socket node, Baileys event, Evolution dispatch, effective webhook flags and HTTP response. Identifiers are HMAC references; payloads, API keys and URLs are omitted. Logs are capped at 120 lines/minute/process. Presence uses these safe traces instead of the upstream `WEBHOOKS` payload dump.

See [the diagnostic and deployment guide](../docs/whatsapp-presence.md) for the exact observed configuration, limitations, test results and interpretation of each trace stage.

Rebuild and publish **both** services in Dokploy, Evolution first and the application second:

```sh
docker compose build evolution-api cotrimbot
docker compose up -d --no-deps evolution-api
docker compose up -d --no-deps cotrimbot
```

The Docker build applies both patches and runs the upstream type-check/build. Source markers are checked before the presence patch writes any file. This development environment has no Docker engine; the complete image build still needs to run in Dokploy.

Keep the existing volumes. Recreating Evolution reconnects the existing session; this patch does not delete, replace or recreate authentication state. No PostgreSQL, MySQL, Redis or transcription service rebuild is needed.

For rollback, restore the previous **custom Evolution image with poll support** together with the previous CotrimBot application image. The new application subscription route requires the new Evolution extension.
