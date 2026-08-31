// ========================================
// 🎵 MANUEL MUSIC - SERVIDOR CON API PIPED
// ========================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// Instancia de Piped (puedes cambiar si una cae)
const PIPED_INSTANCES = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.adminforge.de',
    'https://pipedapi.in.projectsegfau.lt',
    'https://pipedapi.mha.fi',
    'https://api.piped.materials.cloud',
    'https://pipedapi.ducks.party'
];
function getPipedInstance() {
    return PIPED_INSTANCES[Math.floor(Math.random() * PIPED_INSTANCES.length)];
}

// Función helper para hacer peticiones HTTPS
function fetchFromPiped(urlPath) {
    return new Promise((resolve, reject) => {
        const instance = getPipedInstance();
        const url = `${instance}${urlPath}`;

        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('JSON inválido de Piped'));
                }
            });
        }).on('error', reject);
    });
}

// Función para formatear duración
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
// API: BUSCAR CANCIONES
// ========================================

app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query || query.trim() === '') {
        return res.status(400).json({ error: 'Falta el término de búsqueda' });
    }

    console.log(`🔍 Buscando: "${query}"`);

    try {
        const data = await fetchFromPiped(`/search?q=${encodeURIComponent(query)}&filter=music_songs`);

        const results = (data.items || [])
        .filter(item => item.type === 'stream' && item.url)
        .map(item => {
            const videoId = item.url.replace('/watch?v=', '');
            return {
                id: videoId,
                title: item.title || 'Sin título',
                duration: formatDuration(item.duration),
             uploader: item.uploaderName || item.uploader || 'Artista desconocido',
             thumbnail: item.thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
            };
        });

        console.log(`✅ Encontradas ${results.length} canciones`);
        res.json(results);
    } catch (error) {
        console.error('❌ Error en búsqueda:', error.message);
        res.status(500).json({ error: 'Error en la búsqueda', details: error.message });
    }
});

// ========================================
// API: DESCARGAR CANCIÓN (vía Piped proxy)
// ========================================

app.post('/api/download', async (req, res) => {
    const { id, title } = req.body;

    if (!id) {
        return res.status(400).json({ error: 'Falta el ID del video' });
    }

    const safeTitle = title.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g, '').substring(0, 200).trim();
    console.log(`⬇️ Descargando: "${safeTitle}"`);

    try {
        // Obtener info del video desde Piped
        const videoData = await fetchFromPiped(`/streams/${id}`);

        // Buscar el stream de audio
        const audioStreams = (videoData.audioStreams || [])
        .filter(s => s.mimeType && s.mimeType.includes('audio'))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

        if (audioStreams.length === 0) {
            throw new Error('No se encontraron streams de audio');
        }

        const audioUrl = audioStreams[0].url;

        // Redirigir al stream de audio
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.mp3"`);
        res.redirect(302, audioUrl);

        console.log(`✅ Descarga iniciada: ${safeTitle}`);
    } catch (error) {
        console.error('❌ Error en descarga:', error.message);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
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
            const data = await fetchFromPiped(`/search?q=${encodeURIComponent(cat.query)}&filter=music_songs`);
            const songs = (data.items || [])
            .filter(item => item.type === 'stream' && item.url)
            .slice(0, 15)
            .map(item => {
                const videoId = item.url.replace('/watch?v=', '');
                return {
                    id: videoId,
                    title: item.title || 'Sin título',
                    duration: formatDuration(item.duration),
                 uploader: item.uploaderName || 'Artista',
                 thumbnail: item.thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
                };
            });
            results[cat.id] = { title: cat.title, songs };
        } catch (error) {
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
        const data = await fetchFromPiped(`/search?q=${encodeURIComponent(randomTerm)}&filter=music_songs`);

        const artists = (data.items || [])
        .map(item => item.uploaderName || item.uploader)
        .filter(name => name && name.length > 2 && !name.includes('Topic') && !name.includes('VEVO'))
        .filter((name, index, self) => self.indexOf(name) === index);

        const shuffled = artists.sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 5);

        console.log(`✅ Artistas aleatorios: ${selected.join(', ')}`);
        res.json(selected);
    } catch (error) {
        console.error('❌ Error buscando artistas:', error.message);
        res.status(500).json({ error: 'Error al obtener artistas' });
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

    console.log(`▶️ Obteniendo stream para: ${id}`);

    try {
        const videoData = await fetchFromPiped(`/streams/${id}`);

        const audioStreams = (videoData.audioStreams || [])
        .filter(s => s.mimeType && s.mimeType.includes('audio'))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

        if (audioStreams.length === 0) {
            throw new Error('No audio streams found');
        }

        const streamUrl = audioStreams[0].url;
        console.log(`✅ Stream obtenido`);
        res.redirect(302, streamUrl);
    } catch (error) {
        console.error('❌ Error obteniendo stream:', error.message);
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
    ╔══════════════════════════════════════╗
    ║   🎵 MANUEL MUSIC SERVER            ║
    ║                                      ║
    ║   🌐 Local: http://localhost:${PORT}  ║
    ║   Estado: ✅ Activo                  ║
    ╚══════════════════════════════════════╝
    `);
});
