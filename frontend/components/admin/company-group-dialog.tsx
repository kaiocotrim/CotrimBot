"use client";

import { Dialog } from "@base-ui/react/dialog";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Trash2, UsersRound, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { createCompanyGroup, deleteCompanyGroup, updateCompanyGroup } from "@/lib/company-api";
import { permissionSections, type CompanyGroup, type OrganizationMember, type PermissionKey } from "./company-types";

const inputClass = "min-h-11 w-full rounded-xl border border-white/10 bg-black px-3.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/25";
const MotionDialogBackdrop = motion.create(Dialog.Backdrop);
const MotionDialogPopup = motion.create(Dialog.Popup);

export function CompanyGroupDialog({ organizationId, group, members, open, onOpenChange, onSaved }: {
  organizationId: string;
  group: CompanyGroup | null;
  members: OrganizationMember[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [memberIds, setMemberIds] = useState<string[]>(group?.memberIds ?? []);
  const [permissions, setPermissions] = useState<PermissionKey[]>(group?.permissions ?? []);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  function toggleMember(memberId: string) {
    setMemberIds((current) => current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId]);
  }

  function togglePermission(permission: PermissionKey) {
    setPermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const input = { name: name.trim(), description: description.trim(), memberIds, permissions };
      if (group) await updateCompanyGroup(organizationId, group.id, input);
      else await createCompanyGroup(organizationId, input);
      await onSaved();
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o grupo.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!group || deleting || !window.confirm(`Excluir o grupo ${group.name}?`)) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteCompanyGroup(organizationId, group.id);
      await onSaved();
      onOpenChange(false);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Não foi possível excluir o grupo.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <MotionDialogBackdrop initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduceMotion ? 0 : 0.2 }} className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm" />
        <MotionDialogPopup initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 36 }} animate={{ opacity: 1, x: 0 }} transition={reduceMotion ? { duration: 0 } : { duration: 0.28, ease: [0.16, 1, 0.3, 1] }} className="fixed right-0 top-0 z-[201] flex h-dvh w-full max-w-xl flex-col border-l border-white/10 bg-[#070707] text-zinc-100 shadow-2xl outline-none">
          <header className="flex h-18 shrink-0 items-center justify-between border-b border-white/[0.07] px-6">
            <div>
              <Dialog.Title className="text-base font-semibold">{group ? "Editar grupo" : "Novo grupo"}</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-zinc-500">Membros e permissões podem ser alterados depois.</Dialog.Description>
            </div>
            <Dialog.Close aria-label="Fechar" className="rounded-full p-2 text-zinc-500 hover:bg-white/[0.06] hover:text-white"><X size={20} /></Dialog.Close>
          </header>

          <form onSubmit={(event) => void save(event)} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-7 overflow-y-auto px-6 py-6">
              <section className="space-y-3">
                <label className="block text-xs font-medium text-zinc-400">Nome do grupo<input autoFocus required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Atendimento" className={`${inputClass} mt-2`} /></label>
                <label className="block text-xs font-medium text-zinc-400">Descrição <span className="text-zinc-600">(opcional)</span><textarea maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descreva a responsabilidade desta equipe." rows={3} className={`${inputClass} mt-2 resize-none py-3`} /></label>
              </section>

              <section>
                <div className="mb-3 flex items-center gap-2"><UsersRound size={16} className="text-zinc-500" /><h3 className="text-sm font-semibold">Usuários do grupo</h3><span className="ml-auto text-xs text-zinc-500">{memberIds.length} selecionado(s)</span></div>
                <div className="space-y-2">
                  {members.map((member) => {
                    const selected = memberIds.includes(member.id);
                    return <label key={member.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 hover:border-white/[0.14]">
                      <input type="checkbox" className="sr-only" checked={selected} onChange={() => toggleMember(member.id)} />
                      <span className={`flex size-5 items-center justify-center rounded-md border ${selected ? "border-white bg-white text-black" : "border-white/20 text-transparent"}`}><Check size={13} strokeWidth={3} /></span>
                      <span className="min-w-0"><span className="block truncate text-sm text-zinc-200">{member.displayName || member.user.name}</span><span className="block truncate text-xs text-zinc-500">{member.user.email}</span></span>
                    </label>;
                  })}
                </div>
              </section>

              <section>
                <h3 className="mb-1 text-sm font-semibold">Permissões do grupo</h3>
                <p className="mb-4 text-xs text-zinc-500">O dono sempre mantém acesso total, independentemente destas opções.</p>
                <div className="space-y-5">
                  {permissionSections.map((section) => <div key={section.label}>
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">{section.label}</p>
                    <div className="overflow-hidden rounded-xl border border-white/[0.07]">
                      {section.permissions.map(([permission, label]) => {
                        const enabled = permissions.includes(permission);
                        return <label key={permission} className="flex cursor-pointer items-center justify-between gap-4 border-b border-white/[0.06] px-3.5 py-3 last:border-b-0 hover:bg-white/[0.025]">
                          <span className="text-sm text-zinc-300">{label}</span>
                          <input type="checkbox" className="peer sr-only" checked={enabled} onChange={() => togglePermission(permission)} />
                          <span className="relative h-5 w-9 shrink-0 rounded-full bg-zinc-800 transition-colors peer-checked:bg-zinc-100 after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-zinc-500 after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-black" />
                        </label>;
                      })}
                    </div>
                  </div>)}
                </div>
              </section>
              {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
            </div>

            <footer className="flex shrink-0 items-center gap-3 border-t border-white/[0.07] px-6 py-4">
              {group && <button type="button" disabled={saving || deleting} onClick={() => void remove()} className="mr-auto flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"><Trash2 size={15} />{deleting ? "Excluindo…" : "Excluir"}</button>}
              <Dialog.Close className="rounded-full px-4 py-2 text-sm text-zinc-400 hover:text-white">Cancelar</Dialog.Close>
              <button type="submit" disabled={saving || deleting || !name.trim()} className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-50">{saving ? "Salvando…" : "Salvar grupo"}</button>
            </footer>
          </form>
        </MotionDialogPopup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
