import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { patchEvolutionGifs } from "../../evolution-polls/gif-patch.mjs";

test("GIF patch keeps regular videos unchanged and enables explicit GIF playback", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "cotrimbot-gif-"));
  try {
    const dtoPath = path.join(root, "src/api/dto/sendMessage.dto.ts");
    const servicePath = path.join(root, "src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts");
    await mkdir(path.dirname(dtoPath), { recursive: true });
    await mkdir(path.dirname(servicePath), { recursive: true });
    await writeFile(dtoPath, "export class MediaMessage {\n}\nexport class SendMediaDto extends Metadata {\n}\n");
    await writeFile(servicePath, "if (mediaMessage.mediatype === 'video') { prepareMedia[mediaType].gifPlayback = false; }");
    await patchEvolutionGifs(root);
    const first = await readFile(servicePath, "utf8");
    const expression = first.match(/gifPlayback = ([^;]+);/)[1];
    const enabled = new Function("mediaMessage", `return ${expression}`);
    assert.equal(enabled({}), false);
    assert.equal(enabled({ gifPlayback: true }), true);
    assert.equal(enabled({ gifPlayback: "true" }), false);
    await patchEvolutionGifs(root);
    assert.equal(await readFile(servicePath, "utf8"), first);
    const dto = await readFile(dtoPath, "utf8");
    assert.equal((dto.match(/gifPlayback\?: boolean/g) || []).length, 2);
    await writeFile(servicePath, "unsupported upstream source");
    await assert.rejects(patchEvolutionGifs(root), /supported 2.3.7/);
    assert.equal(await readFile(dtoPath, "utf8"), dto);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(root, { recursive: true, force: true });
  }
});
