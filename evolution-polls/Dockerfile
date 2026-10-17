FROM evoapicloud/evolution-api:v2.3.7 AS builder
USER root
RUN apk add --no-cache git
WORKDIR /tmp/evolution-source
# The upstream 2.3.7 commit, matching the existing integration and database schema.
RUN git init && git remote add origin https://github.com/evolution-foundation/evolution-api.git \
    && git fetch --depth 1 origin cd800f2976e1e5b682fbf86a01ee4d85ae61f370 \
    && git checkout --detach FETCH_HEAD \
    && ln -s /evolution/node_modules node_modules
COPY native-poll-vote.ts patch.mjs /tmp/poll-extension/
RUN node /tmp/poll-extension/patch.mjs /tmp/evolution-source && npm run build

FROM evoapicloud/evolution-api:v2.3.7
COPY --from=builder /tmp/evolution-source/dist /evolution/dist
