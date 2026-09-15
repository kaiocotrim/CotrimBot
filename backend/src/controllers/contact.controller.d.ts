import type { Request, Response } from "express";
export declare function getContacts(_req: Request, res: Response): Promise<void>;
export declare function getContactById(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function getContactAvatar(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function createContact(req: Request, res: Response): Promise<void>;
export declare function updateContact(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function deleteContact(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=contact.controller.d.ts.map