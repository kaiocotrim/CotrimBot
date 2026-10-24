# Aba Integrações na Central de Bots

Abra **Central de Bots → selecione o bot → Integrações**. O painel configura os
contratos das quatro operações usadas na abertura de chamados. A aba ocupa toda a
área de trabalho, sem a barra lateral de componentes do fluxo.

No topo, **Configuração** abre o editor e **Como usar** apresenta o guia dentro da
própria tela. O nome do bot aparece acima do título para identificar onde as
alterações serão salvas.

As operações disponíveis são:

| Operação | Método inicial | Caminho ilustrativo |
| --- | --- | --- |
| Consultar empresa pelo CNPJ | GET | `/empresas?cnpj={{cnpj}}` |
| Consultar equipamentos | GET | `/empresas/{{empresaId}}/equipamentos` |
| Consultar endereços | GET | `/empresas/{{empresaId}}/enderecos` |
| Criar chamado | POST | `/chamados` |

Essas rotas são exemplos, não documentação da Infordoc. Configure os caminhos,
métodos e nomes de campos conforme a documentação oficial que sua empresa receber.

## Configurar

1. Informe a URL base, por exemplo `https://api.exemplo.com.br/v1`.
2. Se a API usar autenticação Bearer, informe o **nome** da variável do token,
   como `SAC_API_TOKEN`. Nunca cole o token no painel; seu valor deverá ser
   configurado no ambiente do servidor na futura conexão com a API.
3. Selecione um dos quatro cartões de operação e ajuste método, rota e cabeçalhos JSON.
   O menu de métodos pode ser usado com clique ou teclado (setas, Enter e Escape).
4. Para POST, PUT, PATCH ou DELETE, configure o corpo JSON quando necessário.
   GET não aceita corpo neste painel.
5. Clique em **Visualizar requisição** para conferir URL, cabeçalhos e corpo.
6. Se quiser compartilhar o resultado, use **Copiar prévia**. A prévia mostra apenas
   a referência da variável do token, nunca o segredo.
7. Clique em **Salvar integrações no rascunho**. A configuração será recuperada
   ao reabrir o bot. Publicar o bot também inclui esse contrato na versão publicada.

Variáveis disponíveis nos exemplos: `{{cnpj}}`, `{{empresaId}}`,
`{{equipamentoId}}`, `{{enderecoId}}`, `{{solicitante}}`, `{{telefone}}`,
`{{email}}` e `{{motivo}}`. Coloque variáveis dentro de strings no corpo JSON:

```json
{
  "empresaId": "{{empresaId}}",
  "equipamentoId": "{{equipamentoId}}",
  "descricao": "{{motivo}}"
}
```

Em **Dados de exemplo para a prévia**, é possível editar os valores de teste.
Eles são usados somente no navegador para montar a prévia; não são gravados na
configuração. A prévia codifica os valores de URL e preserva aspas/quebras de linha
dos valores no corpo JSON. Não lê o token do ambiente nem envia chamadas externas.

## Comportamento desta versão

Esta entrega cadastra, valida, salva e apresenta as rotas. **Não conecta a API real
do SAC.** O fluxo `SAC_TEST` continua consultando o catálogo de demonstração e
salvando registros de teste no MySQL. Alterar ou publicar as configurações não muda
esse comportamento. Assim, é possível preparar o contrato sem abrir chamados reais.

Quando a API estiver disponível, será necessário implementar seu transporte,
autenticação, tratamento de respostas e vínculo das operações às etapas da coleta,
de acordo com a documentação. A referência da variável de token fica pronta para
essa etapa; esta versão não utiliza seu valor.

## Persistência e SDK

O contrato é salvo em `Bot.draft.integrations` e, após publicação, em
`Bot.published.integrations`. Não há tabela nova ou alteração de esquema. Os menus
anteriores continuam compatíveis; `integrations` é opcional para bots existentes.
As rotas existentes de salvar/publicar mantêm as permissões administrativas da empresa.

O SDK já permite recuperar o JSON do bot por `client.bots.list()` e atualizar o
rascunho por `client.bots.update(...)`. O campo `integrations` acompanha o JSON do
fluxo. O SDK é o cliente do CotrimBot; os contratos cadastrados descrevem a API do SAC.

O backend valida as quatro operações, métodos suportados, JSON, identificadores
únicos e formatos de URL. Cabeçalhos com credenciais, como Authorization ou API Key,
são rejeitados para evitar salvar segredos no rascunho/publicação.

## Resolver dúvidas na tela

- **A prévia não aparece:** preencha a URL base e confira a mensagem de erro. A
  validação considera as quatro operações, mesmo quando você visualiza apenas uma.
- **JSON inválido:** use aspas duplas nos nomes e valores de texto, sem vírgula após
  o último campo. Variáveis no corpo também ficam entre aspas.
- **Variável ausente:** abra **Dados de exemplo para a prévia** e adicione a chave
  solicitada com um valor de texto. Alterar esses dados limpa a prévia anterior.
- **Token rejeitado:** informe apenas um nome de variável, em letras maiúsculas,
  números e sublinhado, começando por uma letra. Não informe credenciais nos
  cabeçalhos.
- **Quero voltar ao editor:** use **Fluxo** na navegação superior. A configuração
  permanece no rascunho em memória; salve para recuperá-la após recarregar a página.
