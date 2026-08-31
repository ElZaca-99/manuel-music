// ========================================
// 🎵 MANUEL MUSIC - VERSIÓN ROBUSTA
// ========================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const yts = require('yt-search');
const ytdl = require('@distube/ytdl-core');

const app = express();
const PORT = process.env.PORT || 3000;

function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const num = parseInt(seconds);
    if (isNaN(num)) return '0:00';
    const mins = Math.floor(num / 60);
    const secs = num % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
// API: BUSCAR CANCIONES (con filtrado)
// ========================================

app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query || query.trim() === '') {
        return res.status(400).json({ error: 'Falta el término de búsqueda' });
    }

    console.log(`🔍 Buscando: "${query}"`);

    try {
        const r = await yts({ query, video: true });

        // Filtrar videos válidos (no eliminados, no privados)
        const validVideos = r.videos.filter(video =>
        video.videoId &&
        video.title &&
        video.seconds > 0 &&
        video.seconds < 36000 // Menos de 10 horas
        );

        const results = validVideos.slice(0, 50).map(video => ({
            id: video.videoId,
            title: String(video.title || 'Sin título'),
                                                               duration: formatDuration(video.seconds),
                                                               uploader: String(video.author?.name || video.author || 'Artista desconocido'),
                                                               thumbnail: `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`
        }));

        console.log(`✅ Encontradas ${results.length} canciones válidas`);
        res.json(results);
    } catch (error) {
        console.error(' Error en búsqueda:', error.message);
        res.status(500).json({ error: 'Error en la búsqueda', details: error.message });
    }
});

// ========================================
// API: DESCARGAR CANCIÓN (con múltiples intentos)
// ========================================

app.post('/api/download', async (req, res) => {
    const { id, title } = req.body;

    if (!id) {
        return res.status(400).json({ error: 'Falta el ID del video' });
    }

    const safeTitle = String(title || 'cancion').replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g, '').substring(0, 200).trim();
    console.log(`️ Descargando: "${safeTitle}"`);

    try {
        // Intentar obtener info del video
        const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${id}`, {
            quality: 'highestaudio'
        });

        // Filtrar formatos de audio válidos
        const audioFormats = info.formats.filter(format =>
        format.hasAudio &&
            !format.hasVideo &&
            format.url
        );

        if (audioFormats.length === 0) {
            throw new Error('No se encontraron formatos de audio válidos');
        }

        // Ordenar por bitrate y tomar el mejor
        audioFormats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
        const bestAudio = audioFormats[0];

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.mp3"`);
        res.redirect(302, bestAudio.url);

        console.log(`✅ Descarga iniciada: ${safeTitle}`);
    } catch (error) {
        console.error('❌ Error en descarga:', error.message);
        if (!res.headersSent) {
            res.status(500).json({
                error: 'No se pudo descargar esta canción',
                details: error.message
            });
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
        { id: 'reggaeton', title: '💃 Reggaeton', query: 'reggaeton hits' },
        { id: 'pop', title: '🎵 Pop Internacional', query: 'pop hits international' },
        { id: 'electro', title: ' Electrónica', query: 'electronic dance music' }
    ];

    const results = {};

    const promises = categories.map(async (cat) => {
        try {
            const r = await yts({ query: cat.query, video: true });

            // Filtrar videos válidos
            const validVideos = r.videos.filter(video =>
            video.videoId &&
            video.title &&
            video.seconds > 0 &&
            video.seconds < 36000
            );

            const songs = validVideos.slice(0, 15).map(video => ({
                id: video.videoId,
                title: String(video.title || 'Sin título'),
                                                                 duration: formatDuration(video.seconds),
                                                                 uploader: String(video.author?.name || video.author || 'Artista'),
                                                                 thumbnail: `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`
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
        const r = await yts({ query: randomTerm, video: true });

        const artists = r.videos
        .map(video => String(video.author?.name || video.author || ''))
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
// API: STREAMING DE AUDIO (con múltiples intentos)
// ========================================

app.get('/api/stream', async (req, res) => {
    const { id } = req.query;

    if (!id || id.length !== 11) {
        return res.status(400).json({ error: 'ID de video inválido' });
    }

    console.log(`▶️ Obteniendo stream para: ${id}`);

    try {
        // Intentar obtener info del video con timeout
        const info = await Promise.race([
            ytdl.getInfo(`https://www.youtube.com/watch?v=${id}`, {
                quality: 'highestaudio'
            }),
            new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 10000)
            )
        ]);

        // Filtrar formatos de audio válidos
        const audioFormats = info.formats.filter(format =>
        format.hasAudio &&
            !format.hasVideo &&
            format.url
        );

        if (audioFormats.length === 0) {
            throw new Error('No se encontró stream de audio');
        }

        // Ordenar por bitrate y tomar el mejor
        audioFormats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
        const streamUrl = audioFormats[0].url;

        console.log(`✅ Stream obtenido`);
        res.redirect(302, streamUrl);
    } catch (error) {
        console.error('❌ Error obteniendo stream:', error.message);
        res.status(500).json({
            error: 'No se pudo reproducir esta canción',
            details: error.message
        });
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
    ╔══════════════════════════════════════╗
    ║   🎵 MANUEL MUSIC SERVER            ║
    ║                                      ║
    ║    Local: http://localhost:${PORT}  ║
    ║   Estado: ✅ Activo                  ║
    ╚══════════════════════════════════════╝
    `);
});
