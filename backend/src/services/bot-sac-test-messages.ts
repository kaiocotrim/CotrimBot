import type { SacTestState, SacTestCatalog } from './bot-sac-test.js';
export function formatSacTestAddress(value: string): string { return value.split(',').map(part => part.trim()).filter(Boolean).join(', '); }
const footer = '\n\n🚫 Para cancelar, digite *0* ou *cancelar*.';

export function sacTestPrompt(ticket: SacTestState, catalog: SacTestCatalog): string {
  const data = ticket.data;
  const company = catalog.find(item => item.id === data.companyId);
  const companyName = data.companyName?.trim() || company?.name?.trim();
  switch (ticket.step) {
    case 'cnpj': return '🎫 *InforBot | Abertura de Chamados*\n\nOlá! 👋 Vou te ajudar a preencher sua solicitação de suporte.\n\n🏢 Para começar, informe o *CNPJ da empresa*. Pode enviar com ou sem pontuação.' + (ticket.real ? '\n\nVocê poderá revisar os dados antes de confirmar a abertura no SAC.' : '\n\n🧪 Estamos em modo de teste: nenhum chamado será aberto no SAC.') + footer;
    case 'confirmCnpj': return `🏢 *Vamos conferir o CNPJ?*\n\nEncontramos este cadastro ${ticket.source === 'sac' ? 'no *SAC*' : 'na *base de teste*'}:\n\n${companyName ? `Empresa: *${companyName}*\n` : ''}CNPJ: *${data.cnpj?.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}*\n\nEstá correto?\n\n1 — ✅ Confirmar CNPJ\n2 — ✏️ Corrigir CNPJ` + footer;
    case 'requester': return '👤 *Como podemos te chamar?*\n\nInforme seu *nome completo* para identificar quem está solicitando o atendimento.' + footer;
    case 'phone': return '📱 *Qual telefone podemos usar para falar com você?*\n\nEnvie o número com *DDD*, de preferência com WhatsApp.\n\n💡 Exemplo: (27) 99999-9999.' + footer;
    case 'email': return '📧 *Qual é o seu e-mail de contato?*\n\nInforme o endereço completo.\n\n💡 Exemplo: nome@empresa.com.br.' + footer;
    case 'equipment': {
      const page = ticket.equipmentPage ?? 0;
      const equipment = company?.equipment ?? [];
      return '🖨️ *Qual equipamento precisa de atendimento?*\n\n' + equipment.slice(page * 10, (page + 1) * 10).map((item, i) => `${page * 10 + i + 1} — ${[item.name, item.serial].filter(Boolean).join(' | ')}`).join('\n\n')
        + (page > 0 ? '\n\nanterior — Ver página anterior' : '') + ((page + 1) * 10 < equipment.length ? '\n\nmais — Ver próximos equipamentos' : '') + footer;
    }
    case 'department': return '🏢 Informe o *setor ou departamento* onde está o equipamento.' + footer;
    case 'description': return '📝 *O que está acontecendo?*\n\nDescreva o problema do equipamento.' + footer;
    case 'review': return `📋 *Confira os dados do chamado*\n\nEmpresa: ${data.companyName || data.cnpj}\nCNPJ: ${data.cnpj}\nSolicitante: ${data.requester}\nTelefone: ${data.phone}\nE-mail: ${data.email}\nEndereço: ${data.addressLabel}\nEquipamento: ${data.equipmentLabel}\nSetor: ${data.department}\nProblema: ${data.description}\n\n1 — ✅ Confirmar e abrir chamado\n2 — ✏️ Corrigir dados` + footer;
    case 'address': return `📍 *Onde será o atendimento?*\n\nSelecione o endereço cadastrado ${ticket.source === 'sac' ? 'no SAC' : 'na base de teste'}. Digite o número da opção:\n\n` + (company?.addresses ?? []).filter(item => formatSacTestAddress(item.address)).map((item, i) => `${i + 1} — ${formatSacTestAddress(item.address)}`).join('\n\n') + footer;
    default: return '✅ *Informações recebidas!*\n\nOs dados foram mantidos para as próximas etapas, que ainda serão configuradas.\n\n🧪 Nenhum chamado foi aberto no SAC.' + footer;
  }
}
