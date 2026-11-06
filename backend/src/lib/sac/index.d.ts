export type JsonValue = string | number | boolean | null | JsonValue[] | {
    [key: string]: JsonValue;
};
export type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue>;
/** Um GUID de tenant ou uma lista deles (enviada ao backend separada por vírgula). */
export type TenantIds = string | string[];
export type TokenProvider = string | (() => string | undefined | Promise<string | undefined>);
export interface SacClientOptions {
    baseUrl: string;
    /**
     * Token Bearer: um token de API gerado em Tokens (não expira por padrão) ou o access token
     * de sessão do Supabase. Aceita uma função para obter/renovar o token a cada chamada.
     */
    token?: TokenProvider;
    fetch?: typeof fetch;
    headers?: HeadersInit;
    credentials?: RequestCredentials;
}
export declare class SacApiError extends Error {
    readonly status: number;
    readonly body: unknown;
    constructor(status: number, body: unknown, message?: string);
}
export interface Tenant {
    IdTenant: string;
    tenantName: string | null;
}
export interface TenantCnpj {
    IdCNPJ: string;
    IdTenant: string;
    CNPJ: string;
}
export interface TenantMembership {
    IdUsuario: string;
    IdTenant: string;
    IdPessoa: string;
    isAdm: boolean;
    isActive: boolean;
}
export interface TenantUser extends TenantMembership {
    email: string;
}
export interface TenantMembershipInput {
    IdPessoa: string;
    isAdm: boolean;
    isActive: boolean;
}
export interface TenantCheck {
    valido: boolean;
    TenantName: string | null;
    IdTenant: string | null;
}
export interface TenantLookup {
    IdTenant: string;
    tenantName: string | null;
    CNPJ: string;
    IdUsuario: string | null;
    IdPessoa: string | null;
    email: string | null;
}
export interface FinancialStatus {
    isBlocked: boolean;
    overdueCount: number;
    overdueOver90DaysCount: number;
    reasons: string[];
}
export interface InvoicesOverview {
    FaturasPendentes: number;
    ValorPendente: number | null;
    TotalVencidas: number;
}
export interface Invoice {
    Fatura: number;
    Parcela: number;
    CodigoContrato: string;
    Emisao: string | null;
    Vencimento: string | null;
    Pagamento: string | null;
    asaasPaymentId: string | null;
    VrCobrado: number;
    pixQrCode2: string | null;
    itauBoletoId: string | number | null;
    Negociado: boolean;
    NNF: number | string | null;
    codigoVerificacao: string | null;
    Nome: string;
}
export interface TicketsOverview {
    Total: number;
    EmAberto: number;
}
export interface TicketsStatus {
    total: number;
    aberto: number;
    atendido: number;
}
export interface Ticket {
    IdChamado: number;
    Obs: string | null;
    NrSerie: string | null;
    InicioAtend: string | null;
    FimAtend: string | null;
    Equipamento: string | null;
    StatusChamado: string | null;
    Data: string;
    Solicitante: string;
    Motivo: string;
    Tecnico: string | null;
    Departamento: string | null;
    FoneContato: string | null;
    EnderecoAtend: string | null;
    Presencial_Remoto: string | null;
    EmailContato: string | null;
    caminhoAnexo: string | null;
    CodigoContrato: string | null;
    Cliente: string | null;
}
export interface TicketCreateInput {
    IdTenant: string;
    IdEstoque: number;
    Solicitante: string;
    Motivo: string;
    Departamento: string;
    Telefone: string;
    Endereco: string;
    Email: string;
    IdContrato?: number;
    /** Identificador IdEstoque do equipamento selecionado. */
    Maquina?: number;
    /** Padrão no backend: "SAC". */
    Origem?: string;
}
export interface Machine {
    /** O backend seleciona a coluna duas vezes; o driver pode devolver um array. */
    Descricao: string | string[];
    IdEstoque: number | string;
}
export interface Address {
    endereco: string;
}
export interface RegisteredEmail {
    IdEmail: number;
    email: string;
    cobranca: boolean;
    tecnico: boolean;
    notificacao: boolean;
}
export interface RegisteredDeliveryAddress {
    IdClienteEnd: number;
    enderecoEntrega: string;
    cepEntrega: string;
    numeroEntrega: string;
    complementoEntrega: string | null;
    bairroEntrega: string;
    cidadeEntrega: string;
    ufEntrega: string;
    cobranca: boolean;
    entrega: boolean;
}
export interface RegisteredClient {
    IdCliente: number;
    nomeEmpresa: string;
    cnpj: string;
    endereco: string;
    cep: string;
    numero: string;
    complemento: string | null;
    bairro: string;
    cidade: string;
    uf: string;
    ativo: boolean;
    ie: string | null;
    enderecosEntrega: RegisteredDeliveryAddress[];
    emailSubscriptions: RegisteredEmail[];
}
export interface ClientEmailInput {
    IdCliente: number;
    Email: string;
    UsuarioCadastro: string;
    TipoCobranca: boolean;
    TipoTecnico: boolean;
    TipoPadrao: boolean;
    TipoNotificacao: boolean;
}
export interface ClientAddressInput {
    IdCliente: number;
    Endereco: string;
    Numero: number;
    Complemento?: string | null;
    CEP: string;
    Bairro: string;
    Cidade: string;
    UF: string;
    Cobranca: boolean;
    Entrega: boolean;
}
export interface ApiToken {
    id: string;
    token_prefix: string;
    token_suffix: string;
    description: string | null;
    expires_at: string | null;
    created_at: string;
    is_active: boolean;
    user_id: string;
    owner_email: string;
}
export interface ApiTokenCreateInput {
    description?: string;
    /** Data ISO; sem ela o token só expira em 2999-12-31. */
    expiresAt?: string;
}
/** Usuário do Supabase Auth, no formato devolvido pelas rotas administrativas. */
export interface SupabaseUser {
    id: string;
    email?: string;
    user_metadata?: {
        full_name?: string;
        Tenants?: string[];
        [key: string]: unknown;
    };
    [key: string]: unknown;
}
export interface FileUpload {
    file: Blob;
    fileName: string;
}
export declare class SacClient {
    private readonly apiUrl;
    private readonly fetcher;
    private readonly defaultHeaders;
    private readonly credentials;
    private tokenProvider?;
    constructor(options: SacClientOptions);
    /** Substitui o token usado nas próximas chamadas. */
    setToken(token: TokenProvider | undefined): void;
    readonly auth: {
        /** Altera a senha do usuário dono do token (sessão Supabase). */
        resetPassword: (password: string) => Promise<{
            message: string;
            data: unknown;
        }>;
    };
    readonly tenants: {
        list: () => Promise<Tenant[]>;
        create: (input: {
            tenantName: string;
        }) => Promise<Tenant>;
        update: (id: string, input: {
            tenantName: string;
        }) => Promise<Tenant>;
        delete: (id: string) => Promise<{
            message: string;
        }>;
        /** Consulta pública pelo CNPJ: indica se já existe um tenant. */
        checkByCnpj: (cnpj: string) => Promise<TenantCheck[]>;
        /** Localiza tenant, usuário e e-mails vinculados a um CPF/CNPJ. */
        verify: (cpfCnpj: string) => Promise<TenantLookup[]>;
        /** Cria um tenant a partir de um CNPJ e vincula o usuário do token. */
        createFromCnpj: (input: {
            cnpj: string;
            email: string;
        }) => Promise<unknown>;
        join: (input: {
            email: string;
            userId: string;
            idTenant: string;
        }) => Promise<unknown>;
        /** Para usuários @infordoc.com.br o backend devolve todos os tenants. */
        listForUser: (query: {
            userId?: string;
            userMail?: string;
        }) => Promise<Tenant[]>;
        /** Usuários do Supabase que ainda não pertencem ao tenant. */
        availableUsers: (tenantId: string) => Promise<SupabaseUser[]>;
    };
    readonly tenantCnpjs: {
        list: (tenantId: string) => Promise<TenantCnpj[]>;
        create: (tenantId: string, input: {
            CNPJ: string;
        }) => Promise<TenantCnpj>;
        update: (tenantId: string, cnpjId: string, input: {
            CNPJ: string;
        }) => Promise<TenantCnpj>;
        delete: (tenantId: string, cnpjId: string) => Promise<{
            message: string;
        }>;
    };
    readonly tenantUsers: {
        list: (tenantId: string) => Promise<TenantUser[]>;
        create: (tenantId: string, input: TenantMembershipInput) => Promise<TenantMembership>;
        update: (tenantId: string, userLinkId: string, input: TenantMembershipInput) => Promise<TenantMembership>;
        delete: (tenantId: string, userLinkId: string) => Promise<{
            message: string;
        }>;
    };
    readonly clients: {
        /** Cadastro (clientes, endereços de entrega e e-mails) vinculado ao tenant. */
        list: (tenantId: string) => Promise<RegisteredClient[]>;
        createEmail: (input: ClientEmailInput) => Promise<{
            message: string;
        }>;
        updateEmail: (emailId: number, input: ClientEmailInput) => Promise<{
            message: string;
        }>;
        deleteEmail: (emailId: number) => Promise<{
            message: string;
        }>;
        createAddress: (input: ClientAddressInput) => Promise<{
            message: string;
        }>;
        updateAddress: (addressId: number, input: ClientAddressInput) => Promise<{
            message: string;
        }>;
        deleteAddress: (addressId: number) => Promise<{
            message: string;
        }>;
    };
    readonly invoices: {
        list: (tenantId: TenantIds) => Promise<Invoice[]>;
        overview: (tenantId: string) => Promise<InvoicesOverview>;
        financialStatus: (tenantId: string) => Promise<FinancialStatus>;
        /** Solicita negociação de uma fatura vencida; o backend envia e-mail ao financeiro e ao usuário. */
        negotiate: (input: {
            tenantId: string;
            idFatura: number;
        }) => Promise<{
            success: boolean;
        }>;
        /** PDF da fatura. */
        invoicePdf: (idFatura: number) => Promise<Blob>;
        /** PDF do boleto. */
        boletoPdf: (idFatura: number) => Promise<Blob>;
        /** PDF da NFS-e. */
        nfsePdf: (nf: string | number, verificationCode: string) => Promise<Blob>;
        pixQrCode: (paymentId: string) => Promise<JsonValue>;
    };
    readonly tickets: {
        list: (tenantId: TenantIds) => Promise<Ticket[]>;
        overview: (tenantId: string) => Promise<TicketsOverview>;
        status: (tenantId: string) => Promise<TicketsStatus[]>;
        /** Falha com 403 quando o tenant está bloqueado por pendências financeiras. */
        create: (input: TicketCreateInput) => Promise<JsonValue>;
        updateAttachment: (input: {
            IdChamado: number;
            path: string;
        }) => Promise<{
            IdChamado: number;
            caminhoAnexo: string;
        }[]>;
        /** Remove o anexo do chamado no storage pelo número de protocolo. */
        deleteAttachment: (protocol: string | number) => Promise<{
            message: string;
        }>;
    };
    readonly machines: {
        list: (tenantId: TenantIds) => Promise<Machine[]>;
    };
    readonly addresses: {
        list: (tenantId: TenantIds) => Promise<Address[]>;
    };
    readonly users: {
        list: () => Promise<SupabaseUser[]>;
        update: (userId: string, input: {
            email?: string;
            full_name?: string;
        }) => Promise<{
            message: string;
            data: unknown;
        }>;
        updatePassword: (userId: string, password: string) => Promise<{
            message: string;
            data: unknown;
        }>;
        delete: (userId: string) => Promise<{
            message: string;
        }>;
        /** Adiciona o tenant ao metadata do usuário no Supabase. */
        joinTenant: (input: {
            userId: string;
            tenantId: string;
        }) => Promise<unknown>;
        leaveTenant: (input: {
            userId: string;
            tenantId: string;
        }) => Promise<unknown>;
        uploadAvatar: (input: FileUpload) => Promise<{
            avatar_url: string;
        }>;
    };
    readonly storage: {
        /** Baixa um arquivo do Supabase Storage. `avatars` e `chamado-anexos` dispensam autenticação no backend. */
        download: (bucket: string, filePath: string) => Promise<Blob>;
        downloadFromNextcloud: (filePath: string) => Promise<Blob>;
    };
    readonly tokens: {
        /** O valor do token só é devolvido nesta chamada. */
        create: (input?: ApiTokenCreateInput) => Promise<{
            token: string;
        }>;
        list: () => Promise<{
            tokens: ApiToken[];
        }>;
        get: (id: string) => Promise<{
            token: ApiToken;
        }>;
        setActive: (id: string, isActive: boolean) => Promise<{
            success: boolean;
        }>;
        delete: (id: string) => Promise<{
            success: boolean;
        }>;
    };
    request<T = unknown>(path: string, init?: RequestInit): Promise<T>;
    private json;
    private upload;
    private blob;
    private perform;
}
