"use client";

import { Dialog } from "@base-ui/react/dialog";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { createCompanyGroup, deleteCompanyGroup, updateCompanyGroup } from "@/lib/company-api";
import { permissionSections, type CompanyGroup, type OrganizationMember, type PermissionKey } from "./company-types";

const inputClass = "min-h-10 w-full rounded-lg border border-white/[0.09] bg-white/[0.025] px-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-700 focus:border-white/20 focus:bg-white/[0.04]";
const allPermissions: PermissionKey[] = permissionSections.flatMap((section) => section.permissions.map(([permission]) => permission));
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
  const allPermissionsSelected = allPermissions.every((permission) => permissions.includes(permission));

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
        <MotionDialogBackdrop initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduceMotion ? 0 : 0.2 }} className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-[2px]" />
        <MotionDialogPopup initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} transition={reduceMotion ? { duration: 0 } : { duration: 0.28, ease: [0.16, 1, 0.3, 1] }} className="fixed right-0 top-0 z-[201] flex h-dvh w-full max-w-[520px] flex-col border-l border-white/[0.07] bg-[#090909] text-zinc-100 shadow-2xl outline-none">
          <header className="flex shrink-0 items-start justify-between px-7 pb-5 pt-6">
            <div>
              <Dialog.Title className="text-lg font-medium tracking-[-0.02em]">{group ? "Editar grupo" : "Novo grupo"}</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-zinc-600">Organize membros e defina o que este grupo pode acessar.</Dialog.Description>
            </div>
            <Dialog.Close aria-label="Fechar" className="-mr-2 rounded-lg p-2 text-zinc-600 transition-colors hover:bg-white/[0.05] hover:text-zinc-200"><X size={18} /></Dialog.Close>
          </header>

          <form onSubmit={(event) => void save(event)} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-9 overflow-y-auto px-7 pb-8 pt-2">
              <section className="space-y-4">
                <label className="block text-xs font-medium text-zinc-500">Nome<input autoFocus required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Atendimento" className={`${inputClass} mt-1.5`} /></label>
                <label className="block text-xs font-medium text-zinc-500">Descrição <span className="font-normal text-zinc-700">· opcional</span><textarea maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Qual é a função deste grupo?" rows={2} className={`${inputClass} mt-1.5 resize-none py-2.5`} /></label>
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-medium text-zinc-200">Membros</h3><span className="text-xs tabular-nums text-zinc-600">{memberIds.length} de {members.length}</span></div>
                <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
                  {members.map((member) => {
                    const selected = memberIds.includes(member.id);
                    return <label key={member.id} className="flex cursor-pointer items-center gap-3 py-3 transition-colors hover:bg-white/[0.02]">
                      <input type="checkbox" className="sr-only" checked={selected} onChange={() => toggleMember(member.id)} />
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-xs font-medium text-zinc-400">{(member.displayName || member.user.name || "?")[0]?.toUpperCase()}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm text-zinc-300">{member.displayName || member.user.name}</span><span className="mt-0.5 block truncate text-xs text-zinc-600">{member.user.email}</span></span>
                      <span className={`flex size-[18px] items-center justify-center rounded-[5px] border transition-colors ${selected ? "border-zinc-200 bg-zinc-200 text-zinc-950" : "border-white/15 text-transparent"}`}><Check size={12} strokeWidth={3} /></span>
                    </label>;
                  })}
                  {!members.length && <p className="py-5 text-center text-xs text-zinc-600">Nenhum membro disponível.</p>}
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium text-zinc-200">Permissões</h3>
                  <button type="button" onClick={() => setPermissions(allPermissionsSelected ? [] : allPermissions)} className="rounded-md px-2 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-300">
                    {allPermissionsSelected ? "Desmarcar tudo" : "Marcar tudo"}
                  </button>
                </div>
                <p className="mb-5 mt-1 text-xs leading-5 text-zinc-600">O dono da empresa sempre mantém acesso total.</p>
                <div className="space-y-6">
                  {permissionSections.map((section) => <div key={section.label}>
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-600">{section.label}</p>
                    <div className="divide-y divide-white/[0.055] border-y border-white/[0.055]">
                      {section.permissions.map(([permission, label]) => {
                        const enabled = permissions.includes(permission);
                        return <label key={permission} className="flex cursor-pointer items-center justify-between gap-4 py-2.5 transition-colors hover:bg-white/[0.02]">
                          <span className="text-sm text-zinc-400">{label}</span>
                          <input type="checkbox" className="peer sr-only" checked={enabled} onChange={() => togglePermission(permission)} />
                          <span className="relative h-[18px] w-8 shrink-0 rounded-full bg-zinc-800 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-white/30 peer-checked:bg-zinc-200 after:absolute after:left-0.5 after:top-0.5 after:size-3.5 after:rounded-full after:bg-zinc-500 after:transition-transform peer-checked:after:translate-x-3.5 peer-checked:after:bg-zinc-950" />
                        </label>;
                      })}
                    </div>
                  </div>)}
                </div>
              </section>
              {error && <p role="alert" className="rounded-lg bg-red-400/[0.07] px-3 py-2 text-xs text-red-300">{error}</p>}
            </div>

            <footer className="flex shrink-0 items-center gap-2 border-t border-white/[0.06] bg-[#090909]/95 px-7 py-3.5 backdrop-blur">
              {group && <button type="button" disabled={saving || deleting} onClick={() => void remove()} className="mr-auto flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-zinc-600 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"><Trash2 size={14} />{deleting ? "Excluindo…" : "Excluir"}</button>}
              <Dialog.Close className={`${group ? "" : "ml-auto"} rounded-lg px-3.5 py-2 text-sm text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-200`}>Cancelar</Dialog.Close>
              <button type="submit" disabled={saving || deleting || !name.trim()} className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-500">{saving ? "Salvando…" : "Salvar"}</button>
            </footer>
          </form>
        </MotionDialogPopup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
