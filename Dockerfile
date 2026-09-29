FROM node:22

RUN apt-get update && apt-get install -y \
    ca-certificates \
    openssl \
    nano \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV TZ=America/Sao_Paulo

# 1. Copiar apenas os arquivos package.json e turbo.json
COPY package.json turbo.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/

# Copy .env to root and apps/web
COPY .env /app/.env
COPY .env /app/backend/.env
COPY .env /app/frontend/.env

# 2. Remover qualquer lockfile ou .npmrc residual e limpar o cache
RUN find /app -name ".npmrc" -delete || true \
    && rm -f /app/package-lock.json \
    && npm cache clean --force \
    && npm config set registry https://registry.npmjs.org --global \
    && echo "registry=https://registry.npmjs.org/" > .npmrc  

# 3. Instalar do zero baixando as dependências nativas para Linux x64
RUN npm install

# 4. Copiar o restante dos arquivos do projeto
COPY . .

# 5. Gerar o Prisma e fazer o build com o Turbo
RUN DATABASE_URL=mysql://build:build@localhost:3306/build npm run prisma:generate
RUN npm run build

WORKDIR /app/backend

EXPOSE 3333

CMD ["npm", "start"]