FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY prompt.md ./
COPY knowledge ./knowledge
ENV NODE_ENV=production PORT=4200
EXPOSE 4200
USER node
CMD ["node", "src/index.js"]
