# Runtime must resolve and record the exact image digest before build/activation.
ARG NODE_IMAGE
FROM ${NODE_IMAGE}
WORKDIR /opt/photo-provider
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev && npm cache clean --force
COPY src ./src
COPY schemas ./schemas
USER 1000:1000
CMD ["node", "src/provider-cli.mjs"]
