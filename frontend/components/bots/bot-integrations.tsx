"use client";

import { useState } from 'react';
import { Save, Eye, PlugZap } from 'lucide-react';
import { defaultSacIntegrations, previewBotRoute, validateBotIntegrations, type BotIntegrations, type BotIntegrationRoute } from '../../../backend/src/services/bot-integrations';
import styles from './bot-designer.module.css';

const sample = { cnpj: '05540238000123', empresaId: '1', equipamentoId: '1', enderecoId: '1', solicitante: 'Pessoa Teste', telefone: '27999999999', email: 'teste@example.com', motivo: 'O scanner não está ligando.' };
const variables = Object.keys(sample).map(key => `{{${key}}}`).join(' · ');

/** Editor de contratos da integração. A prévia nunca envia requisições ao SAC. */
export function BotIntegrationsPanel({ value, onChange, onSave }: {
  value: BotIntegrations | undefined; onChange: (value: BotIntegrations) => void; onSave: (value: BotIntegrations) => Promise<void>;
}) {
  const config = value ?? defaultSacIntegrations();
  const [routeId, setRouteId] = useState('company');
  const [samples, setSamples] = useState(JSON.stringify(sample, null, 2));
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const route = config.routes.find(item => item.id === routeId) ?? config.routes[0]!;
  const change = (next: BotIntegrations) => { onChange(next); setPreview(''); setError(''); };
  const editRoute = (patch: Partial<BotIntegrationRoute>) => change({ ...config, routes: config.routes.map(item => item.id === route.id ? { ...item, ...patch } : item) });
  async function save() {
    try {
      validateBotIntegrations(config);
      setError(''); await onSave(config);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar.'); }
  }
  function showPreview() {
    try {
      const values: unknown = JSON.parse(samples);
      if (!values || typeof values !== 'object' || Array.isArray(values) || Object.values(values).some(v => typeof v !== 'string')) throw new Error('Informe um objeto JSON com valores de texto para as variáveis.');
      if (!config.baseUrl.trim()) throw new Error('Informe a URL base para montar a prévia.');
      setPreview(JSON.stringify(previewBotRoute(config, route.id, values as Record<string, string>), null, 2)); setError('');
    } catch (e) { setPreview(''); setError(e instanceof Error ? e.message : 'Não foi possível montar a prévia.'); }
  }
  return <section className={`${styles.settingsPanel} ${styles.integrationPanel}`} aria-label="Integrações do chamado">
    <h2><PlugZap size={18} /> Integração com o SAC</h2>
    <p className={styles.helper}>Configure as quatro operações do chamado. Os caminhos abaixo são exemplos: ajuste conforme a documentação da sua API.</p>
    <p className={styles.integrationMode}>🧪 O atendimento continua usando a base de teste. Salvar estas rotas não envia dados ao SAC nem ativa chamadas externas.</p>
    <div className={styles.integrationGrid}>
      <label>URL base da API<input className={styles.field} type="url" placeholder="https://api.exemplo.com.br" value={config.baseUrl} maxLength={2000} onChange={e => change({ ...config, baseUrl: e.target.value })} /></label>
      <label>Variável do token Bearer no servidor<input className={styles.field} value={config.tokenEnv} placeholder="SAC_API_TOKEN" maxLength={100} onChange={e => change({ ...config, tokenEnv: e.target.value })} /></label>
    </div>
    <p className={styles.helper}>Informe apenas o nome da variável. O valor do token fica no ambiente do servidor e não deve ser colado neste painel. Deixe vazio se a API não usar Bearer.</p>
    <div className={styles.integrationOperations} aria-label="Operações do chamado">{config.routes.map((item, i) => <button type="button" className={styles.button} key={item.id} aria-pressed={route.id === item.id} onClick={() => { setRouteId(item.id); setPreview(''); setError(''); }}><span>{i + 1}. {item.name}</span><small>{item.method}</small></button>)}</div>
    <h3>{route.name}</h3>
    <div className={styles.integrationGrid}>
      <label>Método HTTP<select className={styles.field} value={route.method} onChange={e => editRoute({ method: e.target.value as BotIntegrationRoute['method'], ...(e.target.value === 'GET' ? { body: '' } : {}) })}>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(method => <option key={method}>{method}</option>)}</select></label>
      <label>Rota<input className={styles.field} value={route.path} maxLength={2000} onChange={e => editRoute({ path: e.target.value })} /></label>
    </div>
    <label>Cabeçalhos (JSON)<textarea className={styles.field} spellCheck={false} rows={4} value={route.headers} maxLength={8000} onChange={e => editRoute({ headers: e.target.value })} /></label>
    {route.method !== 'GET' && <label>Corpo da requisição (JSON)<textarea className={styles.field} spellCheck={false} rows={10} value={route.body} maxLength={16000} onChange={e => editRoute({ body: e.target.value })} /></label>}
    <p className={styles.helper}>Variáveis disponíveis: {variables}. No corpo JSON, coloque as variáveis entre aspas.</p>
    <details><summary>Dados de exemplo para a prévia</summary><label>Variáveis de teste (JSON)<textarea className={styles.field} spellCheck={false} rows={9} value={samples} onChange={e => setSamples(e.target.value)} /></label></details>
    <div className={styles.actions}><button className={styles.button} type="button" onClick={showPreview}><Eye size={15} /> Visualizar requisição</button><button className={styles.primary} type="button" onClick={() => void save()}><Save size={15} /> Salvar integrações no rascunho</button></div>
    {error && <p role="alert" className={styles.danger}>{error}</p>}
    {preview && <div><h3>Prévia — nenhuma requisição foi enviada</h3><pre className={styles.integrationPreview}>{preview}</pre></div>}
    <p className={styles.helper}>As configurações são salvas por bot no rascunho e incluídas ao publicar. O SDK pode consultá-las em bots.list(). A execução real será conectada quando a API do SAC estiver disponível.</p>
  </section>;
}
