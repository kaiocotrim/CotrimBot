/**
 * Envia uma mensagem de texto pela Evolution API.
 *
 * Este service isola URL, autenticação, endpoint, headers e tratamento da resposta.
 * Assim, o controller coordena o caso de uso sem implementar comunicação HTTP.
 */
export declare function sendWhatsAppMessage(number: string, text: string): Promise<any>;
type ProfilePictureResponse = {
    profilePictureUrl?: string | null;
};
/** Busca a URL da foto de perfil de um contato na Evolution API. */
export declare function getProfilePicture(number: string): Promise<ProfilePictureResponse>;
export {};
//# sourceMappingURL=evolution.service.d.ts.map