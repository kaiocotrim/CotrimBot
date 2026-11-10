"use client";

import { useId, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Save, Eye, PlugZap, BookOpen, ArrowRight, Braces, Check, Copy, LoaderCircle, FlaskConical } from 'lucide-react';
import { defaultSacIntegrations, previewBotRoute, validateBotIntegrations, type BotIntegrations, type BotIntegrationRoute } from '../../../backend/src/services/bot-integrations';
import { BotSelect } from './bot-select';
import styles from './bot-integrations.module.css';

const sample = { cnpj: '05540238000123', empresaId: '1', equipamentoId: '1', enderecoId: '1', solicitante: 'Pessoa Teste', telefone: '27999999999', email: 'teste@example.com', motivo: 'O scanner não está ligando.' };
const variableLabels: Record<keyof typeof sample, string> = { cnpj: 'CNPJ da empresa', empresaId: 'Identificador da empresa', equipamentoId: 'Identificador do equipamento', enderecoId: 'Identificador do endereço', solicitante: 'Nome do solicitante', telefone: 'Telefone de contato', email: 'E-mail de contato', motivo: 'Descrição do problema' };
const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(value => ({ value, label: value }));
const steps = [
  { title: 'Defina a conexão', text: 'Use a URL base fornecida pela sua API, como https://api.exemplo.com.br/v1. Não inclua credenciais, parâmetros ou fragmentos nessa URL.' },
  { title: 'Configure a autenticação', text: 'Se a API usar Bearer, informe somente o nome da variável de ambiente, como SAC_API_TOKEN. O valor do token fica no servidor. Deixe o campo vazio quando a API não usar Bearer.' },
  { title: 'Ajuste as quatro operações', text: 'Selecione cada operação e configure método e rota conforme a documentação da sua API. Os caminhos preenchidos são exemplos. Em Cabeçalhos, use um objeto JSON; em requisições com corpo, coloque as variáveis dentro de strings.' },
  { title: 'Confira a prévia', text: 'Abra Dados de exemplo para a prévia para alterar os valores de teste. Visualizar requisição monta a URL, os cabeçalhos e o corpo localmente. Nenhuma chamada é enviada e nenhum token é lido.' },
  { title: 'Salve no bot', text: 'Salvar integrações no rascunho guarda a configuração neste bot. Ao publicar, ela também acompanha a versão publicada. Os dados de exemplo da prévia não são salvos.' },
];

/** Editor de contratos da integração. A prévia nunca envia requisições ao SAC. */
export function BotIntegrationsPanel({ value, botName, onChange, onSave }: {
  value: BotIntegrations | undefined; botName: string; onChange: (value: BotIntegrations) => void; onSave: (value: BotIntegrations) => Promise<void>;
}) {
  const config = value ?? defaultSacIntegrations();
  const reduced = useReducedMotion();
  const highlightId = useId();
  const [view, setView] = useState<'configuration' | 'guide'>('configuration');
  const [routeId, setRouteId] = useState('company');
  const [samples, setSamples] = useState(JSON.stringify(sample, null, 2));
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const route = config.routes.find(item => item.id === routeId) ?? config.routes[0]!;
  const resetPreview = () => { setPreview(''); setCopied(false); setError(''); };
  const change = (next: BotIntegrations) => { onChange(next); resetPreview(); };
  const editRoute = (patch: Partial<BotIntegrationRoute>) => change({ ...config, routes: config.routes.map(item => item.id === route.id ? { ...item, ...patch } : item) });
  async function save() {
    if (saving) return;
    try { validateBotIntegrations(config); setError(''); setSaving(true); await onSave(config); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar.'); }
    finally { setSaving(false); }
  }
  function showPreview() {
    try {
      const values: unknown = JSON.parse(samples);
      if (!values || typeof values !== 'object' || Array.isArray(values) || Object.values(values).some(v => typeof v !== 'string')) throw new Error('Informe um objeto JSON com valores de texto para as variáveis.');
      if (!config.baseUrl.trim()) throw new Error('Informe a URL base para montar a prévia.');
      setPreview(JSON.stringify(previewBotRoute(config, route.id, values as Record<string, string>), null, 2)); setCopied(false); setError('');
    } catch (e) { setPreview(''); setError(e instanceof Error ? e.message : 'Não foi possível montar a prévia.'); }
  }
  const entrance = { initial: reduced ? false as const : { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: reduced ? 0 : -4 }, transition: { duration: reduced ? 0 : .2 } };
  return <section className={styles.page} aria-label="Integrações do chamado">
    <div className={styles.content}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>{botName || 'Seu bot'} / Integrações</p><h1><span className={styles.icon}><PlugZap size={23} /></span> Conecte o próximo passo.</h1><p className={styles.subtitle}>Prepare a integração com o SAC, uma operação de cada vez.</p></div>
        <div className={styles.segment} role="tablist" aria-label="Integrações do SAC">{([{ id: 'configuration', label: 'Configuração', icon: PlugZap }, { id: 'guide', label: 'Como usar', icon: BookOpen }] as const).map(item => <button type="button" role="tab" id={`${highlightId}-${item.id}-tab`} aria-controls={`${highlightId}-${item.id}`} aria-selected={view === item.id} key={item.id} onClick={() => setView(item.id)}>
          {view === item.id && <motion.span className={styles.highlight} layoutId={highlightId} transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 340, damping: 32 }} />}
          <item.icon size={14} /><span>{item.label}</span>
        </button>)}</div>
      </header>
      <div className={styles.mode}><FlaskConical size={17} /><div><strong>Ambiente de teste</strong><p>As rotas ficam preparadas no bot. A conexão real com o SAC ainda não está ativa.</p></div></div>
      <AnimatePresence mode="wait" initial={false}>
        {view === 'guide' ? <motion.div key="guide" {...entrance} role="tabpanel" id={`${highlightId}-guide`} aria-labelledby={`${highlightId}-guide-tab`} className={styles.guide}>
          <section className={styles.card}><div className={styles.cardHeading}><BookOpen size={18} /><div><h2>Da configuração à prévia</h2><p>Tenha em mãos a documentação da API que você vai integrar.</p></div></div><ol className={styles.steps}>{steps.map((step, index) => <li key={step.title}><span>{index + 1}</span><div><h3>{step.title}</h3><p>{step.text}</p></div></li>)}</ol></section>
          <section className={styles.card}><h2>Variáveis disponíveis</h2><p className={styles.muted}>Elas preenchem as rotas e o JSON com os dados coletados no atendimento.</p><div className={styles.variableTable}>{Object.entries(variableLabels).map(([key, description]) => <div key={key}><code>{`{{${key}}}`}</code><span>{description}</span></div>)}</div><h3>Exemplo de corpo JSON</h3><pre className={styles.code}>{JSON.stringify({ empresaId: '{{empresaId}}', equipamentoId: '{{equipamentoId}}', descricao: '{{motivo}}' }, null, 2)}</pre><p className={styles.muted}>GET não usa corpo. Cabeçalhos com Authorization, API Key, cookies ou outros segredos são rejeitados; use a variável do token.</p></section>
          <section className={styles.card}><h2>Se algo precisar de ajuste</h2><div className={styles.answers}><div><h3>A prévia não aparece?</h3><p>Confira a URL base, o JSON das quatro operações e os valores das variáveis de teste. A mensagem de erro indica o que revisar.</p></div><div><h3>Salvar já conecta o SAC?</h3><p>Ainda não. O atendimento continua usando o catálogo de demonstração e registros de teste. O simulador não grava chamados. A execução real depende da implementação da conexão com a API.</p></div><div><h3>Onde está minha configuração?</h3><p>Ela pertence ao bot selecionado. Reabra o mesmo bot para continuar. Salvar o rascunho mantém a versão publicada; Publicar inclui as alterações na publicação.</p></div></div><button type="button" className={styles.button} onClick={() => setView('configuration')}>Começar a configurar <ArrowRight size={14} /></button></section>
        </motion.div> : <motion.div key="configuration" {...entrance} role="tabpanel" id={`${highlightId}-configuration`} aria-labelledby={`${highlightId}-configuration-tab`}>
          <section className={styles.card}><div className={styles.cardHeading}><PlugZap size={18} /><div><h2>Conexão</h2><p>Um endereço base para as quatro operações.</p></div></div><div className={styles.connectionGrid}>
            <label className={styles.field}>URL base da API<input type="url" placeholder="https://api.exemplo.com.br/v1" value={config.baseUrl} maxLength={2000} onChange={e => change({ ...config, baseUrl: e.target.value })} /></label>
            <label className={styles.field}>Variável do token Bearer no servidor<input value={config.tokenEnv} placeholder="SAC_API_TOKEN" maxLength={100} onChange={e => change({ ...config, tokenEnv: e.target.value })} /><small>Apenas o nome da variável. Deixe vazio se a API não usar Bearer.</small></label>
          </div></section>
          <div className={styles.operationsHeading}><h2>Operações do chamado</h2><span>4 etapas</span></div>
          <div className={styles.operations} aria-label="Operações do chamado">{config.routes.map((item, i) => <button type="button" key={item.id} aria-label={`${i + 1}. ${item.name} ${item.method}`} aria-pressed={route.id === item.id} onClick={() => { setRouteId(item.id); resetPreview(); }}>
            {route.id === item.id && <motion.span className={styles.operationHighlight} layoutId={`${highlightId}-operation`} transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 32 }} />}
            <span className={styles.operationNumber}>{i + 1}</span><span className={styles.operationName}>{item.name}</span><span className={styles.method}>{item.method}</span>
          </button>)}</div>
          <div className={styles.editorGrid}><section className={styles.card} aria-label="Configurar operação"><div className={styles.cardHeading}><Braces size={18} /><div><h2>{route.name}</h2><p>Ajuste os exemplos conforme a documentação da sua API.</p></div></div>
            <div className={styles.routeGrid}><label className={styles.field}>Método HTTP<BotSelect label="Método HTTP" value={route.method} options={methods} onChange={method => editRoute({ method: method as BotIntegrationRoute['method'], ...(method === 'GET' ? { body: '' } : {}) })} /></label><label className={styles.field}>Rota<input value={route.path} maxLength={2000} onChange={e => editRoute({ path: e.target.value })} spellCheck={false} /></label></div>
            <label className={styles.field}>Cabeçalhos (JSON)<textarea spellCheck={false} rows={3} value={route.headers} maxLength={8000} onChange={e => editRoute({ headers: e.target.value })} /></label>
            {route.method !== 'GET' && <label className={styles.field}>Corpo da requisição (JSON)<textarea spellCheck={false} rows={8} value={route.body} maxLength={16000} onChange={e => editRoute({ body: e.target.value })} /></label>}
            <details className={styles.details}><summary>Variáveis disponíveis <span>8 variáveis</span></summary><div className={styles.chips}>{Object.keys(sample).map(key => <code key={key}>{`{{${key}}}`}</code>)}</div><p className={styles.muted}>No corpo JSON, coloque as variáveis entre aspas.</p></details>
          </section>
          <section className={`${styles.card} ${styles.previewCard}`} aria-label="Prévia da requisição"><div className={styles.cardHeading}><Eye size={18} /><div><h2>Confira antes de salvar</h2><p>Uma prévia local, sem enviar dados ao SAC.</p></div></div>
            <details className={styles.details}><summary>Dados de exemplo para a prévia</summary><label className={styles.field}>Variáveis de teste (JSON)<textarea spellCheck={false} rows={9} value={samples} maxLength={16000} onChange={e => { setSamples(e.target.value); resetPreview(); }} /></label></details>
            <button className={styles.button} type="button" onClick={showPreview}><Eye size={15} /> Visualizar requisição</button>
            {preview ? <div className={styles.preview}><div className={styles.previewHeading}><h3>Prévia — nenhuma requisição foi enviada</h3><button type="button" aria-label={copied ? 'Prévia copiada' : 'Copiar prévia'} onClick={async () => { try { await navigator.clipboard.writeText(preview); setCopied(true); } catch { setError('Não foi possível copiar a prévia. Selecione o texto para copiar.'); } }}>{copied ? <Check size={14} /> : <Copy size={14} />}</button></div><pre className={styles.code}>{preview}</pre></div> : <div className={styles.empty}><Braces size={27} /><p>A requisição aparece aqui.</p><span>Preencha a conexão e visualize a operação selecionada.</span></div>}
          </section></div>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          <footer className={styles.footer}><p>Configuração exclusiva deste bot.<br /><span>As alterações acompanham a próxima publicação.</span></p><button className={styles.primary} type="button" disabled={saving} onClick={() => void save()}>{saving ? <LoaderCircle size={15} className={styles.spin} /> : <Save size={15} />} {saving ? 'Salvando…' : 'Salvar integrações no rascunho'}</button></footer>
        </motion.div>}
      </AnimatePresence>
    </div>
  </section>;
}
