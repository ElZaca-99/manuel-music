# ========================================
# Dockerfile para Manuel Music
# ========================================

FROM node:18-alpine

# Instalar yt-dlp y ffmpeg (necesarios para descargar música)
RUN apk add --no-cache python3 py3-pip ffmpeg

RUN pip3 install --no-cache-dir yt-dlp

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
EXPOSE 3002

# Comando de inicio
CMD ["node", "backend/server.js"]
