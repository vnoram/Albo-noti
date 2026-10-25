FROM node:20-alpine
ENV NODE_ENV=production TZ=America/Santiago
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
# El comando lo define cada Container Apps Job (ver azure/deploy.sh)
CMD ["node", "src/jobs/prematch.js"]
