import { Router } from "express";

import {
  getSettings,
  updateSettings,
} from "../controllers/transcription.controller.js";


export const transcriptionRouter =
  Router();


transcriptionRouter.get(
  "/transcription/settings",
  getSettings
);


transcriptionRouter.put(
  "/transcription/settings",
  updateSettings
);