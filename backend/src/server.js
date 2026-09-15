import express from "express";
import cors from "cors";
import { contactRouter } from "./routes/contact.routes.js";
import { messageRouter } from "./routes/message.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
export const app = express();
// Permite que o frontend do CotrimBot acesse o backend.
app.use(cors({
    origin: "http://localhost:3000",
}));
// Converte JSON recebido para req.body.
app.use(express.json());
app.use(contactRouter);
app.use(messageRouter);
app.use(webhookRoutes);
app.listen(3333, () => {
    console.log("Servidor rodando em http://localhost:3333");
});
//# sourceMappingURL=server.js.map