FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json turbo.json ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
RUN npm ci

COPY frontend ./frontend
COPY backend ./backend

ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN DATABASE_URL=mysql://build:build@localhost:3306/build npm run prisma:generate
RUN npm run build

FROM node:22-bookworm-slim AS production

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
RUN npm ci --omit=dev --workspace=@cotrimbot/backend --include-workspace-root=false \
    && npm cache clean --force

COPY --from=build /app/backend/dist /app/backend/dist
COPY --from=build /app/frontend/out /app/frontend/out

WORKDIR /app/backend

EXPOSE 3333

CMD ["npm", "start"]
