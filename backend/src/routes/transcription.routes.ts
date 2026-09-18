import { Router } from "express";

import {
  getSettings,
  updateSettings,
} from "../controllers/transcription.controller.js";


// Agrupa as configurações do microserviço Python; registrado em server.ts.
export const transcriptionRouter = Router();


// GET consulta o modelo, idioma, beam_size e vad_filter atualmente em uso.
transcriptionRouter.get(
  "/transcription/settings",
  getSettings
);


// PUT envia a configuração completa em JSON para o serviço Python validar e aplicar.
transcriptionRouter.put(
  "/transcription/settings",
  updateSettings
);
