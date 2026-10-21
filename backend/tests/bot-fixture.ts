import type { BotFlow } from "../src/services/bot-flow.js";

export function fixture(): BotFlow {
  return { rootMenuId: "main", invalidMessage: "Escolha uma opção válida", backLabel: "Voltar", menus: [
    { id: "main", name: "Principal", text: "Assistente Infordoc", options: [
      { id: "ticket", number: "1", label: "Ajuda para abrir chamado", active: true, action: "MESSAGE", response: "Acesse https://sac.infordoc.com.br/.\nUse o CNPJ cadastrado no contrato.", targetMenuId: "" },
      { id: "scanner", number: "3", label: "Scanner", active: true, action: "SUBMENU", response: "", targetMenuId: "scanner-menu" },
      { id: "disabled", number: "2", label: "Criar login", active: false, action: "MESSAGE", response: "", targetMenuId: "" },
    ] },
    { id: "scanner-menu", name: "Scanner", text: "Qual problema?", options: [
      { id: "human", number: "4", label: "Suporte", active: true, action: "HUMAN", response: "Aguarde um técnico.", targetMenuId: "" },
    ] },
  ] };
}
