FROM node:20-alpine

WORKDIR /app

# Copiar e instalar dependencias del backend
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production

# Copiar código
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY public/ ./public/

EXPOSE 3000

CMD ["node", "backend/server.js"]
