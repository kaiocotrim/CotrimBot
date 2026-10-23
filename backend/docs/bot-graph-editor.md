# Editor visual do fluxo

O seletor **Modo de visualização**, na barra do canvas, oferece **Padrão** (a edição
anterior, por menu) e **Modo 2 · n8n** (visão geral, com todos os menus e opções no
mesmo canvas). A primeira abertura usa Padrão; o navegador lembra a última escolha.
Os dois modos compartilham as configurações do bot e mantêm suas posições separadas.
O fundo é cinza neutro, com cores nos blocos para distinguir suas funções.

## Navegar e editar

- Clique em um bloco para editar sua configuração no painel lateral.
- Arraste o bloco para mudar sua posição; salve o rascunho para manter o desenho.
- Arraste o fundo para navegar e use a roda do mouse ou os botões para dar zoom.
- Use **Ajustar** para ver o desenho completo, **Organizar** para redistribuir os
  blocos automaticamente e **Minimapa** para navegar por fluxos maiores.
- **Tela cheia** abre o canvas ampliado, com editor lateral disponível ao selecionar
  um bloco. As animações respeitam a preferência de movimento reduzido.
- Os componentes da lateral podem ser arrastados para o canvas. São adicionados
  ao menu selecionado, na posição em que forem soltos.

## Criar e remover ligações

O motor do CotrimBot continua usando menus e opções numéricas. A visão geral
mostra as relações reais desse modelo:

```text
Menu → opção escolhida pelo cliente → menu de destino
```

Para encaminhar uma opção a outro menu, arraste o ponto de saída da opção até a
entrada do menu desejado. Também é possível clicar na saída e depois na entrada,
ou focar os dois pontos com Tab e confirmar cada um com Enter. Esc cancela a ligação.

As saídas editáveis estão disponíveis nas ações **Mensagem** e **Ir para menu**.
Conectar uma mensagem transforma sua ação em **Ir para menu**, preservando a resposta
anterior na configuração. As ações de atendimento humano, encerramento, imagem e
coleta de chamados conservam seu comportamento próprio e não oferecem essa saída.

Clique em uma ligação entre uma opção e seu destino e escolha **Remover ligação**
para desfazer o encaminhamento. A opção volta ao tipo Mensagem; configure uma
resposta antes de publicar, se ela ainda estiver vazia.

Os pontos que saem dos menus representam suas opções já cadastradas. Para editar
o número, nome ou menu de origem de uma opção, use o editor correspondente. A visão
geral não cria uma linguagem de execução diferente nem sequências automáticas
entre ações que o motor atual não suporta.

## Compatibilidade e persistência

As ligações são salvas nos mesmos campos `action` e `targetMenuId` das opções.
A execução do bot e o simulador continuam lendo esses campos. As posições ficam
em `flow.layout`, em chaves `graph:<menuId>:menu` e `graph:<menuId>:<optionId>`.
As posições da edição por menu são mantidas separadamente. **Organizar** remove
somente as posições da visão geral.

Bots existentes são projetados no novo canvas sem migrations ou alterações no
banco. Editar as ligações modifica o rascunho; publicar continua sendo uma ação
explícita do editor. Nenhum fluxo é publicado apenas por abrir a visão geral.
