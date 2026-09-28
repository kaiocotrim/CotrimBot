FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci

COPY backend/package*.json ./backend/
RUN cd backend && npm ci

COPY frontend ./frontend
COPY backend ./backend

RUN cd frontend && npm run build
RUN cd backend && DATABASE_URL=mysql://build:build@localhost:3306/build npm run prisma:generate
RUN cd backend && npm run build

FROM node:22-bookworm-slim AS production

ENV NODE_ENV=production
WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/frontend/out /app/frontend/out

EXPOSE 3333

CMD ["npm", "start"]
