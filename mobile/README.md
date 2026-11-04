# CotrimBot mobile

Aplicativo nativo React Native + Expo para Android e iOS, no workspace `@cotrimbot/mobile`.

## Primeira versão

A interface nativa acompanha o tema escuro do PWA: login “Converse. Conquiste.” com a mesma colagem de imagens, campos e botões arredondados; lista com fotos, busca, abas Minhas/Grupos/Conversas, arquivadas e filtro de não lidas; chat com cabeçalho do contato, mensagens cinza e separadores por dia. A aba Minhas usa os `assignedUserIds` retornados pelo backend. O servidor continua configurável no login e é lembrado após entrar.

Essa equivalência é visual nas telas nativas existentes. Google login, animação WebGL da marca, temas alternativos e os módulos exclusivos do PWA ainda não estão disponíveis no app.

O chat usa fundo preto, balões cinza com foto do autor e horário, e campo de mensagem junto à área segura inferior. No iOS, o teclado desloca a conversa sem repetir a margem do indicador de início; no Android, o ajuste usa o redimensionamento da janela. Toque na foto ou no nome do cabeçalho para abrir Informações do contato: nome, telefone, empresa, cargo, links da empresa, edição e biblioteca paginada de mídias, links e documentos. Imagens abrem no visualizador; documentos e vídeos são baixados com autenticação e abrem a folha nativa para salvar ou abrir em outro app.

As informações também permitem alterar múltiplos responsáveis, selecionar ou limpar a prioridade e consultar o status ativo/arquivado. “Encerrar chamado” pede confirmação e usa a mesma ação do PWA: envia a pesquisa de satisfação e remove os responsáveis; o status exibido continua refletindo o campo de arquivamento do backend. “Localizar mensagem nesta conversa” abre uma busca que percorre o histórico paginado, informa quando a pesquisa está incompleta por falha de rede e permite tocar num resultado para localizar sua posição na conversa. Fechar a busca interrompe a leitura das páginas seguintes.

- Login com servidor, e-mail e senha das contas existentes.
- Token de sessão no Expo SecureStore; restauração de sessão e logout.
- Conversas com busca, filtros de não lidas/arquivadas e contadores.
- Histórico paginado, envio de texto e marcação de leitura.
- Socket.IO com autenticação Bearer e reconexão ao voltar ao aplicativo.

Imagens e figurinhas são exibidas no chat com autenticação Bearer, legenda, tentativa de recarregar e visualização ampliada. Fotos com caminhos relativos são resolvidas pelo servidor configurado. Áudios possuem reprodução, pausa, avanço e velocidades 1×/1,5×/2×; o arquivo é carregado quando o usuário inicia a reprodução. Vídeos ainda não possuem reprodução dentro do chat. Push nativo, Google login, chat interno e telas administrativas ainda não foram migrados.

O texto do rascunho é salvo no aparelho a cada alteração, separado por servidor, conta, empresa ativa e contato. Reabrir a conversa restaura o texto; enviar com sucesso limpa o rascunho. Anexos e citações selecionados não são restaurados após fechar o app. Falhas de armazenamento são mostradas na conversa. Os salvamentos são serializados para impedir que uma escrita antiga restaure texto já enviado.

Com o campo vazio, o botão de microfone inicia a gravação após solicitar permissão. Pare para ouvir a prévia, descarte ou envie usando o mesmo fluxo de anexos. A gravação usa AAC/M4A (`audio/mp4`) e a rota de mídias existente; o backend a trata como arquivo de áudio (`isVoiceMessage: false`), sem conversão para PTT/Opus. Não há envio automático. Entrar em segundo plano interrompe a gravação e preserva a prévia; sair da tela cancela a gravação. A reprodução é pausada ao sair da tela/entrar em segundo plano e há apenas um áudio tocando por vez. Formatos recebidos dependem do suporte nativo do aparelho; falhas são exibidas com opção de tentar reproduzir novamente.

Para responder, toque na seta da mensagem ou pressione o balão e escreva sua resposta. A citação aparece antes do envio e nas mensagens recebidas/enviadas. Mensagens apagadas, notas privadas e eventos do sistema não são oferecidos como alvo de resposta pública. O botão “+” seleciona uma foto da galeria ou um documento, mostra a prévia e permite acrescentar legenda e citação. O arquivo só é enviado ao tocar em Enviar. Falhas preservam texto, anexo e resposta; cancelar o seletor mantém a seleção anterior. O upload usa multipart autenticado e aguarda até dois minutos, sem retentativa automática. Teste a seleção e o envio no aparelho, incluindo cancelamento, erro de rede e retorno do segundo plano.

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
