"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { BotDisclosure } from "./bot-disclosure";
import { ChevronRight, ListTree, Pencil, Search } from "lucide-react";
import type { BotFlow, BotMenu } from "@/lib/bot-api";
import styles from "./bot-designer.module.css";

export function MenuTree({ flow, currentMenuId, paths, onPreview, onRename }: {
  flow: BotFlow; currentMenuId: string; paths: Map<string, string>; onPreview: (id: string) => void; onRename: (id: string) => void;
}) {
  const reduced = useReducedMotion();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const children = new Map<string, BotMenu[]>();
  const seen = new Set<string>();
  const roots: BotMenu[] = [];
  function collect(menu: BotMenu) {
    seen.add(menu.id);
    const branch: BotMenu[] = [];
    children.set(menu.id, branch);
    for (const option of menu.options) {
      const target = option.action === "SUBMENU" ? flow.menus.find(item => item.id === option.targetMenuId) : undefined;
      if (target && !seen.has(target.id)) { branch.push(target); collect(target); }
    }
  }
  const root = flow.menus.find(menu => menu.id === flow.rootMenuId);
  if (root) { roots.push(root); collect(root); }
  for (const menu of flow.menus) if (!seen.has(menu.id)) { roots.push(menu); collect(menu); }
  const search = query.trim().toLocaleLowerCase("pt-BR");
  function matches(menu: BotMenu): boolean {
    return !search || `${menu.name} ${paths.get(menu.id) ?? ""} ${menu.options.map(option => `${option.label} ${option.description ?? ""}`).join(" ")}`.toLocaleLowerCase("pt-BR").includes(search)
      || (children.get(menu.id) ?? []).some(matches);
  }
  function branch(menu: BotMenu) {
    if (!matches(menu)) return null;
    const descendants = children.get(menu.id) ?? [];
    const expanded = Boolean(search) || !collapsed.has(menu.id);
    return <li key={menu.id}>
      <div className={styles.treeRow}>
        {descendants.length ? <button className={styles.treeToggle} aria-label={`${expanded ? "Recolher" : "Expandir"} ${menu.name}`} aria-expanded={expanded} onClick={() => setCollapsed(previous => { const next = new Set(previous); if (next.has(menu.id)) next.delete(menu.id); else next.add(menu.id); return next; })}><motion.span className={styles.disclosureChevron} animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: reduced ? 0 : .25 }}><ChevronRight size={13} /></motion.span></button> : <ListTree size={13} className={styles.treeLeaf} />}
        <button className={styles.menuItem} aria-label={`Ver menu ${paths.get(menu.id) ?? menu.name}`} aria-haspopup="dialog" title={paths.get(menu.id) ?? menu.name} aria-current={currentMenuId === menu.id ? "true" : undefined} onClick={() => onPreview(menu.id)}><span><strong>{menu.name || "Fluxo sem nome"}</strong><small>{menu.id === flow.rootMenuId ? "Início do atendimento" : `${menu.options.length} opções${paths.has(menu.id) ? "" : " · sem conexão"}`}</small></span></button>
        <button type="button" className={styles.treeRename} aria-label={`Renomear fluxo ${menu.name || "sem nome"}`} title="Renomear fluxo" aria-haspopup="dialog" onClick={() => onRename(menu.id)}><Pencil size={12} /></button>
      </div>
      {descendants.length > 0 && <BotDisclosure open={expanded}><ul>{descendants.map(branch)}</ul></BotDisclosure>}
    </li>;
  }
  return <>
    <label className={styles.menuSearch}><Search size={13} /><input aria-label="Buscar menu" placeholder="Buscar menu…" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <nav className={styles.menuTree} aria-label="Navegação dos menus"><ul>{roots.map(branch)}</ul>{!roots.some(matches) && <p className={styles.empty}>Nenhum menu encontrado.</p>}</nav>
  </>;
}
