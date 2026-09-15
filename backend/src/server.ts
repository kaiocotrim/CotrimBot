// Importa o Express, responsável por criar e configurar o servidor HTTP.
import express from "express";

// Cada router reúne apenas o mapeamento entre uma URL e seu controller.
// Assim, o server.ts registra as rotas sem concentrar regras de negócio.
import { contactRouter } from "./routes/contact.routes.js";
import { messageRouter } from "./routes/message.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";

// Cria a aplicação Express e a exporta para permitir testes ou reutilização futura.
export const app = express();

// Converte requisições com Content-Type application/json em objetos disponíveis
// por meio de req.body antes que elas cheguem aos controllers.
app.use(express.json());

// Registra os grupos de rotas. O fluxo passa da rota para o controller adequado;
// nenhuma regra de contato, mensagem ou integração externa fica neste arquivo.
app.use(contactRouter);
app.use(messageRouter);
app.use(webhookRoutes);

// Inicia o servidor HTTP na mesma porta já utilizada pela aplicação.
app.listen(3333, () => {
  console.log("Servidor rodando em http://localhost:3333");
});
