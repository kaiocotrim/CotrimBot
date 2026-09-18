// Multer processa requisições multipart/form-data enviadas pelo frontend/Postman.
import multer from "multer";

// Exporta a configuração usada por upload.single("file") nas rotas.
// memoryStorage mantém os bytes em req.file.buffer, sem gravar arquivos em disco.
// O controller também recebe nome, tipo e tamanho do arquivo em req.file.
export const upload = multer({
  storage: multer.memoryStorage(),
});
