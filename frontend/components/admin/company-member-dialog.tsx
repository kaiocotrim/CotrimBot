"use client";

import { Dialog } from "@base-ui/react/dialog";
import { motion, useReducedMotion } from "framer-motion";
import { Camera, ShieldCheck, X } from "@/components/icons/animated-lucide";
import { useRef, useState, type FormEvent } from "react";
import { updateCompanyMemberAvatar, updateCompanyMemberProfile } from "@/lib/company-api";
import { authClient, useSession } from "@/lib/auth-client";
import { prepareAvatar } from "@/lib/avatar-image";
import { CompanyMemberAvatar } from "./company-member-avatar";
import { permissionLabels, type OrganizationMember } from "./company-types";

const inputClass = "mt-2 min-h-10 w-full border-0 border-b border-white/10 bg-transparent px-0 text-sm text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-white/30 disabled:opacity-50";
const MotionDialogBackdrop = motion.create(Dialog.Backdrop);
const MotionDialogPopup = motion.create(Dialog.Popup);

export function CompanyMemberDialog({ organizationId, member, canEdit, canEditSignature, canEditAvatar, open, onOpenChange, onSaved }: {
  organizationId: string;
  member: OrganizationMember | null;
  canEdit: boolean;
  canEditSignature: boolean;
  canEditAvatar: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const { data: session } = useSession();
  const [displayName, setDisplayName] = useState(member?.displayName ?? "");
  const [jobTitle, setJobTitle] = useState(member?.jobTitle ?? "");
  const [signature, setSignature] = useState(member?.signature ?? "");
  const [signatureEnabled, setSignatureEnabled] = useState(member?.signatureEnabled ?? false);
  const [saving, setSaving] = useState(false);
  const [avatar, setAvatar] = useState(member?.user.image ?? null);
  const [savedAvatar, setSavedAvatar] = useState(member?.user.image ?? null);
  const [processingAvatar, setProcessingAvatar] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  if (!member) return null;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!member || (!canEdit && !canEditSignature && !canEditAvatar) || saving || processingAvatar) return;
    setSaving(true);
    setError(null);
    try {
      if (canEditAvatar && avatar !== savedAvatar) {
        if (member.userId === session?.user.id) {
          const { error } = await authClient.updateUser({ image: avatar });
          if (error) throw new Error("Não foi possível salvar a foto. Tente novamente.");
        } else {
          await updateCompanyMemberAvatar(organizationId, member.id, avatar);
        }
        setSavedAvatar(avatar);
      }
      if (displayName.trim() !== (member.displayName ?? "") || jobTitle.trim() !== (member.jobTitle ?? "")
        || signature.trim() !== (member.signature ?? "") || signatureEnabled !== member.signatureEnabled) {
        await updateCompanyMemberProfile(organizationId, member.id, { displayName: displayName.trim(), jobTitle: jobTitle.trim(), signature: signature.trim(), signatureEnabled });
      }
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
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/[0.07] px-6 pb-5 pt-[calc(1.25rem+env(safe-area-inset-top))]">
          <div><Dialog.Title className="text-lg font-semibold">{member.displayName || member.user.name}</Dialog.Title><Dialog.Description className="mt-1 text-sm text-zinc-500">{member.user.email}</Dialog.Description></div>
          <Dialog.Close aria-label="Fechar" className="p-1 text-zinc-600 transition-colors hover:text-white"><X size={20} /></Dialog.Close>
        </header>

        <form onSubmit={(event) => void save(event)} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-9 overflow-y-auto px-6 py-7">
          <section className="border-b border-white/[0.07] pb-8">
            <h3 className="text-sm font-semibold">Foto de perfil</h3>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <CompanyMemberAvatar key={avatar} member={{ ...member, user: { ...member.user, image: avatar } }} />
              {canEditAvatar && <>
                <button type="button" disabled={saving || processingAvatar} onClick={() => avatarInput.current?.click()} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 px-4 text-xs text-zinc-300 transition-colors hover:bg-white/[0.06] disabled:opacity-50"><Camera size={15} />{processingAvatar ? "Processando…" : avatar ? "Trocar foto" : "Adicionar foto"}</button>
                {avatar && <button type="button" disabled={saving || processingAvatar} onClick={() => setAvatar(null)} className="min-h-10 text-xs text-zinc-500 hover:text-zinc-200 disabled:opacity-50">Remover foto</button>}
                <input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Escolher foto de perfil" className="sr-only" disabled={saving || processingAvatar} onChange={event => {
                  const file = event.target.files?.[0]; event.target.value = "";
                  if (!file) return;
                  setProcessingAvatar(true); setError(null);
                  void prepareAvatar(file).then(setAvatar).catch(error => setError(error instanceof Error ? error.message : "Não foi possível abrir a foto.")).finally(() => setProcessingAvatar(false));
                }} />
              </>}
            </div>
            {canEditAvatar && <p className="mt-3 text-xs text-zinc-500">JPG, PNG ou WebP de até 5 MB. Salve as alterações para atualizar a foto deste membro no sistema.</p>}
          </section>
          <section className="border-b border-white/[0.07] pb-8">
            <h3 className="text-sm font-semibold">Informações</h3>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <label className="text-xs text-zinc-400">Nome de exibição<input disabled={!canEdit} maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={member.user.name} className={inputClass} /></label>
              <label className="text-xs text-zinc-400">Cargo / função<input disabled={!canEdit} maxLength={100} value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} className={inputClass} /></label>
            </div>
            <p className="mt-5 text-xs text-zinc-600">Grupos <span className="ml-2 text-zinc-400">{member.groups.length ? member.groups.map((group) => group.name).join(" · ") : "Nenhum"}</span></p>
          </section>

          <section className="border-b border-white/[0.07] pb-8">
            <h3 className="text-sm font-semibold">Assinatura</h3>
            <p className="mt-1 text-xs text-zinc-500">Identifica automaticamente quem enviou a mensagem.</p>
            <label className="mt-5 block text-xs text-zinc-400">Assinatura<input disabled={!canEditSignature} maxLength={255} value={signature} onChange={(event) => setSignature(event.target.value)} placeholder="Ex.: Kaio" className={inputClass} /></label>
            <label className="mt-5 flex items-center justify-between gap-4 border-y border-white/[0.07] py-4">
              <span><span className="block text-sm text-zinc-300">Adicionar automaticamente</span><span className="block text-xs text-zinc-600">Envia no formato “*Kaio:* mensagem”.</span></span>
              <input type="checkbox" disabled={!canEditSignature || !signature.trim()} className="peer sr-only" checked={signatureEnabled} onChange={(event) => setSignatureEnabled(event.target.checked)} />
              <span className="relative h-5 w-9 shrink-0 rounded-full bg-zinc-800 peer-checked:bg-zinc-100 after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-zinc-500 after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-black" />
            </label>
            <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4" aria-label="Prévia da mensagem">
              <p className="mb-2 text-xs text-zinc-500">Prévia no WhatsApp</p>
              <p className="whitespace-pre-wrap text-sm text-zinc-200">{signatureEnabled && signature.trim() ? <><strong>{signature.trim()}:</strong> </> : null}Olá, bom dia!</p>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2"><ShieldCheck size={16} className="text-zinc-500" /><h3 className="text-sm font-semibold">Permissões herdadas</h3></div>
            {member.role === "owner" ? <p className="mt-3 text-sm text-zinc-400">Controle completo da empresa</p> : member.effectivePermissions.length ? <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">{member.effectivePermissions.map((permission) => <li key={permission} className="flex items-center gap-2 text-xs text-zinc-500"><span className="size-1 rounded-full bg-zinc-600" />{permissionLabels[permission]}</li>)}</ul> : <p className="mt-3 text-xs text-zinc-600">Nenhuma permissão herdada</p>}
          </section>

          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          </div>
          <footer className="flex shrink-0 justify-end gap-3 border-t border-white/[0.07] px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"><Dialog.Close className="px-3 py-2 text-sm text-zinc-500 hover:text-white">Fechar</Dialog.Close>{(canEdit || canEditSignature || canEditAvatar) && <button type="submit" disabled={saving || processingAvatar} className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-50">{saving ? "Salvando…" : "Salvar alterações"}</button>}</footer>
        </form>
      </MotionDialogPopup>
    </Dialog.Portal>
  </Dialog.Root>;
}
