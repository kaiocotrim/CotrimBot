# CotrimBot mobile

Aplicativo nativo React Native + Expo para Android e iOS, no workspace `@cotrimbot/mobile`.

## Primeira versão

A interface nativa acompanha o tema escuro do PWA: login “Converse. Conquiste.” com a mesma colagem de imagens, campos e botões arredondados; lista com fotos, busca, abas Minhas/Grupos/Conversas, arquivadas e contadores de mensagens não lidas; chat com cabeçalho do contato, mensagens cinza e separadores por dia. A aba Minhas usa os `assignedUserIds` retornados pelo backend. O servidor continua configurável no login e é lembrado após entrar.

A tela inicial usa fundo preto, busca em cápsula, fotos maiores e divisórias discretas entre as conversas. A barra inferior arredondada tem fundo escuro e fica sobreposta à lista. A área externa à cápsula é transparente, permitindo ver os contatos passando por trás durante a rolagem. O espaçamento ao final da lista permite acessar o último contato acima da barra. A opção Arquivadas aparece somente quando há conversas arquivadas; se a última for desarquivada, a lista volta às conversas ativas. Abaixo da busca, uma faixa de botões arredondados em uma única linha com rolagem horizontal até as bordas da tela permite combinar Não lido, Favoritos, Prioridade e um responsável da lista de membros (incluindo a conta do bot). Favoritos considera conversas com mensagens favoritadas, sem incluir mensagens apagadas para a conta; Prioridade considera LOW, MEDIUM e HIGH. Toque novamente para desativar um filtro; trocar de seção limpa os filtros. A lista solicita `GET /contacts?includeFavoriteCounts=1`, disponível no backend deste repositório. A busca, os filtros e a opção Arquivadas rolam com a lista; uma transição com desfoque e degradê suaviza a passagem dos contatos sob o título. Em Android anterior ao 12, a transição mantém o degradê sem o desfoque nativo. Ela permite alternar entre Conversas, Minhas, Grupos, Contatos e Perfil. O destaque desliza entre as opções e o conteúdo permanece visível durante um breve deslocamento, respeitando a preferência Reduzir movimento do aparelho. Minhas mostra somente as conversas atribuídas à conta conectada. Contatos lista os contatos individuais em ordem alfabética e abre suas informações; Perfil mostra a conta conectada, o servidor, o estado da conexão e a opção de sair.

Essa equivalência é visual nas telas nativas existentes. Google login, animação WebGL da marca, temas alternativos e os módulos exclusivos do PWA ainda não estão disponíveis no app.

O chat usa fundo preto, balões cinza com foto do autor e horário, e campo de mensagem junto à área segura inferior. No iOS, o teclado desloca a conversa sem repetir a margem do indicador de início; no Android, o ajuste usa o redimensionamento da janela. Toque na foto ou no nome do cabeçalho para abrir Informações do contato: nome, telefone, empresa, cargo, links da empresa, edição e biblioteca paginada de mídias, links e documentos. Imagens abrem no visualizador; documentos e vídeos são baixados com autenticação e abrem a folha nativa para salvar ou abrir em outro app.

As informações também permitem alterar múltiplos responsáveis, selecionar ou limpar a prioridade e consultar o status ativo/arquivado. “Encerrar chamado” pede confirmação e usa a mesma ação do PWA: envia a pesquisa de satisfação e remove os responsáveis; o status exibido continua refletindo o campo de arquivamento do backend. “Localizar mensagem nesta conversa” abre uma busca que percorre o histórico paginado, informa quando a pesquisa está incompleta por falha de rede e permite tocar num resultado para localizar sua posição na conversa. Fechar a busca interrompe a leitura das páginas seguintes.

- Login com servidor, e-mail e senha das contas existentes.
- Token de sessão no Expo SecureStore; restauração de sessão e logout.
- Conversas com busca, filtro de arquivadas e contadores de mensagens não lidas.
- Histórico paginado, envio de texto e marcação de leitura.
- Socket.IO com autenticação Bearer e reconexão ao voltar ao aplicativo.

Imagens e figurinhas são exibidas no chat com autenticação Bearer, legenda, tentativa de recarregar e visualização ampliada. Fotos com caminhos relativos são resolvidas pelo servidor configurado. Áudios possuem reprodução, pausa, avanço e velocidades 1×/1,5×/2×; o arquivo é carregado quando o usuário inicia a reprodução. Vídeos ainda não possuem reprodução dentro do chat. Push nativo, Google login, chat interno e telas administrativas ainda não foram migrados.

O texto do rascunho é salvo no aparelho a cada alteração, separado por servidor, conta, empresa ativa e contato. Reabrir a conversa restaura o texto; enviar com sucesso limpa o rascunho. Anexos e citações selecionados não são restaurados após fechar o app. Falhas de armazenamento são mostradas na conversa. Os salvamentos são serializados para impedir que uma escrita antiga restaure texto já enviado.

Com o campo vazio, o microfone abre um painel com contador, onda baseada no nível real do microfone, pausa/continuação, lixeira e Enviar áudio. Um som local curto toca antes de iniciar a captura, e os controles usam resposta tátil quando disponível no aparelho. A pausa mantém o mesmo arquivo e permite continuar. Enviar áudio finaliza e envia somente após esse toque explícito. Falhas de upload mantêm o arquivo anexado para tentar novamente. O retorno tátil depende do hardware e dos ajustes do sistema. Expo Go inclui o módulo de haptics; development builds anteriores precisam de novo build após instalar a dependência. A gravação usa AAC/M4A (`audio/mp4`) e a rota de mídias existente; o backend a trata como arquivo de áudio (`isVoiceMessage: false`), sem conversão para PTT/Opus. Não há envio automático. Entrar em segundo plano interrompe a gravação e preserva a prévia; sair da tela cancela a gravação. A reprodução é pausada ao sair da tela/entrar em segundo plano e há apenas um áudio tocando por vez. Formatos recebidos dependem do suporte nativo do aparelho; falhas são exibidas com opção de tentar reproduzir novamente.

Pressione e segure um balão (ou uma imagem/figurinha) para sentir uma vibração leve e destacar a mensagem, escurecer o fundo e abrir uma barra de reações rápidas acima do balão e o menu abaixo, com animações suaves de abertura e fechamento. O conjunto se reposiciona para caber na área segura da tela. O toque prolongado funciona também sobre imagens, figurinhas, a onda de áudio e seus controles. O menu oferece Responder, Copiar, Encaminhar, Fixar, Favoritar e Apagar; a barra superior permite reagir conforme o tipo de mensagem. Fixar permite 24 horas, 7 dias ou 30 dias; os indicadores de reação, fixação e favorito aparecem no balão e acompanham os eventos em tempo real. Encaminhar exige escolher o destino e confirmar; mídias são baixadas com autenticação e reenviadas, com limpeza do arquivo temporário. Notas privadas não oferecem encaminhamento nem reação pública. Apagar pede confirmação e permite apagar para mim ou, nas mensagens enviadas, para todos. Copiar usa Expo Clipboard; development builds anteriores precisam incluir essa dependência em um novo build. Para responder, escolha Responder no menu e escreva sua resposta. A citação aparece antes do envio e nas mensagens recebidas/enviadas. Mensagens apagadas, notas privadas e eventos do sistema não são oferecidos como alvo de resposta pública. A barra de mensagem tem fundo cinza, campo arredondado com o botão roxo de IA da versão web, “+” à esquerda e câmera ao lado do microfone. O botão de IA usa `/ai/rewrite` para reformular o rascunho de até 5.000 caracteres, sem enviá-lo. Durante a reformulação, edição e envio ficam bloqueados; erros mantêm o rascunho, e sair da tela descarta o resultado pendente. O botão “+” abre um painel com Fotos, Vídeo, Áudio, Documento, Enquete, Mensagem privada, Assinar mensagens e Encerrar chamado com Bot. Os seletores preservam a seleção anterior ao cancelar. Enquete permite uma pergunta de até 255 caracteres, de 2 a 12 opções diferentes de até 100 caracteres e seleção única ou múltipla; o envio acontece somente ao confirmar Enviar enquete. Falhas preservam os campos para tentar novamente. Mensagem privada ativa uma nota interna de texto, identificada no campo e enviada com `private: true`; anexos, câmera e áudio ficam desativados nesse modo. Rascunhos públicos e privados são salvos separadamente; reabrir a conversa inicia no modo público e o rascunho privado pode ser recuperado selecionando esse modo novamente. Assinar mensagens controla os envios de texto e mídia e começa ativado ao abrir a tela. Encerrar chamado com Bot usa a rota de encerramento existente, com confirmação, e fica indisponível para grupos. A câmera solicita permissão e permite tirar uma foto. Ambos mostram a prévia e permitem acrescentar legenda e citação. A permissão de câmera é configurada em `app.json`; development builds anteriores precisam ser reconstruídos para incluí-la. O arquivo só é enviado ao tocar em Enviar. Falhas preservam texto, anexo e resposta; cancelar o seletor mantém a seleção anterior. O upload usa multipart autenticado e aguarda até dois minutos, sem retentativa automática. Teste a seleção e o envio no aparelho, incluindo cancelamento, erro de rede e retorno do segundo plano.

Pressione e segure uma conversa por um instante para abrir uma prévia em um card sobre a lista. Ela consulta as 40 mensagens mais recentes, permite rolar as mensagens carregadas e não marca a conversa como lida. Toque fora do card, no X ou no botão Voltar do Android para fechar; Abrir conversa entra no chat e segue a marcação de leitura normal. O toque curto continua abrindo o chat diretamente.

A barra inferior mostra contadores de mensagens não lidas em Conversas (individuais), Minhas (individuais atribuídas à conta) e Grupos. Conversas arquivadas não entram nos totais; busca e filtros não alteram esses contadores. Os indicadores somem em zero e mostram 99+ acima de 99. A troca de números usa animação nativa de deslocamento e opacidade, respeitando Reduzir movimento. Eventos Socket.IO atualizam a lista sem requisições concorrentes; o evento `conversation_read` do backend sincroniza a redução do total quando alguém marca a conversa como lida. Para esse evento, atualize também o backend.

## Rodar

Na raiz do repositório:

```sh
npm install
npm run mobile:start
```

### Testar no iPhone com Expo Go

Dentro de `mobile/`, execute:

```sh
npm run start:go
```

Esse comando seleciona o Expo Go e o túnel ngrok. O pacote `@expo/ngrok` é uma dependência local de desenvolvimento, para evitar falhas na detecção da instalação global no Windows. Mantenha o terminal aberto e leia o QR code com a Câmera do iPhone; use uma versão do Expo Go compatível com SDK 58. Para limpar o cache, execute `npm run start:go -- --clear`.

Para usar a mesma rede Wi-Fi sem túnel, execute `npm start -- --go`. O túnel expõe o servidor de desenvolvimento por uma URL pública temporária e exige internet nos dois aparelhos. Ele não publica o aplicativo nas lojas nem torna um backend local acessível ao celular.

### Development build

O projeto usa Expo SDK 58 e também suporta um development build próprio. Como `expo-dev-client` está instalado, `npm start` seleciona esse modo por padrão. Instale o development build no aparelho e abra o QR code do Metro. Para criar o primeiro build, dentro de `mobile/`:

```sh
npx eas-cli@latest build --profile development --platform android
npx eas-cli@latest build --profile development --platform ios
```

O EAS pedirá login, vínculo do projeto e as credenciais de assinatura. A distribuição para aparelhos iOS exige configurar a conta Apple e registrar os dispositivos. Nenhum build foi publicado automaticamente.

Para compilar localmente, use `npx expo run:android` com Android SDK, ou `npx expo run:ios` em um Mac com Xcode. Os comandos `npm run mobile:android` e `npm run mobile:ios` abrem o development build já instalado.

## Servidor

Informe na tela de login a origem HTTPS do CotrimBot, por exemplo `https://chat.suaempresa.com.br`. `/api` é adicionado pelo cliente; também é aceito no campo e normalizado. Opcionalmente, crie `mobile/.env.local`:

```dotenv
EXPO_PUBLIC_SERVER_URL=https://chat.suaempresa.com.br
```

Essa variável é pública e serve somente para sugerir o servidor. Não coloque senhas ou tokens nela. Em desenvolvimento, HTTP é aceito pelo cliente; restrições de rede do sistema operacional ainda podem se aplicar. No celular use o IP da máquina na rede, pois `localhost` aponta para o próprio aparelho.

O backend atual já contém `bearer()` do Better Auth e aceita `Authorization: Bearer` nas rotas e no handshake Socket.IO. O cliente lê `set-auth-token` do login e não depende de cookies do navegador. O proxy deve encaminhar `/api` e `/socket.io` com suporte a WebSocket.

## Validar

```sh
npm run mobile:check
npm run test --workspace=@cotrimbot/mobile
```

Smoke test em Android e iOS: entrar, fechar/reabrir para restaurar sessão, buscar uma conversa, carregar anteriores, receber/enviar texto, alternar entre segundo plano e primeiro plano, testar falha de rede e sair. A validação estática e o bundle não substituem esses testes nos dispositivos.

## Builds de distribuição

Dentro de `mobile/`, `npx eas-cli@latest build --profile preview --platform android` gera APK interno. Use o perfil `production` para os builds das lojas. Os identificadores `com.cotrimbot.mobile` em `app.json` devem estar disponíveis nas contas das lojas antes do primeiro envio.
