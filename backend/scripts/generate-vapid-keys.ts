import webpush from "web-push";

// Gera um par de chaves VAPID para as notificações push (PWA).
// Copie as linhas abaixo para o .env da raiz do projeto.
const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log("VAPID_SUBJECT=mailto:seu-email@exemplo.com");
