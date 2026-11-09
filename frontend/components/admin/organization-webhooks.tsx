"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Pencil, Plus, Trash2, X } from "@/components/icons/animated-lucide";
import { authClient } from "@/lib/auth-client";
import {
  createOrganizationWebhook,
  deleteOrganizationWebhook,
  listOrganizationWebhookDeliveries,
  listOrganizationWebhookEvents,
  listOrganizationWebhooks,
  rotateOrganizationWebhookSecret,
  updateOrganizationWebhook,
  type OrganizationWebhook,
  type WebhookDelivery,
  type WebhookEventDefinition,
  type WebhookInput,
} from "@/lib/organization-webhooks-api";

type FormState = {
  id: string | null;
  name: string;
  url: string;
  events: string[];
  active: boolean;
};

type RevealedSecret = { webhookName: string; secret: string };

const inputClass = "h-10 w-full min-w-0 rounded-lg border border-white/10 bg-black px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/25";
const buttonClass = "inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-sm text-zinc-200 transition-colors hover:bg-white/5 disabled:opacity-50";

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

export function OrganizationWebhooks({ activeOrganizationId }: { activeOrganizationId?: string | null }) {
  const [organization, setOrganization] = useState<{ id: string; name: string } | null>(null);
  const [organizationChecked, setOrganizationChecked] = useState(false);
  const [catalog, setCatalog] = useState<WebhookEventDefinition[]>([]);
  const [webhooks, setWebhooks] = useState<OrganizationWebhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<RevealedSecret | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);

  const eventLabels = useMemo(() => new Map(catalog.map((event) => [event.key, event.label])), [catalog]);
  const groupedCatalog = useMemo(() => {
    const groups = new Map<string, WebhookEventDefinition[]>();
    for (const event of catalog) groups.set(event.group, [...(groups.get(event.group) ?? []), event]);
    return [...groups.entries()];
  }, [catalog]);

  // Mesma regra do chat e da tela Empresa: empresa ativa da sessão, senão a primeira da lista.
  useEffect(() => {
    let active = true;
    authClient.organization.list().then(({ data }) => {
      if (!active) return;
      const organizations = (data ?? []) as Array<{ id: string; name: string }>;
      setOrganization(organizations.find((item) => item.id === activeOrganizationId) ?? organizations[0] ?? null);
      setOrganizationChecked(true);
    }).catch(() => {
      if (!active) return;
      setError("Não foi possível identificar a empresa.");
      setOrganizationChecked(true);
    });
    return () => { active = false; };
  }, [activeOrganizationId]);

  const loadWebhooks = useCallback(async (organizationId: string) => {
    setError(null);
    try {
      const [events, list] = await Promise.all([listOrganizationWebhookEvents(organizationId), listOrganizationWebhooks(organizationId)]);
      setCatalog(events);
      setWebhooks(list);
    } catch (loadError) {
      setError(messageFrom(loadError, "Não foi possível carregar os webhooks."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!organization) return;
    const timeoutId = window.setTimeout(() => void loadWebhooks(organization.id), 0);
    return () => window.clearTimeout(timeoutId);
  }, [organization, loadWebhooks]);

  const loadDeliveries = useCallback(async (organizationId: string, id: string) => {
    setDeliveriesLoading(true);
    try {
      setDeliveries(await listOrganizationWebhookDeliveries(organizationId, id));
    } catch (deliveriesError) {
      setDeliveries([]);
      setError(messageFrom(deliveriesError, "Não foi possível carregar as entregas."));
    } finally {
      setDeliveriesLoading(false);
    }
  }, []);

  function selectWebhook(id: string) {
    if (!organization) return;
    setSelectedId(id);
    void loadDeliveries(organization.id, id);
  }

  function openNew() {
    setError(null);
    setForm({ id: null, name: "", url: "", events: [], active: true });
  }

  function openEdit(webhook: OrganizationWebhook) {
    setError(null);
    setForm({ id: webhook.id, name: webhook.name, url: webhook.url, events: webhook.events, active: webhook.active });
  }

  function toggleEvent(key: string) {
    setForm((current) => current && {
      ...current,
      events: current.events.includes(key) ? current.events.filter((item) => item !== key) : [...current.events, key],
    });
  }

  async function saveForm() {
    if (!form || !organization) return;
    const input: WebhookInput = { name: form.name.trim(), url: form.url.trim(), events: form.events, active: form.active };
    if (!input.name) {
      setError("Informe um nome para o webhook.");
      return;
    }
    if (!input.url) {
      setError("Informe a URL de destino.");
      return;
    }
    if (!input.events.length) {
      setError("Selecione ao menos um evento.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (form.id) {
        const updated = await updateOrganizationWebhook(organization.id, form.id, input);
        setWebhooks((current) => current.map((item) => item.id === updated.id ? updated : item));
      } else {
        const created = await createOrganizationWebhook(organization.id, input);
        setWebhooks((current) => [created.webhook, ...current]);
        setRevealedSecret({ webhookName: created.webhook.name, secret: created.secret });
        setSecretCopied(false);
      }
      setForm(null);
    } catch (saveError) {
      setError(messageFrom(saveError, "Não foi possível salvar o webhook."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(webhook: OrganizationWebhook) {
    if (!organization) return;
    setBusyId(webhook.id);
    setError(null);
    try {
      const updated = await updateOrganizationWebhook(organization.id, webhook.id, { active: !webhook.active });
      setWebhooks((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (toggleError) {
      setError(messageFrom(toggleError, "Não foi possível alterar o status do webhook."));
    } finally {
      setBusyId(null);
    }
  }

  async function rotateSecret(webhook: OrganizationWebhook) {
    if (!organization) return;
    if (!window.confirm(`Gerar novo segredo para "${webhook.name}"? O segredo atual deixará de validar as entregas.`)) return;
    setBusyId(webhook.id);
    setError(null);
    try {
      const { secret } = await rotateOrganizationWebhookSecret(organization.id, webhook.id);
      setRevealedSecret({ webhookName: webhook.name, secret });
      setSecretCopied(false);
    } catch (rotateError) {
      setError(messageFrom(rotateError, "Não foi possível gerar um novo segredo."));
    } finally {
      setBusyId(null);
    }
  }

  async function removeWebhook(webhook: OrganizationWebhook) {
    if (!organization) return;
    if (!window.confirm(`Excluir o webhook "${webhook.name}"? O histórico de entregas também será removido.`)) return;
    setBusyId(webhook.id);
    setError(null);
    try {
      await deleteOrganizationWebhook(organization.id, webhook.id);
      setWebhooks((current) => current.filter((item) => item.id !== webhook.id));
      if (selectedId === webhook.id) {
        setSelectedId(null);
        setDeliveries([]);
      }
    } catch (removeError) {
      setError(messageFrom(removeError, "Não foi possível excluir o webhook."));
    } finally {
      setBusyId(null);
    }
  }

  async function copySecret() {
    if (!revealedSecret) return;
    try {
      await navigator.clipboard.writeText(revealedSecret.secret);
      setSecretCopied(true);
    } catch {
      setError("Não foi possível copiar o segredo. Selecione e copie manualmente.");
    }
  }

  const selectedWebhook = webhooks.find((webhook) => webhook.id === selectedId) ?? null;

  if (!organizationChecked || loading) {
    return <p className="text-sm text-zinc-400">Carregando webhooks...</p>;
  }

  if (!organization) {
    return <p role="alert" className="text-sm text-zinc-400">Nenhuma empresa encontrada para a sua conta.</p>;
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-300">Empresa: <span className="font-medium text-white">{organization.name}</span></p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm leading-6 text-zinc-400">
          Envie eventos da empresa para sistemas externos. Cada entrega é assinada com o segredo do webhook no cabeçalho <span className="font-mono text-zinc-300">X-CotrimBot-Signature</span>.
        </p>
        <button type="button" onClick={openNew} className={`${buttonClass} bg-white text-black hover:bg-zinc-200`}>
          <Plus className="size-4" /> Novo webhook
        </button>
      </div>

      {error ? <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p> : null}

      {revealedSecret ? (
        <section className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5">
          <h3 className="text-sm font-semibold text-amber-200">Segredo de &quot;{revealedSecret.webhookName}&quot;</h3>
          <p className="mt-1 text-sm text-zinc-400">Copie agora. Ele não será exibido novamente.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg border border-white/10 bg-black px-3 py-2 font-mono text-xs text-zinc-100">{revealedSecret.secret}</code>
            <button type="button" onClick={copySecret} className={buttonClass}>
              {secretCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {secretCopied ? "Copiado" : "Copiar"}
            </button>
            <button type="button" onClick={() => setRevealedSecret(null)} className={buttonClass}>Fechar</button>
          </div>
        </section>
      ) : null}

      {form ? (
        <section className="rounded-2xl border border-white/10 bg-[#0a0a0a] p-6">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-base font-semibold text-zinc-100">{form.id ? "Editar webhook" : "Novo webhook"}</h3>
            <button type="button" onClick={() => setForm(null)} className="text-zinc-400 transition-colors hover:text-zinc-100" aria-label="Fechar formulário">
              <X className="size-5" />
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs text-zinc-400">Nome</span>
              <input className={inputClass} value={form.name} maxLength={100} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: CRM interno" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs text-zinc-400">URL de destino (https://)</span>
              <input className={inputClass} value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder="https://exemplo.com/webhooks/cotrimbot" />
            </label>
          </div>

          <fieldset className="mt-6 space-y-4">
            <legend className="text-xs text-zinc-400">Eventos ({form.events.length} selecionados)</legend>
            {groupedCatalog.map(([group, events]) => (
              <div key={group} className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{group}</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {events.map((event) => (
                    <label key={event.key} className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-black px-3 py-2.5">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={form.events.includes(event.key)}
                        onChange={() => toggleEvent(event.key)}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm text-zinc-100">{event.label}</span>
                        <span className="block font-mono text-xs text-zinc-500">{event.key}</span>
                        <span className="block text-xs text-zinc-400">{event.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>

          <label className="mt-6 flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
            Ativo (envia eventos)
          </label>

          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={() => setForm(null)} className={buttonClass}>Cancelar</button>
            <button type="button" onClick={saveForm} disabled={saving} className={`${buttonClass} bg-white text-black hover:bg-zinc-200`}>
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a]">
        {webhooks.length === 0 ? (
          <p className="p-6 text-sm text-zinc-400">Nenhum webhook cadastrado.</p>
        ) : (
          <ul className="divide-y divide-white/10">
            {webhooks.map((webhook) => {
              const busy = busyId === webhook.id;
              return (
                <li key={webhook.id} className="flex flex-wrap items-center gap-4 p-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-zinc-100">{webhook.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${webhook.active ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-500/15 text-zinc-400"}`}>
                        {webhook.active ? "Ativo" : "Pausado"}
                      </span>
                    </div>
                    <p className="truncate font-mono text-xs text-zinc-500">{webhook.url}</p>
                    <p className="truncate text-xs text-zinc-400">
                      {webhook.events.map((key) => eventLabels.get(key) ?? key).join(", ")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => selectWebhook(webhook.id)} className={buttonClass} aria-pressed={selectedId === webhook.id}>
                      Entregas
                    </button>
                    <button type="button" onClick={() => toggleActive(webhook)} disabled={busy} className={buttonClass}>
                      {webhook.active ? "Pausar" : "Ativar"}
                    </button>
                    <button type="button" onClick={() => openEdit(webhook)} disabled={busy} className={buttonClass}>
                      <Pencil className="size-4" /> Editar
                    </button>
                    <button type="button" onClick={() => rotateSecret(webhook)} disabled={busy} className={buttonClass}>
                      Novo segredo
                    </button>
                    <button type="button" onClick={() => removeWebhook(webhook)} disabled={busy} className={`${buttonClass} text-red-300 hover:text-red-200`} aria-label={`Excluir ${webhook.name}`}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {selectedWebhook ? (
        <section className="rounded-2xl border border-white/10 bg-[#0a0a0a] p-6">
          <h3 className="text-base font-semibold text-zinc-100">Últimas entregas de &quot;{selectedWebhook.name}&quot;</h3>
          {deliveriesLoading ? (
            <p className="mt-4 text-sm text-zinc-400">Carregando entregas...</p>
          ) : deliveries.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-400">Nenhuma entrega registrada ainda.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-zinc-500">
                  <tr>
                    <th className="py-2 pr-4 font-normal">Quando</th>
                    <th className="py-2 pr-4 font-normal">Evento</th>
                    <th className="py-2 pr-4 font-normal">Status</th>
                    <th className="py-2 pr-4 font-normal">Tentativas</th>
                    <th className="py-2 pr-4 font-normal">Resposta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {deliveries.map((delivery) => (
                    <tr key={delivery.id} className="text-zinc-300">
                      <td className="py-2 pr-4 whitespace-nowrap">{formatDate(delivery.createdAt)}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{delivery.event}</td>
                      <td className={`py-2 pr-4 ${delivery.status === "SUCCEEDED" ? "text-emerald-300" : "text-red-300"}`}>
                        {delivery.status === "SUCCEEDED" ? "Entregue" : "Falhou"}
                      </td>
                      <td className="py-2 pr-4">{delivery.attempts}</td>
                      <td className="py-2 pr-4 text-xs text-zinc-400">{delivery.responseStatus ? `HTTP ${delivery.responseStatus}` : delivery.error ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
