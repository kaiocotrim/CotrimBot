import type {
  Request,
  Response,
} from "express";

import {
  getTranscriptionSettings,
  updateTranscriptionSettings,
} from "../services/transcription.service.js";


export async function getSettings(
  req: Request,
  res: Response
) {
  try {
    const settings =
      await getTranscriptionSettings();

    return res.json(settings);

  } catch (error) {
    console.error(
      "Erro ao buscar configurações:",
      error
    );

    return res.status(500).json({
      message:
        "Erro ao buscar configurações de transcrição",
    });
  }
}


export async function updateSettings(
  req: Request,
  res: Response
) {
  try {
    const settings =
      await updateTranscriptionSettings(
        req.body
      );

    return res.json(settings);

  } catch (error) {
    console.error(
      "Erro ao atualizar configurações:",
      error
    );

    return res.status(500).json({
      message:
        "Erro ao atualizar configurações de transcrição",
    });
  }
}