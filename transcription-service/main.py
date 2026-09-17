from fastapi import FastAPI, UploadFile, File, HTTPException
from faster_whisper import WhisperModel
from pydantic import BaseModel

import tempfile
import os
import time


app = FastAPI()


# =========================
# MODELOS PERMITIDOS
# =========================

ALLOWED_MODELS = [
    "tiny",
    "base",
    "small",
    "medium"
]


# =========================
# CONFIGURAÇÃO ATUAL
# =========================

current_settings = {
    "model": "base",
    "beam_size": 1,
    "vad_filter": True,
    "language": "pt"
}


# =========================
# MODELO WHISPER
# =========================

model = WhisperModel(
    current_settings["model"],
    device="cpu",
    compute_type="int8"
)


# =========================
# TIPO DA CONFIGURAÇÃO
# =========================

class TranscriptionSettings(BaseModel):
    model: str
    beam_size: int
    vad_filter: bool
    language: str


# =========================
# HEALTH CHECK
# =========================

@app.get("/")
def health():
    return {
        "status": "ok",
        "service": "CotrimBot Transcription"
    }


# =========================
# GET CONFIGURAÇÕES
# =========================

@app.get("/settings")
def get_settings():
    return current_settings


# =========================
# ALTERAR CONFIGURAÇÕES
# =========================

@app.put("/settings")
def update_settings(
    settings: TranscriptionSettings
):
    global model
    global current_settings

    # Valida o modelo escolhido
    if settings.model not in ALLOWED_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"Modelo inválido. Use: {ALLOWED_MODELS}"
        )

    # Beam size não pode ser menor que 1
    if settings.beam_size < 1:
        raise HTTPException(
            status_code=400,
            detail="beam_size deve ser maior ou igual a 1"
        )

    # Verifica se o modelo mudou
    model_changed = (
        settings.model
        != current_settings["model"]
    )

    # Carrega antes de atualizar para preservar a configuração se houver falha.
    if model_changed:
        model = WhisperModel(
            settings.model,
            device="cpu",
            compute_type="int8"
        )

    # Atualiza as configurações
    current_settings = {
        "model": settings.model,
        "beam_size": settings.beam_size,
        "vad_filter": settings.vad_filter,
        "language": settings.language
    }

    # Só recarrega o Whisper
    # se o modelo realmente mudou
    if model_changed:
        print(
            f"Trocando modelo para: {settings.model}"
        )

        print(
            f"Modelo {settings.model} carregado!"
        )

    return {
        "message": "Configurações atualizadas",
        "settings": current_settings
    }


# =========================
# TRANSCRIÇÃO
# =========================

@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...)
):
    suffix = os.path.splitext(
        file.filename or "audio.ogg"
    )[1]

    with tempfile.NamedTemporaryFile(
        delete=False,
        suffix=suffix
    ) as temp_file:

        content = await file.read()

        temp_file.write(content)

        temp_path = temp_file.name

    try:

        start_time = time.time()

        segments, info = model.transcribe(
            temp_path,

            language=current_settings[
                "language"
            ],

            beam_size=current_settings[
                "beam_size"
            ],

            vad_filter=current_settings[
                "vad_filter"
            ]
        )

        text = "".join(
            segment.text
            for segment in segments
        ).strip()

        elapsed_time = (
            time.time() - start_time
        )

        return {
            "text": text,

            "language": info.language,

            "elapsed_seconds": round(
                elapsed_time,
                2
            ),

            "settings_used":
                current_settings
        }

    finally:
        os.remove(temp_path)
