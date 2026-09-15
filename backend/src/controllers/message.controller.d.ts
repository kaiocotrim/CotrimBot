import type { Request, Response } from "express";
export declare function getMessages(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function createMessage(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
/**
 * Controller do POST /contacts/:id/send.
 *
 * Coordena o fluxo de envio sem conhecer os detalhes da requisição HTTP feita à
 * Evolution API: route -> controller -> service -> Evolution API. Depois que a
 * Evolution confirma o envio, o controller usa o Prisma para persistir a mensagem.
 */
export declare function sendMessageToContact(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=message.controller.d.ts.map