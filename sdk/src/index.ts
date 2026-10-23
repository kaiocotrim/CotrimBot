export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue>;

export interface CotrimBotClientOptions {
  baseUrl: string;
  token?: string;
  auth?: { email: string; password: string };
  fetch?: typeof fetch;
  headers?: HeadersInit;
  credentials?: RequestCredentials;
}

export class CotrimBotApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    const bodyMessage = body && typeof body === "object"
      ? ("error" in body && typeof body.error === "string" ? body.error
        : "message" in body && typeof body.message === "string" ? body.message
          : undefined)
      : undefined;
    super(message ?? bodyMessage ?? `A API do CotrimBot respondeu com HTTP ${status}.`);
    this.name = "CotrimBotApiError";
    this.status = status;
    this.body = body;
  }
}

export interface Contact {
  id: number;
  name: string;
  companyName: string | null;
  jobTitle: string | null;
  phone: string;
  createdAt: string;
  updatedAt: string;
  isGroup: boolean;
  isSaved: boolean;
  archived: boolean;
  pinned: boolean;
  priority: "LOW" | "MEDIUM" | "HIGH" | "NONE";
  profilePictureUrl: string | null;
  whatsappLid: string | null;
  assignedUserIds?: string[];
}

export interface Message {
  id: number;
  content: string;
  direction: "INCOMING" | "OUTGOING";
  contactId: number;
  createdAt: string;
  externalId: string;
  readAt: string | null;
  type: "TEXT" | "SYSTEM" | "IMAGE" | "STICKER" | "VIDEO" | "AUDIO" | "DOCUMENT" | "CONTACT" | "POLL";
  reaction: string | null;
  senderName: string | null;
  senderPhone: string | null;
  sentByUserId: string | null;
  private: boolean;
  pinned: boolean;
  favorited: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  companyName: string | null;
  description: string | null;
  startsAt: string;
  endsAt: string;
  category: "MEETING" | "TRAINING" | "DEADLINE" | "APPOINTMENT" | "OTHER";
  isPublic: boolean;
  completedAt: string | null;
}

export interface ScheduledMessage {
  id: string;
  phone: string;
  content: string;
  scheduledAt: string;
  status: "PENDING" | "PROCESSING" | "SENT" | "FAILED";
  sentAt: string | null;
  error: string | null;
}

export interface ClientProfile {
  id: string;
  name: string;
  image: string | null;
  links: string[];
  createdAt: string;
  canDelete: boolean;
}

export interface Bot {
  id: string;
  organizationId: string;
  name: string;
  draft: JsonValue;
  published: JsonValue | null;
  revision: number;
  publishedRevision: number;
}

export interface FileUpload {
  file: Blob;
  fileName: string;
  caption?: string;
}

function encode(value: string | number): string {
  return encodeURIComponent(String(value));
}

function withQuery(path: string, query?: object): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query) as [string, QueryValue][]) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export class CotrimBotClient {
  private readonly apiUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly defaultHeaders: Headers;
  private readonly credentials: RequestCredentials;
  private readonly authCredentials?: { email: string; password: string };
  private authToken?: string;
  private activeOrganizationId?: string;
  private automaticAuthEnabled: boolean;
  private authenticationPromise?: Promise<unknown>;

  constructor(options: CotrimBotClientOptions) {
    if (!options.baseUrl.trim()) throw new TypeError("Informe a URL base do backend CotrimBot.");
    let baseUrl = options.baseUrl.trim();
    while (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
    this.apiUrl = baseUrl.endsWith("/api") ? baseUrl : `${baseUrl}/api`;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.defaultHeaders = new Headers(options.headers);
    this.authToken = options.token;
    this.authCredentials = options.auth;
    this.automaticAuthEnabled = Boolean(options.auth);
    this.credentials = options.credentials ?? (options.token ? "omit" : "include");

    this.auth = {
      signInEmail: (input) => {
        this.automaticAuthEnabled = true;
        return this.json("/auth/sign-in/email", "POST", input, true);
      },
      signOut: async () => {
        const result = await this.json("/auth/sign-out", "POST", {}, true);
        this.authToken = undefined;
        this.activeOrganizationId = undefined;
        this.automaticAuthEnabled = false;
        return result;
      },
      getSession: () => this.request("/auth/get-session"),
      getToken: () => this.authToken,
      setActiveOrganization: async (organizationId) => {
        const result = await this.json("/auth/organization/set-active", "POST", { organizationId });
        this.activeOrganizationId = organizationId;
        return result;
      },
    };

    this.contacts = {
      list: (query) => this.request(withQuery("/contacts", query)),
      search: (query) => this.request(withQuery("/contacts/search", query)),
      assignees: () => this.request("/contacts/assignees"),
      get: (id) => this.request(`/contacts/${encode(id)}`),
      avatar: (id) => this.request(`/contacts/${encode(id)}/avatar`),
      groupParticipants: (id) => this.request(`/contacts/${encode(id)}/group-participants`),
      create: (input) => this.json("/contacts", "POST", input),
      startConversation: (input) => this.json("/contacts/conversation", "POST", input),
      subscribePresence: (id, input = {}) => this.json(`/contacts/${encode(id)}/presence-subscription`, "POST", input),
      update: (id, input) => this.json(`/contacts/${encode(id)}`, "PATCH", input),
      setSaved: (id, isSaved) => this.json(`/contacts/${encode(id)}/saved`, "PATCH", { isSaved }),
      setArchived: (id, archived) => this.json(`/contacts/${encode(id)}/archived`, "PATCH", { archived }),
      setPinned: (id, pinned) => this.json(`/contacts/${encode(id)}/pinned`, "PATCH", { pinned }),
      setAssignment: (id, assignedUserIds) => this.json(`/contacts/${encode(id)}/assignment`, "PATCH", { assignedUserIds }),
      setPriority: (id, priority) => this.json(`/contacts/${encode(id)}/priority`, "PATCH", { priority }),
      delete: (id) => this.json(`/contacts/${encode(id)}`, "DELETE"),
    };

    this.messages = {
      mediaLibrary: (query) => this.request(withQuery("/media-library", query)),
      list: (contactId, query) => this.request(withQuery(`/contacts/${encode(contactId)}/messages`, query)),
      favorites: (contactId, query) => this.request(withQuery(`/contacts/${encode(contactId)}/messages/favorites`, query)),
      sendText: (contactId, input) => this.json(`/contacts/${encode(contactId)}/send`, "POST", input),
      sendPoll: (contactId, input) => this.json(`/contacts/${encode(contactId)}/send-poll`, "POST", input),
      poll: (messageId) => this.request(`/messages/${encode(messageId)}/poll`),
      pollVoterAvatar: (messageId, voterId) => this.request(withQuery(`/messages/${encode(messageId)}/poll/voter-avatar`, { voterId })),
      voteOnPoll: (messageId, optionIndexes) => this.json(`/messages/${encode(messageId)}/poll/vote`, "PUT", { optionIndexes }),
      closeWithBot: (contactId) => this.json(`/contacts/${encode(contactId)}/close-with-bot`, "POST", {}),
      markRead: (contactId) => this.json(`/contacts/${encode(contactId)}/messages/read`, "PATCH"),
      media: (messageId, query) => this.blob(withQuery(`/messages/${encode(messageId)}/media`, {
        download: query?.download ? "1" : undefined,
      })),
      senderAvatar: (messageId) => this.request(`/messages/${encode(messageId)}/sender-avatar`),
      info: (messageId) => this.request(`/messages/${encode(messageId)}/info`),
      react: (messageId, reaction) => this.json(`/messages/${encode(messageId)}/reaction`, "PUT", { reaction: reaction ?? "" }),
      updateFlags: (messageId, input) => this.json(`/messages/${encode(messageId)}/flags`, "PATCH", input),
      delete: (messageId, scope) => this.json(withQuery(`/messages/${encode(messageId)}`, { scope }), "DELETE"),
      transcribe: (messageId) => this.json(`/messages/${encode(messageId)}/transcribe`, "POST", {}),
      sendMedia: (contactId, input) => {
        const form = new FormData();
        form.append("file", input.file, input.fileName);
        if (input.caption !== undefined) form.append("caption", input.caption);
        return this.upload(`/contacts/${encode(contactId)}/send-media`, form);
      },
    };

    this.ai = {
      translate: (text) => this.json("/ai/translate", "POST", { text }),
      rewrite: (text) => this.json("/ai/rewrite", "POST", { text }),
    };

    this.transcription = {
      getSettings: () => this.request("/transcription/settings"),
      updateSettings: (input) => this.json("/transcription/settings", "PUT", input),
    };

    this.notifications = {
      list: (query) => this.request(withQuery("/notifications", query)),
      markAllRead: () => this.json("/notifications/read-all", "PATCH"),
      markContactRead: (contactId) => this.json(`/notifications/contact/${encode(contactId)}/read`, "PATCH"),
      markRead: (id) => this.json(`/notifications/${encode(id)}/read`, "PATCH"),
      clear: () => this.json("/notifications", "DELETE"),
    };

    this.push = {
      publicKey: () => this.request("/push/public-key"),
      subscribe: (input) => this.json("/push/subscribe", "POST", input),
      unsubscribe: (endpoint) => this.json("/push/unsubscribe", "POST", { endpoint }),
    };

    this.evolution = {
      connection: () => this.request("/evolution/connection"),
      qrcode: () => this.request("/evolution/qrcode"),
      disconnect: () => this.json("/evolution/connection", "DELETE"),
      callSettings: () => this.request("/evolution/call-settings"),
      updateCallSettings: (input) => this.json("/evolution/call-settings", "PUT", input),
    };

    this.bots = {
      list: () => this.request("/bots"),
      create: (input) => this.json("/bots", "POST", input),
      update: (id, input) => this.json(`/bots/${encode(id)}`, "PUT", input),
      publish: (id, revision) => this.json(`/bots/${encode(id)}/publish`, "POST", { revision }),
      setActivation: (id, active) => this.json(`/bots/${encode(id)}/activation`, "POST", { active }),
      simulate: (input) => this.json("/bots/simulate", "POST", input),
      uploadImage: (input) => {
        const form = new FormData();
        form.append("file", input.file, input.fileName);
        return this.upload("/bots/images", form);
      },
      image: (imageId) => this.blob(`/bots/images/${encode(imageId)}`),
    };

    this.organizations = {
      workspace: (organizationId) => this.request(`/organizations/${encode(organizationId)}/workspace`),
      internalMessages: (organizationId, query) =>
        this.request(withQuery(`/organizations/${encode(organizationId)}/internal-messages`, query)),
      sendInternalMessage: (organizationId, content) =>
        this.json(`/organizations/${encode(organizationId)}/internal-messages`, "POST", { content }),
      updateProfile: (organizationId, input) => this.json(`/organizations/${encode(organizationId)}/profile`, "PATCH", input),
      createGroup: (organizationId, input) => this.json(`/organizations/${encode(organizationId)}/groups`, "POST", input),
      updateGroup: (organizationId, groupId, input) =>
        this.json(`/organizations/${encode(organizationId)}/groups/${encode(groupId)}`, "PUT", input),
      deleteGroup: (organizationId, groupId) =>
        this.json(`/organizations/${encode(organizationId)}/groups/${encode(groupId)}`, "DELETE"),
      updateMemberProfile: (organizationId, memberId, input) =>
        this.json(`/organizations/${encode(organizationId)}/members/${encode(memberId)}/profile`, "PATCH", input),
      updateInvitationProfile: (organizationId, invitationId, input) =>
        this.json(`/organizations/${encode(organizationId)}/invitations/${encode(invitationId)}/profile`, "PATCH", input),
    };

    this.internalConversations = {
      bootstrap: (organizationId) => this.request(this.internalPath(organizationId, "/bootstrap")),
      members: (organizationId) => this.request(this.internalPath(organizationId, "/members")),
      list: (organizationId) => this.request(this.internalPath(organizationId)),
      create: (organizationId, input) => this.json(this.internalPath(organizationId), "POST", input),
      get: (organizationId, conversationId) => this.request(this.internalPath(organizationId, `/${encode(conversationId)}`)),
      updatePreferences: (organizationId, conversationId, input) =>
        this.json(this.internalPath(organizationId, `/${encode(conversationId)}/preferences`), "PATCH", input),
      updateAvatar: (organizationId, conversationId, input) =>
        this.json(this.internalPath(organizationId, `/${encode(conversationId)}/avatar`), "PATCH", input),
      messages: (organizationId, conversationId, query) =>
        this.request(withQuery(this.internalPath(organizationId, `/${encode(conversationId)}/messages`), query)),
      sendMessage: (organizationId, conversationId, input) =>
        this.json(this.internalPath(organizationId, `/${encode(conversationId)}/messages`), "POST", input),
      sendMedia: (organizationId, conversationId, input) =>
        this.internalUpload(organizationId, conversationId, "media", input),
      sendImage: (organizationId, conversationId, input) =>
        this.internalUpload(organizationId, conversationId, "images", input),
      media: (organizationId, conversationId, messageId, options) => this.blob(withQuery(
        this.internalPath(organizationId, `/${encode(conversationId)}/messages/${encode(messageId)}/media`),
        { download: options?.download ? "1" : undefined },
      ), options?.range ? { Range: options.range } : undefined),
      transcribe: (organizationId, conversationId, messageId) =>
        this.json(this.internalPath(organizationId, `/${encode(conversationId)}/messages/${encode(messageId)}/transcribe`), "POST", {}),
      markRead: (organizationId, conversationId) =>
        this.json(this.internalPath(organizationId, `/${encode(conversationId)}/read`), "PATCH"),
      addReaction: (organizationId, conversationId, messageId, emoji) =>
        this.json(this.internalPath(organizationId, `/${encode(conversationId)}/messages/${encode(messageId)}/reactions`), "POST", { emoji }),
      removeReaction: (organizationId, conversationId, messageId) =>
        this.json(this.internalPath(organizationId, `/${encode(conversationId)}/messages/${encode(messageId)}/reactions`), "DELETE"),
      updateMessageFlags: (organizationId, conversationId, messageId, input) =>
        this.json(this.internalPath(organizationId, `/${encode(conversationId)}/messages/${encode(messageId)}/flags`), "PATCH", input),
      deleteMessage: (organizationId, conversationId, messageId) =>
        this.json(this.internalPath(organizationId, `/${encode(conversationId)}/messages/${encode(messageId)}`), "DELETE"),
      participants: (organizationId, conversationId) =>
        this.request(this.internalPath(organizationId, `/${encode(conversationId)}/participants`)),
      addParticipants: (organizationId, conversationId, userIds) =>
        this.json(this.internalPath(organizationId, `/${encode(conversationId)}/participants`), "POST", { participantIds: userIds }),
    };

    this.invitations = {
      get: (id) => this.request(`/invitations/${encode(id)}`),
      accept: (id, input) => this.json(`/invitations/${encode(id)}/accept`, "POST", input),
    };

    this.calendarEvents = {
      list: (query) => this.request(withQuery("/calendar-events", query)),
      create: (input) => this.json("/calendar-events", "POST", input),
      setCompleted: (id, completed) => this.json(`/calendar-events/${encode(id)}/completed`, "PATCH", { completed }),
      delete: (id) => this.json(`/calendar-events/${encode(id)}`, "DELETE"),
    };

    this.scheduledMessages = {
      list: (query) => this.request(withQuery("/scheduled-messages", query)),
      create: (input) => this.json("/scheduled-messages", "POST", input),
      delete: (id) => this.json(`/scheduled-messages/${encode(id)}`, "DELETE"),
    };

    this.clients = {
      list: () => this.request("/clients"),
      create: (input) => this.json("/clients", "POST", input),
      update: (id, input) => this.json(`/clients/${encode(id)}`, "PUT", input),
      delete: (id) => this.json(`/clients/${encode(id)}`, "DELETE"),
    };

  }

  readonly auth: {
    signInEmail(input: { email: string; password: string }): Promise<unknown>;
    signOut(): Promise<unknown>;
    getSession(): Promise<unknown>;
    getToken(): string | undefined;
    setActiveOrganization(organizationId: string): Promise<unknown>;
  };
  readonly contacts: {
    list(query?: Query): Promise<Contact[]>;
    search(query: { query: string }): Promise<unknown>;
    assignees(): Promise<unknown>;
    get(id: number): Promise<Contact>;
    avatar(id: number): Promise<unknown>;
    groupParticipants(id: number): Promise<unknown>;
    create(input: ContactCreateInput): Promise<Contact>;
    startConversation(input: Record<string, JsonValue>): Promise<unknown>;
    subscribePresence(id: number, input?: Record<string, JsonValue>): Promise<unknown>;
    update(id: number, input: ContactUpdateInput): Promise<Contact>;
    setSaved(id: number, isSaved: boolean): Promise<unknown>;
    setArchived(id: number, archived: boolean): Promise<unknown>;
    setPinned(id: number, pinned: boolean): Promise<unknown>;
    setAssignment(id: number, assignedUserIds: string[]): Promise<unknown>;
    setPriority(id: number, priority: Contact["priority"]): Promise<unknown>;
    delete(id: number): Promise<void>;
  };
  readonly messages: {
    mediaLibrary(query?: Query): Promise<unknown>;
    list(contactId: number, query?: MessagePageQuery): Promise<MessagePage>;
    favorites(contactId: number, query?: MessagePageQuery): Promise<unknown>;
    sendText(contactId: number, input: { text: string }): Promise<unknown>;
    sendPoll(contactId: number, input: PollCreateInput): Promise<unknown>;
    poll(messageId: number): Promise<unknown>;
    pollVoterAvatar(messageId: number, voterId: string): Promise<unknown>;
    voteOnPoll(messageId: number, optionIndexes: number[]): Promise<unknown>;
    closeWithBot(contactId: number): Promise<unknown>;
    markRead(contactId: number): Promise<unknown>;
    media(messageId: number, query?: { download?: boolean }): Promise<Blob>;
    senderAvatar(messageId: number): Promise<unknown>;
    info(messageId: number): Promise<unknown>;
    react(messageId: number, reaction: string | null): Promise<unknown>;
    updateFlags(messageId: number, input: MessageFlagsInput): Promise<unknown>;
    delete(messageId: number, scope: "me" | "everyone"): Promise<unknown>;
    transcribe(messageId: number): Promise<TranscriptionResult>;
    sendMedia(contactId: number, input: FileUpload): Promise<unknown>;
  };
  readonly ai: {
    translate(text: string): Promise<{ text: string }>;
    rewrite(text: string): Promise<{ text: string }>;
  };
  readonly transcription: {
    getSettings(): Promise<unknown>;
    updateSettings(input: TranscriptionSettingsInput): Promise<unknown>;
  };
  readonly notifications: {
    list(query?: Query): Promise<unknown>;
    markAllRead(): Promise<unknown>;
    markContactRead(contactId: number): Promise<unknown>;
    markRead(id: number): Promise<unknown>;
    clear(): Promise<void>;
  };
  readonly push: {
    publicKey(): Promise<unknown>;
    subscribe(input: PushSubscriptionInput): Promise<unknown>;
    unsubscribe(endpoint: string): Promise<unknown>;
  };
  readonly evolution: {
    connection(): Promise<unknown>;
    qrcode(): Promise<unknown>;
    disconnect(): Promise<unknown>;
    callSettings(): Promise<unknown>;
    updateCallSettings(input: { rejectCall: boolean; msgCall: string }): Promise<unknown>;
  };
  readonly bots: {
    list(): Promise<{ bots: Bot[]; activeBotId: string | null; instanceAvailable: boolean }>;
    create(input: BotCreateInput): Promise<Bot>;
    update(id: string, input: BotUpdateInput): Promise<Bot>;
    publish(id: string, revision: number): Promise<Bot>;
    setActivation(id: string, active: boolean): Promise<unknown>;
    simulate(input: { flow: JsonValue; inputs: string[] }): Promise<unknown>;
    uploadImage(input: Pick<FileUpload, "file" | "fileName">): Promise<unknown>;
    image(imageId: string): Promise<Blob>;
  };
  readonly organizations: {
    workspace(organizationId: string): Promise<unknown>;
    internalMessages(organizationId: string, query?: MessagePageQuery): Promise<unknown>;
    sendInternalMessage(organizationId: string, content: string): Promise<unknown>;
    updateProfile(organizationId: string, input: { logo: string | null }): Promise<unknown>;
    createGroup(organizationId: string, input: OrganizationGroupInput): Promise<unknown>;
    updateGroup(organizationId: string, groupId: string, input: OrganizationGroupInput): Promise<unknown>;
    deleteGroup(organizationId: string, groupId: string): Promise<void>;
    updateMemberProfile(organizationId: string, memberId: string, input: MemberProfileInput): Promise<unknown>;
    updateInvitationProfile(organizationId: string, invitationId: string, input: { name: string; jobTitle: string }): Promise<unknown>;
  };
  readonly internalConversations: {
    bootstrap(organizationId: string): Promise<unknown>;
    members(organizationId: string): Promise<unknown>;
    list(organizationId: string): Promise<unknown>;
    create(organizationId: string, input: InternalConversationCreateInput): Promise<unknown>;
    get(organizationId: string, conversationId: string): Promise<unknown>;
    updatePreferences(organizationId: string, conversationId: string, input: { pinned?: boolean; archived?: boolean }): Promise<unknown>;
    updateAvatar(organizationId: string, conversationId: string, input: { avatarUrl: string | null }): Promise<unknown>;
    messages(organizationId: string, conversationId: string, query?: MessagePageQuery): Promise<unknown>;
    sendMessage(organizationId: string, conversationId: string, input: InternalMessageCreateInput): Promise<unknown>;
    sendMedia(organizationId: string, conversationId: string, input: FileUpload): Promise<unknown>;
    sendImage(organizationId: string, conversationId: string, input: FileUpload): Promise<unknown>;
    media(organizationId: string, conversationId: string, messageId: number, options?: { download?: boolean; range?: string }): Promise<Blob>;
    transcribe(organizationId: string, conversationId: string, messageId: number): Promise<unknown>;
    markRead(organizationId: string, conversationId: string): Promise<unknown>;
    addReaction(organizationId: string, conversationId: string, messageId: number, emoji: string): Promise<unknown>;
    removeReaction(organizationId: string, conversationId: string, messageId: number): Promise<unknown>;
    updateMessageFlags(organizationId: string, conversationId: string, messageId: number, input: MessageFlagsInput): Promise<unknown>;
    deleteMessage(organizationId: string, conversationId: string, messageId: number): Promise<void>;
    participants(organizationId: string, conversationId: string): Promise<unknown>;
    addParticipants(organizationId: string, conversationId: string, userIds: string[]): Promise<unknown>;
  };
  readonly invitations: {
    get(id: string): Promise<unknown>;
    accept(id: string, input: { name: string; password: string }): Promise<unknown>;
  };
  readonly calendarEvents: {
    list(query: { from: string; to: string }): Promise<unknown>;
    create(input: CalendarEventCreateInput): Promise<unknown>;
    setCompleted(id: string, completed: boolean): Promise<unknown>;
    delete(id: string): Promise<void>;
  };
  readonly scheduledMessages: {
    list(query: { from: string; to: string }): Promise<unknown>;
    create(input: ScheduledMessageCreateInput): Promise<unknown>;
    delete(id: string): Promise<void>;
  };
  readonly clients: {
    list(): Promise<{ clients: ClientProfile[] }>;
    create(input: ClientProfileInput): Promise<{ client: ClientProfile }>;
    update(id: string, input: ClientProfileInput): Promise<{ client: ClientProfile }>;
    delete(id: string): Promise<void>;
  };

  request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    return this.perform<T>(path, init, "json");
  }

  private internalPath(organizationId: string, suffix = ""): string {
    return `/organizations/${encode(organizationId)}/internal-conversations${suffix}`;
  }

  private internalUpload(organizationId: string, conversationId: string, kind: "media" | "images", input: FileUpload): Promise<unknown> {
    const form = new FormData();
    form.append("file", input.file, input.fileName);
    if (input.caption !== undefined) form.append("caption", input.caption);
    return this.upload(this.internalPath(organizationId, `/${encode(conversationId)}/${kind}`), form);
  }

  private json<T = unknown>(path: string, method: string, body?: unknown, skipAutoAuth = false): Promise<T> {
    const headers = new Headers();
    if (body !== undefined) headers.set("Content-Type", "application/json");
    return this.perform<T>(path, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }, "json", { skipAutoAuth });
  }

  private upload<T = unknown>(path: string, body: FormData): Promise<T> {
    return this.perform<T>(path, { method: "POST", body }, "json");
  }

  private blob(path: string, headers?: HeadersInit): Promise<Blob> {
    return this.perform<Blob>(path, { headers }, "blob");
  }

  private async perform<T>(
    path: string,
    init: RequestInit,
    responseType: "json" | "blob",
    options: { skipAutoAuth?: boolean } = {},
  ): Promise<T> {
    const url = `${this.apiUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const send = () => {
      const headers = new Headers(this.defaultHeaders);
      if (this.authToken && !headers.has("authorization")) {
        headers.set("Authorization", ["Bearer ", this.authToken].join(""));
      }
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
      return this.fetcher(url, {
        ...init,
        headers,
        credentials: init.credentials ?? this.credentials,
      });
    };
    const autoAuth = !options.skipAutoAuth && this.automaticAuthEnabled && this.authCredentials !== undefined;
    if (autoAuth) await this.ensureAuthentication();
    const requestToken = this.authToken;
    let response = await send();
    const newAuthToken = response.headers.get("set-auth-token");
    if (newAuthToken) this.authToken = newAuthToken;
    if (response.status === 401 && autoAuth) {
      if (this.authToken === requestToken) this.authToken = undefined;
      await this.ensureAuthentication();
      response = await send();
      const refreshedToken = response.headers.get("set-auth-token");
      if (refreshedToken) this.authToken = refreshedToken;
    }
    if (!response.ok) {
      const text = await response.text();
      let body: unknown = text;
      try {
        body = text ? JSON.parse(text) as unknown : null;
      } catch {
        body = text;
      }
      throw new CotrimBotApiError(response.status, body);
    }
    if (response.status === 204) return undefined as T;
    if (responseType === "blob") return await response.blob() as T;
    if (response.status === 205) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) as T : undefined) as T;
  }

  private async ensureAuthentication(): Promise<void> {
    if (!this.automaticAuthEnabled || !this.authCredentials || this.authToken) return;
    if (!this.authenticationPromise) {
      this.authenticationPromise = (async () => {
        await this.json("/auth/sign-in/email", "POST", this.authCredentials, true);
        if (this.activeOrganizationId) {
          try {
            await this.json(
              "/auth/organization/set-active",
              "POST",
              { organizationId: this.activeOrganizationId },
              true,
            );
          } catch (error) {
            this.authToken = undefined;
            throw error;
          }
        }
      })();
    }
    try {
      await this.authenticationPromise;
    } finally {
      this.authenticationPromise = undefined;
    }
  }
}

export interface ContactCreateInput {
  name: string;
  phone: string;
  companyName?: string;
  jobTitle?: string;
}
export interface ContactUpdateInput {
  name: string;
  phone?: string;
  companyName?: string | null;
  jobTitle?: string | null;
}
export interface MessagePageQuery {
  limit?: number;
  before?: number;
}
export interface MessagePage {
  messages: Message[];
  hasMore: boolean;
  nextCursor: number | null;
}
export interface TranscriptionResult {
  messageId: number;
  transcription: string;
}
export interface PollCreateInput {
  question: string;
  options: string[];
  selectableCount: number;
  [key: string]: JsonValue | undefined;
}
export interface MessageFlagsInput {
  pinned?: boolean;
  pinDurationHours?: number;
  favorited?: boolean;
}
export interface TranscriptionSettingsInput {
  model: string;
  language: string;
  beam_size: number;
  vad_filter: boolean;
}
export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
export interface BotCreateInput {
  name: string;
  draft: JsonValue;
}
export interface BotUpdateInput extends BotCreateInput {
  revision: number;
}
export interface OrganizationGroupInput {
  name: string;
  description?: string;
  memberIds: string[];
  permissions: string[];
}
export interface MemberProfileInput {
  displayName: string;
  jobTitle: string;
  signature: string;
  signatureEnabled: boolean;
}
export interface InternalConversationCreateInput {
  type: "DIRECT" | "GROUP";
  name?: string;
  participantIds: string[];
}
export interface InternalMessageCreateInput {
  content: string;
  private?: boolean;
  clientId?: string;
  replyToMessageId?: number;
  includeSignature?: boolean;
  mentionedUserIds?: string[];
}
export interface CalendarEventCreateInput {
  title: string;
  companyName?: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  category?: CalendarEvent["category"];
  isPublic?: boolean;
}
export interface ScheduledMessageCreateInput {
  phone: string;
  content: string;
  scheduledAt: string;
}
export interface ClientProfileInput {
  name: string;
  image: string | null;
  links: string[];
}
