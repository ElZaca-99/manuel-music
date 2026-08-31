FROM node:20-alpine

WORKDIR /app

# Copiar TODO el proyecto primero
COPY . .

# Instalar dependencias del backend
RUN cd backend && npm install --production

# Puerto
EXPOSE 3000

# Comando de inicio
CMD ["node", "backend/server.js"]
