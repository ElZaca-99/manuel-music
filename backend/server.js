// ========================================
//  MANUEL MUSIC - CON INVIDIOUS + PIPED (FALLBACK)
// ========================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// Instancias de Invidious (más estables)
const INVIDIOUS_INSTANCES = [
    'https://invidious.fdn.fr',
'https://inv.nadeko.net',
'https://invidious.privacyredirect.com',
'https://iv.datura.network',
'https://invidious.io.lol',
'https://yt.artemislena.eu',
'https://invidious.nerdvpn.de'
];

// Instancias de Piped (fallback)
const PIPED_INSTANCES = [
    'https://pipedapi.kavin.rocks',
'https://pipedapi.adminforge.de',
'https://pipedapi.in.projectsegfau.lt'
];

let invIndex = 0;
let pipedIndex = 0;

function getNextInvidious() {
    const inst = INVIDIOUS_INSTANCES[invIndex];
    invIndex = (invIndex + 1) % INVIDIOUS_INSTANCES.length;
    return inst;
}

function getNextPiped() {
    const inst = PIPED_INSTANCES[pipedIndex];
    pipedIndex = (pipedIndex + 1) % PIPED_INSTANCES.length;
    return inst;
}

// Función genérica para hacer peticiones HTTPS
function httpsGet(url, timeout = 10000) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: timeout
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('JSON inválido'));
                }
            });
        }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
    });
}

// Buscar en Invidious con retry
async function searchInvidious(query, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const instance = getNextInvidious();
            const url = `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video`;
            console.log(`  Invidious: ${instance.substring(0, 40)}...`);
            const data = await httpsGet(url);
            if (Array.isArray(data)) return data;
        } catch (e) {
            console.log(`  ⚠️ Invidious falló: ${e.message}`);
        }
    }
    throw new Error('Todas las instancias de Invidious fallaron');
}

// Buscar en Piped con retry (fallback)
async function searchPiped(query, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const instance = getNextPiped();
            const url = `${instance}/search?q=${encodeURIComponent(query)}&filter=music_songs`;
            console.log(`  Piped: ${instance.substring(0, 40)}...`);
            const data = await httpsGet(url);
            if (data.items) return data.items;
        } catch (e) {
            console.log(`  ⚠️ Piped falló: ${e.message}`);
        }
    }
    throw new Error('Todas las instancias de Piped fallaron');
}

// Obtener info de video de Invidious
async function getVideoInfoInvidious(videoId, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const instance = getNextInvidious();
            const url = `${instance}/api/v1/videos/${videoId}`;
            const data = await httpsGet(url);
            if (data && data.videoId) return data;
        } catch (e) {
            console.log(`  ⚠️ Invidious video falló: ${e.message}`);
        }
    }
    throw new Error('No se pudo obtener info del video');
}

// Obtener info de video de Piped
async function getVideoInfoPiped(videoId, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const instance = getNextPiped();
            const url = `${instance}/streams/${videoId}`;
            const data = await httpsGet(url);
            if (data && data.videoId) return data;
        } catch (e) {
            console.log(`  ️ Piped video falló: ${e.message}`);
        }
    }
    throw new Error('No se pudo obtener info del video de Piped');
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
        // Intentar primero con Invidious
        let items;
        try {
            items = await searchInvidious(query);
        } catch (e) {
            console.log('⚠️ Invidious falló, probando Piped...');
            items = await searchPiped(query);
        }

        // Normalizar resultados (Invidious y Piped tienen formatos diferentes)
        const results = items
        .filter(item => {
            // Invidious: tiene videoId, Piped: tiene url
            return item.videoId || (item.url && item.type === 'stream');
        })
        .map(item => {
            const videoId = item.videoId || item.url.replace('/watch?v=', '');
            const title = item.title || 'Sin título';
            const duration = item.lengthSeconds ? formatDuration(item.lengthSeconds) :
            (item.duration ? formatDuration(item.duration) : '0:00');
            const uploader = item.author || item.uploaderName || item.uploader || 'Artista';
            const thumbnail = item.videoThumbnails?.[0]?.url ||
            item.thumbnail ||
            `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

            return {
                id: videoId,
                title,
                duration,
                uploader,
                thumbnail
            };
        })
        .slice(0, 50);

        console.log(`✅ Encontradas ${results.length} canciones`);
        res.json(results);
    } catch (error) {
        console.error('❌ Error en búsqueda:', error.message);
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

    const safeTitle = title.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g, '').substring(0, 200).trim();
    console.log(`️ Descargando: "${safeTitle}"`);

    try {
        let audioUrl = null;

        // Intentar con Invidious primero
        try {
            const videoData = await getVideoInfoInvidious(id);
            const adaptiveFormats = (videoData.adaptiveFormats || [])
            .filter(f => f.type && f.type.includes('audio'))
            .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

            if (adaptiveFormats.length > 0) {
                audioUrl = adaptiveFormats[0].url;
            }
        } catch (e) {
            console.log('⚠️ Invidious download falló, probando Piped...');
        }

        // Fallback a Piped
        if (!audioUrl) {
            try {
                const videoData = await getVideoInfoPiped(id);
                const audioStreams = (videoData.audioStreams || [])
                .filter(s => s.mimeType && s.mimeType.includes('audio'))
                .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

                if (audioStreams.length > 0) {
                    audioUrl = audioStreams[0].url;
                }
            } catch (e) {
                console.log('⚠️ Piped download también falló');
            }
        }

        if (!audioUrl) {
            throw new Error('No se encontró stream de audio en ninguna API');
        }

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
        { id: 'reggaeton', title: ' Reggaeton', query: 'reggaeton hits' },
        { id: 'pop', title: '🎵 Pop Internacional', query: 'pop hits international' },
        { id: 'electro', title: '⚡ Electrónica', query: 'electronic dance music' }
    ];

    const results = {};

    const promises = categories.map(async (cat) => {
        try {
            let items;
            try {
                items = await searchInvidious(cat.query);
            } catch (e) {
                items = await searchPiped(cat.query);
            }

            const songs = items
            .filter(item => item.videoId || (item.url && item.type === 'stream'))
            .slice(0, 15)
            .map(item => {
                const videoId = item.videoId || item.url.replace('/watch?v=', '');
                return {
                    id: videoId,
                    title: item.title || 'Sin título',
                    duration: item.lengthSeconds ? formatDuration(item.lengthSeconds) :
                    (item.duration ? formatDuration(item.duration) : '0:00'),
                 uploader: item.author || item.uploaderName || 'Artista',
                 thumbnail: item.videoThumbnails?.[0]?.url ||
                 item.thumbnail ||
                 `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
                };
            });

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
        let items;
        try {
            items = await searchInvidious(randomTerm);
        } catch (e) {
            items = await searchPiped(randomTerm);
        }

        const artists = items
        .map(item => item.author || item.uploaderName || item.uploader)
        .filter(name => name && name.length > 2 && !name.includes('Topic') && !name.includes('VEVO'))
        .filter((name, index, self) => self.indexOf(name) === index);

        const shuffled = artists.sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 5);

        console.log(`✅ Artistas aleatorios: ${selected.join(', ')}`);
        res.json(selected);
    } catch (error) {
        console.error('❌ Error buscando artistas:', error.message);
        // Fallback con artistas conocidos
        res.json(['Bad Bunny', 'Duki', 'Feid', 'Shakira', 'Karol G']);
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
        let streamUrl = null;

        // Intentar con Invidious
        try {
            const videoData = await getVideoInfoInvidious(id);
            const adaptiveFormats = (videoData.adaptiveFormats || [])
            .filter(f => f.type && f.type.includes('audio'))
            .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

            if (adaptiveFormats.length > 0) {
                streamUrl = adaptiveFormats[0].url;
            }
        } catch (e) {
            console.log('️ Invidious stream falló, probando Piped...');
        }

        // Fallback a Piped
        if (!streamUrl) {
            try {
                const videoData = await getVideoInfoPiped(id);
                const audioStreams = (videoData.audioStreams || [])
                .filter(s => s.mimeType && s.mimeType.includes('audio'))
                .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

                if (audioStreams.length > 0) {
                    streamUrl = audioStreams[0].url;
                }
            } catch (e) {
                console.log('️ Piped stream también falló');
            }
        }

        if (!streamUrl) {
            throw new Error('No se pudo obtener stream de audio');
        }

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
    ══════════════════════════════════════╗
    ║   🎵 MANUEL MUSIC SERVER            ║
    ║                                      ║
    ║    Local: http://localhost:${PORT}  ║
    ║   Estado: ✅ Activo                  ║
    ╚══════════════════════════════════════╝
    `);
});
