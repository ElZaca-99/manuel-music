# Dockerfile para Manuel Music

FROM node:18-alpine

# Solo necesitamos Node.js (ya no usamos yt-dlp ni ffmpeg)
WORKDIR /app

# Copiar e instalar dependencias
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production

# Copiar código
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY public/ ./public/

# Puerto
EXPOSE 3000

CMD ["node", "backend/server.js"]
