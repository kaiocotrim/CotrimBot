export class SacApiError extends Error {
    status;
    body;
    constructor(status, body, message) {
        const bodyMessage = body && typeof body === "object"
            ? ("error" in body && typeof body.error === "string" ? body.error
                : "message" in body && typeof body.message === "string" ? body.message
                    : undefined)
            : typeof body === "string" && body ? body : undefined;
        super(message ?? bodyMessage ?? `A API do SAC respondeu com HTTP ${status}.`);
        this.name = "SacApiError";
        this.status = status;
        this.body = body;
    }
}
function encode(value) {
    return encodeURIComponent(String(value));
}
function withQuery(path, query) {
    if (!query)
        return path;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null)
            params.set(key, String(value));
    }
    const suffix = params.toString();
    return suffix ? `${path}?${suffix}` : path;
}
function tenantIds(value) {
    return Array.isArray(value) ? value.join(",") : value;
}
export class SacClient {
    apiUrl;
    fetcher;
    defaultHeaders;
    credentials;
    tokenProvider;
    constructor(options) {
        if (!options.baseUrl.trim())
            throw new TypeError("Informe a URL base do backend SAC.");
        let baseUrl = options.baseUrl.trim();
        while (baseUrl.endsWith("/"))
            baseUrl = baseUrl.slice(0, -1);
        this.apiUrl = baseUrl.endsWith("/api") ? baseUrl : `${baseUrl}/api`;
        this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
        this.defaultHeaders = new Headers(options.headers);
        this.tokenProvider = options.token;
        this.credentials = options.credentials ?? "omit";
    }
    /** Substitui o token usado nas próximas chamadas. */
    setToken(token) {
        this.tokenProvider = token;
    }
    auth = {
        /** Altera a senha do usuário dono do token (sessão Supabase). */
        resetPassword: (password) => this.json("/reset-password", "POST", { password }),
    };
    tenants = {
        list: () => this.request("/tenants"),
        create: (input) => this.json("/tenants", "POST", input),
        update: (id, input) => this.json(`/tenants/${encode(id)}`, "PUT", input),
        delete: (id) => this.json(`/tenants/${encode(id)}`, "DELETE"),
        /** Consulta pública pelo CNPJ: indica se já existe um tenant. */
        checkByCnpj: (cnpj) => this.request(withQuery("/check-tenant", { cnpj })),
        /** Localiza tenant, usuário e e-mails vinculados a um CPF/CNPJ. */
        verify: (cpfCnpj) => this.request(withQuery("/verify-tenant", { cpfCnpj })),
        /** Cria um tenant a partir de um CNPJ e vincula o usuário do token. */
        createFromCnpj: (input) => this.json("/create-tenant", "POST", input),
        join: (input) => this.json("/join-tenant", "POST", input),
        /** Para usuários @infordoc.com.br o backend devolve todos os tenants. */
        listForUser: (query) => this.request(withQuery("/user-tenants", query)),
        /** Usuários do Supabase que ainda não pertencem ao tenant. */
        availableUsers: (tenantId) => this.request(`/supabase-users/${encode(tenantId)}`),
    };
    tenantCnpjs = {
        list: (tenantId) => this.request(`/tenants/${encode(tenantId)}/cnpjs`),
        create: (tenantId, input) => this.json(`/tenants/${encode(tenantId)}/cnpjs`, "POST", input),
        update: (tenantId, cnpjId, input) => this.json(`/tenants/${encode(tenantId)}/cnpjs/${encode(cnpjId)}`, "PUT", input),
        delete: (tenantId, cnpjId) => this.json(`/tenants/${encode(tenantId)}/cnpjs/${encode(cnpjId)}`, "DELETE"),
    };
    tenantUsers = {
        list: (tenantId) => this.request(`/tenants/${encode(tenantId)}/usuarios`),
        create: (tenantId, input) => this.json(`/tenants/${encode(tenantId)}/usuarios`, "POST", input),
        update: (tenantId, userLinkId, input) => this.json(`/tenants/${encode(tenantId)}/usuarios/${encode(userLinkId)}`, "PUT", input),
        delete: (tenantId, userLinkId) => this.json(`/tenants/${encode(tenantId)}/usuarios/${encode(userLinkId)}`, "DELETE"),
    };
    clients = {
        /** Cadastro (clientes, endereços de entrega e e-mails) vinculado ao tenant. */
        list: (tenantId) => this.request(`/tenants/register/${encode(tenantId)}`),
        createEmail: (input) => this.json("/tenants/register/email", "POST", input),
        updateEmail: (emailId, input) => this.json(`/tenants/register/email/${encode(emailId)}`, "PUT", input),
        deleteEmail: (emailId) => this.json(`/tenants/register/email/${encode(emailId)}`, "DELETE"),
        createAddress: (input) => this.json("/tenants/register/address", "POST", input),
        updateAddress: (addressId, input) => this.json(`/tenants/register/address/${encode(addressId)}`, "PUT", input),
        deleteAddress: (addressId) => this.json(`/tenants/register/address/${encode(addressId)}`, "DELETE"),
    };
    invoices = {
        list: (tenantId) => this.request(withQuery("/invoices", { IdTenant: tenantIds(tenantId) })),
        overview: (tenantId) => this.request(withQuery("/invoicesoverview", { tenantId })),
        financialStatus: (tenantId) => this.request(withQuery("/invoices/financial-status", { tenantId })),
        /** Solicita negociação de uma fatura vencida; o backend envia e-mail ao financeiro e ao usuário. */
        negotiate: (input) => this.json("/invoices/negotiate", "POST", input),
        /** PDF da fatura. */
        invoicePdf: (idFatura) => this.blob(withQuery("/visualizarFatura", { idFatura })),
        /** PDF do boleto. */
        boletoPdf: (idFatura) => this.blob(`/visualizarBoleto/${encode(idFatura)}`),
        /** PDF da NFS-e. */
        nfsePdf: (nf, verificationCode) => this.blob(`/visualizarNFSe/${encode(nf)}/${encode(verificationCode)}`),
        pixQrCode: (paymentId) => this.request(`/asaas/payment/${encode(paymentId)}/pix-qrcode`),
    };
    tickets = {
        list: (tenantId) => this.request(withQuery("/tickets", { IdTenant: tenantIds(tenantId) })),
        overview: (tenantId) => this.request(withQuery("/ticketsoverview", { tenantId })),
        status: (tenantId) => this.request(withQuery("/tickets/status", { tenantId })),
        /** Falha com 403 quando o tenant está bloqueado por pendências financeiras. */
        create: (input) => this.json("/newTicket", "POST", input),
        updateAttachment: (input) => this.json("/updateTicketAttachment", "POST", input),
        /** Remove o anexo do chamado no storage pelo número de protocolo. */
        deleteAttachment: (protocol) => this.json(`/deleteFileFromStorage/${encode(protocol)}`, "DELETE"),
    };
    machines = {
        list: (tenantId) => this.request(withQuery("/maquinas", { IdTenant: tenantIds(tenantId) })),
    };
    addresses = {
        list: (tenantId) => this.request(withQuery("/enderecos", { IdTenant: tenantIds(tenantId) })),
    };
    users = {
        list: () => this.request("/users"),
        update: (userId, input) => this.json(`/update-user/${encode(userId)}`, "PUT", input),
        updatePassword: (userId, password) => this.json(`/update-password/${encode(userId)}`, "PUT", { password }),
        delete: (userId) => this.json(`/delete-user/${encode(userId)}`, "DELETE"),
        /** Adiciona o tenant ao metadata do usuário no Supabase. */
        joinTenant: (input) => this.json("/join-tenant-supabase", "POST", input),
        leaveTenant: (input) => this.json("/leave-tenant-supabase", "POST", input),
        uploadAvatar: (input) => {
            const form = new FormData();
            form.append("file", input.file, input.fileName);
            return this.upload("/upload-avatar", form);
        },
    };
    storage = {
        /** Baixa um arquivo do Supabase Storage. `avatars` e `chamado-anexos` dispensam autenticação no backend. */
        download: (bucket, filePath) => this.blob(`/download/${encode(bucket)}/${filePath.split("/").map(encode).join("/")}`),
        downloadFromNextcloud: (filePath) => this.blob(withQuery("/download-from-nextcloud", { filePath })),
    };
    tokens = {
        /** O valor do token só é devolvido nesta chamada. */
        create: (input = {}) => this.json("/tokens", "POST", input),
        list: () => this.request("/tokens"),
        get: (id) => this.request(`/tokens/${encode(id)}`),
        setActive: (id, isActive) => this.json(`/tokens/${encode(id)}`, "PATCH", { is_active: isActive }),
        delete: (id) => this.json(`/tokens/${encode(id)}`, "DELETE"),
    };
    request(path, init = {}) {
        return this.perform(path, init, "json");
    }
    json(path, method, body) {
        const headers = new Headers();
        if (body !== undefined)
            headers.set("Content-Type", "application/json");
        return this.perform(path, {
            method,
            headers,
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        }, "json");
    }
    upload(path, body) {
        return this.perform(path, { method: "POST", body }, "json");
    }
    blob(path) {
        return this.perform(path, {}, "blob");
    }
    async perform(path, init, responseType) {
        const url = `${this.apiUrl}${path.startsWith("/") ? path : `/${path}`}`;
        const headers = new Headers(this.defaultHeaders);
        const token = typeof this.tokenProvider === "function" ? await this.tokenProvider() : this.tokenProvider;
        if (token && !headers.has("authorization"))
            headers.set("Authorization", `Bearer ${token}`);
        new Headers(init.headers).forEach((value, key) => headers.set(key, value));
        const response = await this.fetcher(url, {
            ...init,
            headers,
            credentials: init.credentials ?? this.credentials,
        });
        if (!response.ok) {
            const text = await response.text();
            let body = text;
            try {
                body = text ? JSON.parse(text) : null;
            }
            catch {
                body = text;
            }
            throw new SacApiError(response.status, body);
        }
        if (response.status === 204 || response.status === 205)
            return undefined;
        if (responseType === "blob")
            return await response.blob();
        const text = await response.text();
        return (text ? JSON.parse(text) : undefined);
    }
}
