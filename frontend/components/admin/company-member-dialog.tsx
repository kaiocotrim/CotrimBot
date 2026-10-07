"use client";

import { Dialog } from "@base-ui/react/dialog";
import { motion, useReducedMotion } from "framer-motion";
import { ShieldCheck, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { updateCompanyMemberProfile } from "@/lib/company-api";
import { permissionLabels, type OrganizationMember } from "./company-types";

const inputClass = "mt-2 min-h-10 w-full border-0 border-b border-white/10 bg-transparent px-0 text-sm text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-white/30 disabled:opacity-50";
const MotionDialogBackdrop = motion.create(Dialog.Backdrop);
const MotionDialogPopup = motion.create(Dialog.Popup);

export function CompanyMemberDialog({ organizationId, member, canEdit, open, onOpenChange, onSaved }: {
  organizationId: string;
  member: OrganizationMember | null;
  canEdit: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(member?.displayName ?? member?.user.name ?? "");
  const [jobTitle, setJobTitle] = useState(member?.jobTitle ?? "");
  const [signature, setSignature] = useState(member?.signature ?? "");
  const [signatureEnabled, setSignatureEnabled] = useState(member?.signatureEnabled ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  if (!member) return null;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!member || !canEdit || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateCompanyMemberProfile(organizationId, member.id, { displayName: displayName.trim(), jobTitle: jobTitle.trim(), signature: signature.trim(), signatureEnabled });
      await onSaved();
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o usuário.");
    } finally {
      setSaving(false);
    }
  }

  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <MotionDialogBackdrop initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduceMotion ? 0 : 0.2 }} className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm" />
      <MotionDialogPopup initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.16, 1, 0.3, 1] }} className="fixed right-0 top-0 z-[201] flex h-dvh w-full max-w-lg flex-col border-l border-white/[0.08] bg-[#070707] text-zinc-100 shadow-2xl outline-none">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/[0.07] px-6 py-5">
          <div><Dialog.Title className="text-lg font-semibold">{member.displayName || member.user.name}</Dialog.Title><Dialog.Description className="mt-1 text-sm text-zinc-500">{member.user.email}</Dialog.Description></div>
          <Dialog.Close aria-label="Fechar" className="p-1 text-zinc-600 transition-colors hover:text-white"><X size={20} /></Dialog.Close>
        </header>

        <form onSubmit={(event) => void save(event)} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-9 overflow-y-auto px-6 py-7">
          <section className="border-b border-white/[0.07] pb-8">
            <h3 className="text-sm font-semibold">Informações</h3>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <label className="text-xs text-zinc-400">Nome de exibição<input disabled={!canEdit} maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className={inputClass} /></label>
              <label className="text-xs text-zinc-400">Cargo / função<input disabled={!canEdit} maxLength={100} value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} className={inputClass} /></label>
            </div>
            <p className="mt-5 text-xs text-zinc-600">Grupos <span className="ml-2 text-zinc-400">{member.groups.length ? member.groups.map((group) => group.name).join(" · ") : "Nenhum"}</span></p>
          </section>

          <section className="border-b border-white/[0.07] pb-8">
            <h3 className="text-sm font-semibold">Assinatura</h3>
            <p className="mt-1 text-xs text-zinc-500">Será usada futuramente no envio de mensagens deste usuário.</p>
            <label className="mt-5 block text-xs text-zinc-400">Assinatura<input disabled={!canEdit} maxLength={255} value={signature} onChange={(event) => setSignature(event.target.value)} placeholder="Ex.: João | Suporte" className={inputClass} /></label>
            <label className="mt-5 flex items-center justify-between gap-4 border-y border-white/[0.07] py-4">
              <span><span className="block text-sm text-zinc-300">Adicionar automaticamente</span><span className="block text-xs text-zinc-600">Anexa “— assinatura” ao texto enviado.</span></span>
              <input type="checkbox" disabled={!canEdit || !signature.trim()} className="peer sr-only" checked={signatureEnabled} onChange={(event) => setSignatureEnabled(event.target.checked)} />
              <span className="relative h-5 w-9 shrink-0 rounded-full bg-zinc-800 peer-checked:bg-zinc-100 after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-zinc-500 after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-black" />
            </label>
          </section>

          <section>
            <div className="flex items-center gap-2"><ShieldCheck size={16} className="text-zinc-500" /><h3 className="text-sm font-semibold">Permissões herdadas</h3></div>
            {member.role === "owner" ? <p className="mt-3 text-sm text-zinc-400">Controle completo da empresa</p> : member.effectivePermissions.length ? <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">{member.effectivePermissions.map((permission) => <li key={permission} className="flex items-center gap-2 text-xs text-zinc-500"><span className="size-1 rounded-full bg-zinc-600" />{permissionLabels[permission]}</li>)}</ul> : <p className="mt-3 text-xs text-zinc-600">Nenhuma permissão herdada</p>}
          </section>

          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          </div>
          <footer className="flex shrink-0 justify-end gap-3 border-t border-white/[0.07] px-6 py-4"><Dialog.Close className="px-3 py-2 text-sm text-zinc-500 hover:text-white">Fechar</Dialog.Close>{canEdit && <button type="submit" disabled={saving} className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-50">{saving ? "Salvando…" : "Salvar alterações"}</button>}</footer>
        </form>
      </MotionDialogPopup>
    </Dialog.Portal>
  </Dialog.Root>;
}
