// ========================================
//  MANUEL MUSIC - MODO DUAL
// - Nube: API oficial YouTube (búsqueda + embed)
// - Local: yt-search + ytdl-core (búsqueda + stream + descarga)
// ========================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// ========================================
// ✅ API KEY DE YOUTUBE (ya configurada)
// ========================================
const YOUTUBE_API_KEY = 'AIzaSyAm-odRpno0G-Jq0WFzUez6IafzWe8RiPo';

// Detectar si estamos en modo local o nube
const isLocal = process.env.NODE_ENV !== 'production';

// Solo cargar yt-search y ytdl-core en modo local
let yts, ytdl;
if (isLocal) {
    try {
        yts = require('yt-search');
        ytdl = require('@distube/ytdl-core');
        console.log('✅ Modo LOCAL: yt-search y ytdl-core cargados');
    } catch (e) {
        console.log('⚠️ No se pudieron cargar yt-search/ytdl-core');
    }
} else {
    console.log('🌐 Modo NUBE: Usando API oficial de YouTube');
}

function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const num = parseInt(seconds);
    if (isNaN(num)) return '0:00';
    const mins = Math.floor(num / 60);
    const secs = num % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ========================================
// MIDDLEWARE
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

    console.log(` Buscando: "${query}" (modo: ${isLocal ? 'LOCAL' : 'NUBE'})`);

    try {
        let results = [];

        if (isLocal && yts) {
            // MODO LOCAL: yt-search
            const r = await yts({ query, video: true });
            results = r.videos.slice(0, 50).map(video => ({
                id: video.videoId,
                title: String(video.title || 'Sin título'),
                                                          duration: formatDuration(video.seconds),
                                                          uploader: String(video.author?.name || video.author || 'Artista desconocido'),
                                                          thumbnail: `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`,
                                                          canDownload: true
            }));
        } else {
            // MODO NUBE: API oficial de YouTube
            const response = await axios.get(
                `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=50&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&key=${YOUTUBE_API_KEY}`
            );

            results = (response.data.items || []).map(item => ({
                id: item.id.videoId,
                title: String(item.snippet.title),
                                                               duration: '0:00',
                                                               uploader: String(item.snippet.channelTitle),
                                                               thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
                                                               canDownload: false
            }));
        }

        console.log(`✅ Encontradas ${results.length} canciones`);
        res.json(results);
    } catch (error) {
        console.error('❌ Error en búsqueda:', error.response?.data || error.message);
        res.status(500).json({ error: 'Error en la búsqueda', details: error.message });
    }
});

// ========================================
// API: STREAMING DE AUDIO
// ========================================

app.get('/api/stream', async (req, res) => {
    const { id } = req.query;

    if (!id || id.length !== 11) {
        return res.status(400).json({ error: 'ID de video inválido' });
    }

    if (!isLocal || !ytdl) {
        // En modo nube, devolver URL de embed de YouTube
        return res.json({
            type: 'youtube',
            url: `https://www.youtube.com/watch?v=${id}`,
            embedUrl: `https://www.youtube.com/embed/${id}?autoplay=1`
        });
    }

    console.log(`▶️ Obteniendo stream para: ${id}`);

    try {
        const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${id}`, {
            quality: 'highestaudio'
        });

        const audioFormats = info.formats.filter(format =>
        format.hasAudio && !format.hasVideo && format.url
        );

        if (audioFormats.length === 0) {
            throw new Error('No se encontró stream de audio');
        }

        audioFormats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
        const streamUrl = audioFormats[0].url;

        console.log(`✅ Stream obtenido`);
        res.redirect(302, streamUrl);
    } catch (error) {
        console.error('❌ Error obteniendo stream:', error.message);
        res.status(500).json({ error: 'No se pudo obtener el stream' });
    }
});

// ========================================
// API: DESCARGAR CANCIÓN (solo local)
// ========================================

app.post('/api/download', async (req, res) => {
    const { id, title } = req.body;

    if (!id) {
        return res.status(400).json({ error: 'Falta el ID del video' });
    }

    if (!isLocal || !ytdl) {
        return res.status(403).json({
            error: 'La descarga solo está disponible en modo local',
            message: 'Usa la app en tu PC para descargar música'
        });
    }

    const safeTitle = String(title || 'cancion').replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g, '').substring(0, 200).trim();
    console.log(`⬇️ Descargando: "${safeTitle}"`);

    try {
        const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${id}`, {
            quality: 'highestaudio'
        });

        const audioFormats = info.formats.filter(format =>
        format.hasAudio && !format.hasVideo && format.url
        );

        if (audioFormats.length === 0) {
            throw new Error('No se encontraron formatos de audio');
        }

        audioFormats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
        const bestAudio = audioFormats[0];

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.mp3"`);
        res.redirect(302, bestAudio.url);

        console.log(`✅ Descarga iniciada: ${safeTitle}`);
    } catch (error) {
        console.error('❌ Error en descarga:', error.message);
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
        { id: 'clasicos', title: ' Clásicos', query: 'rock classics greatest hits' },
        { id: 'lofi', title: '🎧 Lo-Fi & Chill', query: 'lo-fi hip hop beats' },
        { id: 'reggaeton', title: '💃 Reggaeton', query: 'reggaeton hits' },
        { id: 'pop', title: '🎵 Pop Internacional', query: 'pop hits international' },
        { id: 'electro', title: '⚡ Electrónica', query: 'electronic dance music' }
    ];

    const results = {};

    const promises = categories.map(async (cat) => {
        try {
            let songs = [];

            if (isLocal && yts) {
                const r = await yts({ query: cat.query, video: true });
                songs = r.videos.slice(0, 15).map(video => ({
                    id: video.videoId,
                    title: String(video.title || 'Sin título'),
                                                            duration: formatDuration(video.seconds),
                                                            uploader: String(video.author?.name || video.author || 'Artista'),
                                                            thumbnail: `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`,
                                                            canDownload: true
                }));
            } else {
                const response = await axios.get(
                    `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=15&q=${encodeURIComponent(cat.query)}&type=video&videoCategoryId=10&key=${YOUTUBE_API_KEY}`
                );

                songs = (response.data.items || []).map(item => ({
                    id: item.id.videoId,
                    title: String(item.snippet.title),
                                                                 duration: '0:00',
                                                                 uploader: String(item.snippet.channelTitle),
                                                                 thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
                                                                 canDownload: false
                }));
            }

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
        'best musicians worldwide'
    ];

    const randomTerm = searchTerms[Math.floor(Math.random() * searchTerms.length)];
    console.log(`🎲 Buscando artistas aleatorios con: "${randomTerm}"`);

    try {
        let artists = [];

        if (isLocal && yts) {
            const r = await yts({ query: randomTerm, video: true });
            artists = r.videos
            .map(video => String(video.author?.name || video.author || ''))
            .filter(name => name && name.length > 2 && !name.includes('Topic') && !name.includes('VEVO'))
            .filter((name, index, self) => self.indexOf(name) === index);
        } else {
            const response = await axios.get(
                `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=20&q=${encodeURIComponent(randomTerm)}&type=video&videoCategoryId=10&key=${YOUTUBE_API_KEY}`
            );

            artists = (response.data.items || [])
            .map(item => String(item.snippet.channelTitle || ''))
            .filter(name => name && name.length > 2 && !name.includes('Topic') && !name.includes('VEVO'))
            .filter((name, index, self) => self.indexOf(name) === index);
        }

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
// API: ESTADO DEL SERVIDOR
// ========================================

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        mode: isLocal ? 'LOCAL' : 'NUBE',
        message: 'Manuel Music Server funcionando correctamente',
        timestamp: new Date().toISOString()
    });
});

// ========================================
// INICIAR SERVIDOR
// ========================================

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ╔══════════════════════════════════════╗
    ║   🎵 MANUEL MUSIC SERVER            ║
    ║   Modo: ${isLocal ? 'LOCAL (con descarga)' : 'NUBE (solo stream)'}
    ║                                      ║
    ║   🌐 Local: http://localhost:${PORT}  ║
    ║   Estado: ✅ Activo                  ║
    ╚══════════════════════════════════════╝
    `);
});
