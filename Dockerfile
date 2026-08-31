FROM node:20-alpine

WORKDIR /app

# Copiar package.json de la raíz
COPY package*.json ./

# Instalar dependencias
RUN npm install --production

# Copiar todo el código
COPY . .

EXPOSE 3000

CMD ["node", "backend/server.js"]
