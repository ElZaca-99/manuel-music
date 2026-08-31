// ========================================
// 🎵 MANUEL MUSIC - CON RAPIDAPI YOUTUBE V2
// Versión final con API Key integrada
// ========================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// ========================================
// ✅ API KEY DE RAPIDAPI (ya configurada)
// ========================================
const RAPIDAPI_KEY = '93a5b2a521msh59f9628934d90bdp1b342djsnab1023fc14f0';
const RAPIDAPI_HOST = 'youtube-v2.p.rapidapi.com';

const axiosConfig = {
    headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST
    },
    timeout: 15000
};

// ========================================
// FUNCIONES AUXILIARES
// ========================================

function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const num = parseInt(seconds);
    if (isNaN(num)) return '0:00';
    const mins = Math.floor(num / 60);
    const secs = num % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function parseDurationText(text) {
    if (!text) return 0;
    const parts = text.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parseInt(text) || 0;
}

// ========================================
// CONFIGURACIÓN
// ========================================

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));
app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ========================================
// API: BUSCAR CANCIONES
// ========================================

app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query || query.trim() === '') {
        return res.status(400).json({ error: 'Falta el término de búsqueda' });
    }

    console.log(`🔍 Buscando: "${query}"`);

    try {
        const response = await axios.get(
            `https://${RAPIDAPI_HOST}/search/?q=${encodeURIComponent(query)}&hl=en&gl=US`,
                                         axiosConfig
        );

        const videos = response.data.videos || [];

        const results = videos.slice(0, 50).map(video => ({
            id: video.videoId,
            title: String(video.title || 'Sin título'),
                                                          duration: formatDuration(video.lengthSeconds || parseDurationText(video.lengthText)),
                                                          uploader: String(video.author?.title || video.author || 'Artista desconocido'),
                                                          thumbnail: video.thumbnails?.[video.thumbnails.length - 1]?.url ||
                                                          `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`
        }));

        console.log(`✅ Encontradas ${results.length} canciones`);
        res.json(results);
    } catch (error) {
        console.error(' Error en búsqueda:', error.response?.data || error.message);
        res.status(500).json({ error: 'Error en la búsqueda', details: error.message });
    }
});

// ========================================
// API: DESCARGAR CANCIÓN
// ========================================

app.post('/api/download', async (req, res) => {
    const { id, title } = req.body;

    if (!id) {
        return res.status(400).json({ error: 'Falta el ID del video' });
    }

    const safeTitle = String(title || 'cancion').replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g, '').substring(0, 200).trim();
    console.log(`⬇️ Descargando: "${safeTitle}"`);

    try {
        const response = await axios.get(
            `https://${RAPIDAPI_HOST}/video/streaming-data/?id=${id}`,
            axiosConfig
        );

        const streamingData = response.data;

        // Buscar el mejor stream de audio
        const audioStreams = (streamingData.adaptiveFormats || [])
        .filter(f => f.mimeType && f.mimeType.includes('audio'))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

        if (audioStreams.length === 0) {
            throw new Error('No se encontraron streams de audio');
        }

        const bestAudio = audioStreams[0];
        const audioUrl = bestAudio.url;

        if (!audioUrl) {
            throw new Error('URL de audio no disponible');
        }

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.mp3"`);
        res.redirect(302, audioUrl);

        console.log(`✅ Descarga iniciada: ${safeTitle}`);
    } catch (error) {
        console.error('❌ Error en descarga:', error.response?.data || error.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'No se pudo descargar', details: error.message });
        }
    }
});

// ========================================
// API: MÚSICA RECOMENDADA
// ========================================

app.get('/api/recommended', async (req, res) => {
    const categories = [
        { id: 'tendencias', title: '🔥 Tendencias', query: 'top hits 2024' },
        { id: 'clasicos', title: '🎸 Clásicos', query: 'rock classics greatest hits' },
        { id: 'lofi', title: '🎧 Lo-Fi & Chill', query: 'lo-fi hip hop beats' },
        { id: 'reggaeton', title: ' Reggaeton', query: 'reggaeton hits' },
        { id: 'pop', title: '🎵 Pop Internacional', query: 'pop hits international' },
        { id: 'electro', title: '⚡ Electrónica', query: 'electronic dance music' }
    ];

    const results = {};

    const promises = categories.map(async (cat) => {
        try {
            const response = await axios.get(
                `https://${RAPIDAPI_HOST}/search/?q=${encodeURIComponent(cat.query)}&hl=en&gl=US`,
                                             axiosConfig
            );

            const videos = response.data.videos || [];

            const songs = videos.slice(0, 15).map(video => ({
                id: video.videoId,
                title: String(video.title || 'Sin título'),
                                                            duration: formatDuration(video.lengthSeconds || parseDurationText(video.lengthText)),
                                                            uploader: String(video.author?.title || video.author || 'Artista'),
                                                            thumbnail: video.thumbnails?.[video.thumbnails.length - 1]?.url ||
                                                            `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`
            }));

            results[cat.id] = { title: cat.title, songs };
        } catch (error) {
            console.error(`❌ Error en categoría ${cat.id}:`, error.message);
            results[cat.id] = { title: cat.title, songs: [] };
        }
    });

    await Promise.all(promises);
    res.json(results);
});

// ========================================
// API: ARTISTAS ALEATORIOS
// ========================================

app.get('/api/random-artists', async (req, res) => {
    const searchTerms = [
        'top artists 2024',
        'most popular singers',
        'best musicians worldwide',
        'famous singers all time',
        'trending artists now'
    ];

    const randomTerm = searchTerms[Math.floor(Math.random() * searchTerms.length)];
    console.log(`🎲 Buscando artistas aleatorios con: "${randomTerm}"`);

    try {
        const response = await axios.get(
            `https://${RAPIDAPI_HOST}/search/?q=${encodeURIComponent(randomTerm)}&hl=en&gl=US`,
                                         axiosConfig
        );

        const videos = response.data.videos || [];

        const artists = videos
        .map(video => String(video.author?.title || video.author || ''))
        .filter(name => name && name.length > 2 && !name.includes('Topic') && !name.includes('VEVO'))
        .filter((name, index, self) => self.indexOf(name) === index);

        const shuffled = artists.sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 5);

        console.log(`✅ Artistas aleatorios: ${selected.join(', ')}`);
        res.json(selected);
    } catch (error) {
        console.error('❌ Error buscando artistas:', error.message);
        res.json(['Bad Bunny', 'Duki', 'Feid', 'Shakira', 'Karol G']);
    }
});

// ========================================
// API: STREAMING DE AUDIO (para reproducir)
// ========================================

app.get('/api/stream', async (req, res) => {
    const { id } = req.query;

    if (!id || id.length !== 11) {
        return res.status(400).json({ error: 'ID de video inválido' });
    }

    console.log(`▶️ Obteniendo stream para: ${id}`);

    try {
        const response = await axios.get(
            `https://${RAPIDAPI_HOST}/video/streaming-data/?id=${id}`,
            axiosConfig
        );

        const streamingData = response.data;

        // Buscar el mejor stream de audio
        const audioStreams = (streamingData.adaptiveFormats || [])
        .filter(f => f.mimeType && f.mimeType.includes('audio'))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

        if (audioStreams.length === 0) {
            throw new Error('No se encontró stream de audio');
        }

        const streamUrl = audioStreams[0].url;

        if (!streamUrl) {
            throw new Error('URL de stream no disponible');
        }

        console.log(`✅ Stream obtenido`);
        res.redirect(302, streamUrl);
    } catch (error) {
        console.error('❌ Error obteniendo stream:', error.response?.data || error.message);
        res.status(500).json({ error: 'No se pudo obtener el stream' });
    }
});

// ========================================
// API: ESTADO DEL SERVIDOR
// ========================================

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Manuel Music Server funcionando correctamente',
        timestamp: new Date().toISOString()
    });
});

// ========================================
// INICIAR SERVIDOR
// ========================================

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ══════════════════════════════════════╗
    ║   🎵 MANUEL MUSIC SERVER            ║
    ║                                      ║
    ║    Local: http://localhost:${PORT}  ║
    ║   Estado: ✅ Activo                  ║
    ╚══════════════════════════════════════╝
    `);
});
