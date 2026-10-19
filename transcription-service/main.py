from contextlib import asynccontextmanager
import asyncio
import logging
from pathlib import Path
import os
import tempfile
import time

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
from pydantic import BaseModel


ALLOWED_MODELS = ["tiny", "base", "small", "medium"]

current_settings = {
    "model": "base",
    "beam_size": 1,
    "vad_filter": True,
    "language": "pt",
}

LOCAL_APP_DATA = Path(
    os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")
)
DATA_DIR = LOCAL_APP_DATA / "CotrimBot" / "Transcritor"
MODEL_DIR = DATA_DIR / "models"
LOG_DIR = DATA_DIR / "logs"
LOG_FILE = LOG_DIR / "service.log"

try:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        filename=LOG_FILE,
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
except OSError:
    logging.basicConfig(level=logging.INFO)

logger = logging.getLogger("cotrimbot.transcription")
model: WhisperModel | None = None
model_error: str | None = None


class TranscriptionSettings(BaseModel):
    model: str
    beam_size: int
    vad_filter: bool
    language: str


def _model_cache_exists(model_name: str) -> bool:
    if not MODEL_DIR.exists():
        return False
    return any(MODEL_DIR.glob(f"*{model_name}*"))


def load_model(model_name: str) -> WhisperModel:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    if _model_cache_exists(model_name):
        logger.info("Carregando modelo '%s' do cache local em %s", model_name, MODEL_DIR)
    else:
        logger.info(
            "Modelo '%s' não encontrado no cache. O download será iniciado em %s.",
            model_name,
            MODEL_DIR,
        )

    try:
        loaded_model = WhisperModel(
            model_name,
            device="cpu",
            compute_type="int8",
            download_root=str(MODEL_DIR),
        )
    except Exception:
        logger.exception(
            "Falha ao carregar o modelo '%s'. Verifique a conexão na primeira "
            "execução e o espaço disponível em %s.",
            model_name,
            MODEL_DIR,
        )
        raise

    logger.info("Modelo '%s' carregado usando CPU/INT8.", model_name)
    return loaded_model


@asynccontextmanager
async def lifespan(_app: FastAPI):
    async def initialize_model():
        global model, model_error
        try:
            model = await asyncio.to_thread(load_model, current_settings["model"])
        except Exception:
            model_error = "Falha ao carregar o modelo. Verifique a conexão e o log local."

    task = asyncio.create_task(initialize_model())
    yield
    await task
    global model
    model = None
    logger.info("Serviço de transcrição encerrado.")


app = FastAPI(lifespan=lifespan)

# The browser sends audio directly to the user's loopback service. Explicit
# origins can be supplied for hosted installations; localhost covers development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.environ.get(
        "TRANSCRIPTION_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://127.0.0.1:3100"
    ).split(",") if origin.strip()],
    allow_methods=["GET", "PUT", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/")
def health():
    return {
        "status": "ok" if model is not None else "error" if model_error else "loading",
        "service": "CotrimBot Transcription",
        "detail": model_error,
    }


@app.get("/settings")
def get_settings():
    return current_settings


@app.put("/settings")
def update_settings(settings: TranscriptionSettings):
    global model, current_settings

    if model is None:
        raise HTTPException(status_code=503, detail=model_error or "Aguarde o carregamento do modelo.")

    if settings.model not in ALLOWED_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"Modelo inválido. Use: {ALLOWED_MODELS}",
        )

    if settings.beam_size < 1:
        raise HTTPException(
            status_code=400,
            detail="beam_size deve ser maior ou igual a 1",
        )

    model_changed = settings.model != current_settings["model"]
    if model_changed:
        try:
            new_model = load_model(settings.model)
        except Exception as exc:
            raise HTTPException(
                status_code=503,
                detail=(
                    f"Não foi possível carregar o modelo '{settings.model}'. "
                    "Verifique a conexão e o log local."
                ),
            ) from exc
        model = new_model

    current_settings = {
        "model": settings.model,
        "beam_size": settings.beam_size,
        "vad_filter": settings.vad_filter,
        "language": settings.language,
    }

    if model_changed:
        logger.info("Modelo alterado para '%s'.", settings.model)

    return {
        "message": "Configurações atualizadas",
        "settings": current_settings,
    }


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    if model is None:
        raise HTTPException(
            status_code=503,
            detail="O modelo de transcrição ainda não está disponível.",
        )

    suffix = Path(file.filename or "audio.ogg").suffix or ".ogg"
    suffix = suffix[:16]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        content = await file.read()
        temp_file.write(content)
        temp_path = temp_file.name

    try:
        start_time = time.time()
        segments, info = model.transcribe(
            temp_path,
            language=current_settings["language"],
            beam_size=current_settings["beam_size"],
            vad_filter=current_settings["vad_filter"],
        )
        text = "".join(segment.text for segment in segments).strip()
        elapsed_time = time.time() - start_time
        return {
            "text": text,
            "language": info.language,
            "elapsed_seconds": round(elapsed_time, 2),
            "settings_used": current_settings,
        }
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            logger.warning("Não foi possível remover o arquivo temporário %s.", temp_path)
