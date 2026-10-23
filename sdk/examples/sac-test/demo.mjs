/**
 * Entrada da demonstração: faz o papel de uma conversa usando o terminal.
 * Execute na raiz do projeto: node sdk/examples/sac-test/demo.mjs
 * O SDK realiza HTTP real, mas seu destino é nosso servidor simulado local.
 * Não há conexão com a Evolution ou com o SAC da Infordoc neste arquivo.
 */
import { createInterface } from 'node:readline/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CotrimBotClient } from '../../dist/index.js';
import { openStore, saveSession, validCnpj, validPhone } from './store.mjs';
import { startTestServer } from './server.mjs';
import { createSacApi } from './sac-api.mjs';

// Resolve o banco em relação a este arquivo, independentemente da pasta do terminal.
const path = fileURLToPath(new URL('./data/sac-test.sqlite', import.meta.url));
const db = openStore(path);
if (process.argv.includes('--list')) {
  // Modo de consulta: abre o SQLite, mostra os registros e termina sem conversar.
  console.table(db.prepare('SELECT id, requester, description, test_mode, created_at FROM tickets ORDER BY id DESC').all());
  db.close();
} else {
  // O servidor e os dois clientes têm papéis diferentes:
  // SDK CotrimBot = enviar mensagens; cliente SAC = consultar cadastros e criar registro.
  const server = await startTestServer(db);
  const sdk = new CotrimBotClient({ baseUrl: server.baseUrl });
  const sac = createSacApi(server.baseUrl);
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  // Uma sessão fixa serve a UMA pessoa no terminal. Não representa contatos reais.
  const sessionId = 'terminal-local';
  const saved = db.prepare('SELECT state FROM sessions WHERE id = ?').get(sessionId);
  // step: pergunta atual; data: respostas; requestId: chave estável para não duplicar o POST.
  let state = saved ? JSON.parse(saved.state) : { step: 'cnpj', data: {}, requestId: randomUUID() };
  // O contato 1 é fictício: o endpoint local grava o texto e o imprime no terminal.
  const send = text => sdk.messages.sendText(1, { text });
  const persist = () => saveSession(db, sessionId, state);
  console.log(`TESTE LOCAL — nenhuma mensagem vai ao WhatsApp ou SAC.\nBanco: ${path}\nDigite 0 ou cancelar para solicitar cancelamento. Ctrl+C mantém o progresso.\n`);
  try {
    while (true) {
      // Salva antes da próxima pergunta para permitir retomada ao executar novamente.
      persist();
      if (state.step === 'cnpj') {
        await send('Informe o CNPJ da empresa (cadastro de teste: 05.540.238/0001-23).');
      } else if (state.step === 'equipment') {
        const list = await sac.equipment(state.data.companyId);
        state.options = list;
        await send('Selecione o equipamento:\n' + list.map((item, i) => `${i + 1} — ${item.name} | ${item.serial}`).join('\n'));
      } else if (state.step === 'address') {
        const list = await sac.addresses(state.data.companyId);
        state.options = list;
        await send('Selecione o endereço:\n' + list.map((item, i) => `${i + 1} — ${item.address}`).join('\n'));
      } else if (state.step === 'review') {
        await send(`Resumo do TESTE:\nCNPJ: ${state.data.cnpj}\nEquipamento: ${state.data.equipmentLabel}\nEndereço: ${state.data.addressLabel}\nNome: ${state.data.requester}\nTelefone: ${state.data.phone}\nE-mail: ${state.data.email}\nProblema: ${state.data.description}\n\n1 — Salvar chamado de teste\n2 — Corrigir (reiniciar preenchimento)\n0 — Cancelar`);
      } else {
        const prompts = { requester: 'Informe seu nome completo.', phone: 'Informe seu telefone com DDD, preferencialmente WhatsApp.', email: 'Informe seu e-mail.', description: 'Descreva o problema.' };
        await send(prompts[state.step]);
      }
      // Aqui a mensagem do cliente vem do teclado. No WhatsApp ela viria do backend.
      const input = (await terminal.question('Cliente: ')).trim();
      if (input === '0' || input.toLowerCase() === 'cancelar') {
        await send('Cancelar abertura? Os dados do preenchimento serão descartados.\n1 — Sim, cancelar\n2 — Continuar');
        let answer;
        do {
          answer = (await terminal.question('Cliente: ')).trim();
          if (!['1', '2'].includes(answer)) await send('Opção inválida. Digite 1 para cancelar ou 2 para continuar.');
        } while (!['1', '2'].includes(answer));
        // Continuar preserva a etapa e os dados; cancelar remove só a sessão temporária.
        if (answer === '2') continue;
        db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
        await send('Abertura cancelada. Nenhum novo chamado foi aberto. Execute o teste novamente para começar.');
        break;
      }
      try {
        if (state.step === 'cnpj') {
          if (!validCnpj(input)) throw new Error('CNPJ inválido. Confira os 14 dígitos.');
          // Validar os dígitos não prova cadastro: o GET precisa encontrar a empresa.
          const company = await sac.company(input);
          state.data = { companyId: company.id, cnpj: company.cnpj };
          state.step = 'equipment';
        } else if (state.step === 'equipment' || state.step === 'address') {
          // A opção exibida (1, 2...) aponta para o registro retornado pela API.
          // Salvamos o ID do banco, que pode ser diferente do número escolhido.
          const option = /^[1-9]\d*$/.test(input) ? state.options[Number(input) - 1] : undefined;
          if (!option) throw new Error('Escolha um dos números apresentados.');
          if (state.step === 'equipment') {
            state.data.equipmentId = option.id;
            state.data.equipmentLabel = `${option.name} | ${option.serial}`;
            state.step = 'address';
          } else {
            state.data.addressId = option.id;
            state.data.addressLabel = option.address;
            state.step = 'requester';
          }
          delete state.options;
        } else if (state.step === 'review') {
          if (input === '2') { state = { step: 'cnpj', data: {}, requestId: randomUUID() }; continue; }
          if (input !== '1') throw new Error('Escolha 1 para salvar ou 2 para corrigir.');
          // Único ponto que cria chamado: ocorre após o cliente confirmar o resumo.
          // O servidor usa requestId para devolver o mesmo registro em uma repetição.
          const ticket = await sac.createTicket({ ...state.data, requestId: state.requestId });
          await send(`Registro de teste #${ticket.id} salvo no SQLite. Nenhum chamado foi aberto no SAC.`);
          db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
          break;
        } else {
          if (!input || input.length > 8000) throw new Error('Informe um texto de 1 a 8000 caracteres.');
          if (state.step === 'phone' && !validPhone(input)) throw new Error('Telefone inválido. Informe DDD e telefone brasileiro.');
          if (state.step === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) throw new Error('E-mail inválido. Confira o formato.');
          // Só avançamos após validar. Números na descrição são texto, exceto o 0 global.
          const next = { requester: 'phone', phone: 'email', email: 'description', description: 'review' };
          state.data[state.step] = input;
          state.step = next[state.step];
        }
      } catch (error) { await send(`${error.message}\nCorrija a resposta e tente novamente.`); }
    }
  } finally {
    // Fecha recursos mesmo quando a conversa termina por erro.
    terminal.close();
    await server.close();
    db.close();
  }
}
