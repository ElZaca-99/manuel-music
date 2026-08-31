# ========================================
# Dockerfile para Manuel Music - Versión con JS runtime
# ========================================

FROM node:18-alpine

# Instalar dependencias del sistema
RUN apk update && apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    ca-certificates \
    nodejs \
    npm \
    && rm -rf /var/cache/apk/*

# Instalar yt-dlp usando pip
RUN pip3 install --no-cache-dir --break-system-packages yt-dlp

# Verificar instalaciones
RUN yt-dlp --version && ffmpeg -version | head -1 && node --version

# Directorio de trabajo
WORKDIR /app

# Copiar package.json del backend e instalar dependencias
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production

# Copiar todo el código
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY public/ ./public/

# Puerto
EXPOSE 3000

# Comando de inicio
CMD ["node", "backend/server.js"]
