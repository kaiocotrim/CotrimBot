const SIGNATURE_PREFIX = /^\*([^*\r\n]{1,255}):\*(?=$|\s)/;

// A assinatura enviada ao WhatsApp tem o formato *Nome:* no início do texto.
// Encaminhamentos podem acumular mais de uma assinatura consecutiva.
export function splitMessageSignatures(content: string) {
  const signatures: Array<{ name: string; separator: string }> = [];
  let offset = 0;

  while (true) {
    const match = SIGNATURE_PREFIX.exec(content.slice(offset));
    if (!match || match[1] !== match[1].trim()) break;

    offset += match[0].length;
    const separator = /^[ \t]+/.exec(content.slice(offset))?.[0] ?? "";
    signatures.push({ name: match[1], separator });
    offset += separator.length;
  }

  return { signatures, body: content.slice(offset) };
}
