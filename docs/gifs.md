# GIFs no seletor do CotrimBot

1. Abra o seletor de emoji e escolha **GIF**.
2. Entre em <https://developers.giphy.com/dashboard/> com sua conta GIPHY, crie uma aplicação **API** para Web e copie a API key.
3. Cole a chave no campo **Chave da API GIPHY** e clique em **Conectar GIPHY**. A conexão só é salva depois de uma resposta válida do catálogo.
4. Pesquise um GIF e selecione-o. O GIF fica na prévia; o envio acontece apenas ao clicar em **Enviar mensagem**.

A chave fica no armazenamento deste navegador. Para configurar a mesma aplicação em todos os dispositivos, defina `NEXT_PUBLIC_GIPHY_API_KEY` no ambiente do frontend antes da build. A API GIPHY é acessada diretamente no navegador. Consulte os limites atuais e a aprovação de produção na [documentação oficial](https://developers.giphy.com/docs/api/).

O chat externo utiliza a versão MP4 do GIF, sem áudio, com `gifPlayback: true`. O banco salva essa indicação para manter a reprodução animada após recarregar a conversa. O chat interno usa o arquivo GIF original. A aba fica indisponível no modo de mensagem privada, pois o envio de mídia desse fluxo é público.

## Publicação

Esta versão exige reconstruir a imagem personalizada **Evolution** e a aplicação **CotrimBot**. A extensão aplica o suporte a `gifPlayback` ao upstream 2.3.7 fixado no Dockerfile, preservando o comportamento de vídeos comuns. A migração `20261027123000_add_message_gif_playback` é aplicada pelo fluxo Prisma de publicação já existente; não é necessário apagar bancos ou volumes.

```sh
docker compose build evolution-api cotrimbot
docker compose up -d --no-deps evolution-api cotrimbot
```

Sem a nova imagem Evolution, o MP4 pode chegar como vídeo comum. A integração completa com WhatsApp deve ser validada na instância conectada depois da publicação; os testes locais simulam GIPHY e Evolution.
