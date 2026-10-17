# Native poll votes

Evolution 2.3.7 receives poll votes but its standard message router does not expose a voting endpoint. This image adds the authenticated `POST /message/sendPollVote/:instance` route to that same upstream version. It uses the existing Baileys connection, poll encryption key and message relay; no second WhatsApp login is required.

The CotrimBot backend calls this route only when the user selects an option. The request contains `number`, `messageId` and `optionIndexes` (an empty array withdraws the vote). The poll is looked up inside the authenticated instance and its chat and option limits are validated before sending.

On the host running the Compose services, build and restart only Evolution:

```sh
docker compose build evolution-api
docker compose up -d --no-deps evolution-api
```

This briefly reconnects the existing WhatsApp session. Persistent volumes and database schemas are preserved. The image build type-checks the patched upstream source. Real WhatsApp delivery must be checked after deployment; local tests use a mocked relay and verify the encryption format without sending messages to contacts.

To roll back, restore `image: evoapicloud/evolution-api:v2.3.7` without the `build` block and recreate only that service.
