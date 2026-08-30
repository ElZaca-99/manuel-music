// ========================================
// 🎵 MANUEL MUSIC - SERVIDOR PRINCIPAL
// Versión: 8.0 - Búsqueda mejorada (~200 canciones)
// ========================================

const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3002;

// ========================================
// CONFIGURACIÓN
// ========================================

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));
app.use(express.static(path.join(__dirname, '../public')));

// ========================================
// RUTA PRINCIPAL
// ========================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ========================================
// FUNCIÓN AUXILIAR: Formatear duración
// ========================================

function formatDuration(seconds) {
    if (!seconds || isNaN(seconds) || seconds === 'None' || seconds === 'null') return '0:00';
    const num = parseInt(seconds);
    if (isNaN(num)) return '0:00';
    const mins = Math.floor(num / 60);
    const secs = num % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ========================================
// API: BUSCAR CANCIONES (~200 resultados)
// ========================================

app.get('/api/search', (req, res) => {
    const query = req.query.q;

    if (!query || query.trim() === '') {
        return res.status(400).json({ error: 'Falta el término de búsqueda' });
    }

    console.log(`🔍 Buscando: "${query}"`);

    // 3 búsquedas diferentes para maximizar resultados únicos
    const searches = [
        `ytsearch100:${query}`,
        `ytsearch50:${query} official`,
        `ytsearch50:${query} video`
    ];

    let completed = 0;
    const allResults = [];
    const seenIds = new Set();

    searches.forEach(searchQuery => {
        const cmd = `yt-dlp --flat-playlist --print "%(id)s|%(title)s|%(duration)s|%(uploader)s" "${searchQuery}"`;

        exec(cmd, { timeout: 25000, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            if (!error && stdout.trim()) {
                const results = stdout.trim().split('\n')
                .filter(line => line.trim() !== '')
                .map(line => {
                    const parts = line.split('|');
                    const id = parts[0] || '';
                    return {
                        id: id,
                        title: parts[1] || 'Sin título',
                        duration: formatDuration(parts[2] || '0'),
                     uploader: parts[3] || 'Artista desconocido',
                     thumbnail: id.length === 11 ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : ''
                    };
                });

                // Añadir solo los que no hemos visto antes
                results.forEach(song => {
                    if (song.id && !seenIds.has(song.id)) {
                        seenIds.add(song.id);
                        allResults.push(song);
                    }
                });
            }

            completed++;
            if (completed === searches.length) {
                console.log(`✅ Encontradas ${allResults.length} canciones únicas`);
                res.json(allResults);
            }
        });
    });
});

// ========================================
// API: DESCARGAR CANCIÓN
// ========================================

app.post('/api/download', async (req, res) => {
    const { id, title } = req.body;

    if (!id) {
        return res.status(400).json({ error: 'Falta el ID del video' });
    }

    const videoUrl = `https://www.youtube.com/watch?v=${id}`;
    const safeTitle = title.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g, '').substring(0, 200).trim();

    console.log(`⬇️ Descargando: "${safeTitle}"`);

    try {
        const tempFile = `/tmp/manuel_music_${Date.now()}.mp3`;

        const cmd = `yt-dlp -f "bestaudio/best" --extract-audio --audio-format mp3 --audio-quality 0 --embed-thumbnail --add-metadata -o "${tempFile}" "${videoUrl}"`;

        await new Promise((resolve, reject) => {
            exec(cmd, { timeout: 120000, maxBuffer: 1024 * 1024 * 100 }, (error, stdout, stderr) => {
                if (error) {
                    console.error('❌ Error yt-dlp:', stderr);
                    reject(new Error('Error al descargar'));
                } else {
                    console.log('✅ Descarga completada en temporal');
                    resolve();
                }
            });
        });

        const stats = fs.statSync(tempFile);
        if (stats.size < 1000) {
            throw new Error('Archivo demasiado pequeño');
        }

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.mp3"`);
        res.setHeader('Content-Length', stats.size);

        const fileStream = fs.createReadStream(tempFile);
        fileStream.pipe(res);

        fileStream.on('end', () => {
            fs.unlinkSync(tempFile);
            console.log(`️ Temporal eliminado: ${safeTitle}`);
        });

        fileStream.on('error', (err) => {
            console.error('❌ Error leyendo archivo:', err);
            fs.unlinkSync(tempFile);
        });

    } catch (error) {
        console.error('❌ Error en descarga:', error.message);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    }
});

// ========================================
// API: MÚSICA RECOMENDADA (15 por categoría)
// ========================================

app.get('/api/recommended', (req, res) => {
    const categories = [
        { id: 'tendencias', title: '🔥 Tendencias', query: 'top hits 2024' },
        { id: 'clasicos', title: '🎸 Clásicos', query: 'rock classics greatest hits' },
        { id: 'lofi', title: '🎧 Lo-Fi & Chill', query: 'lo-fi hip hop beats' },
        { id: 'reggaeton', title: '💃 Reggaeton', query: 'reggaeton hits' },
        { id: 'pop', title: ' Pop Internacional', query: 'pop hits international' },
        { id: 'electro', title: '⚡ Electrónica', query: 'electronic dance music' }
    ];

    let completed = 0;
    const results = {};

    categories.forEach(cat => {
        const cmd = `yt-dlp --flat-playlist --print "%(id)s|%(title)s|%(duration)s|%(uploader)s" "ytsearch15:${cat.query}"`;

        exec(cmd, { timeout: 20000, maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
            if (error) {
                results[cat.id] = { title: cat.title, songs: [] };
            } else {
                const songs = stdout.trim().split('\n')
                .filter(line => line.trim())
                .map(line => {
                    const parts = line.split('|');
                    const id = parts[0] || '';
                    return {
                        id: id,
                        title: parts[1] || 'Sin título',
                        duration: formatDuration(parts[2] || '0'),
                     uploader: parts[3] || 'Artista',
                     thumbnail: id.length === 11 ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : ''
                    };
                });
                results[cat.id] = { title: cat.title, songs };
            }

            completed++;
            if (completed === categories.length) {
                const ordered = {};
                categories.forEach(cat => { ordered[cat.id] = results[cat.id]; });
                res.json(ordered);
            }
        });
    });
});

// ========================================
// API: ARTISTAS ALEATORIOS (desde YouTube)
// ========================================

app.get('/api/random-artists', (req, res) => {
    const searchTerms = [
        'top artists 2024',
        'most popular singers',
        'best musicians worldwide',
        'famous singers all time',
        'trending artists now'
    ];

    const randomTerm = searchTerms[Math.floor(Math.random() * searchTerms.length)];

    console.log(`🎲 Buscando artistas aleatorios con: "${randomTerm}"`);

    const cmd = `yt-dlp --flat-playlist --print "%(uploader)s" "ytsearch30:${randomTerm}"`;

    exec(cmd, { timeout: 20000, maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
        if (error) {
            console.error('❌ Error buscando artistas:', error.message);
            return res.status(500).json({ error: 'Error al obtener artistas' });
        }

        const artists = stdout.trim()
        .split('\n')
        .map(name => name.trim())
        .filter(name => name && name.length > 2 && !name.includes('Topic') && !name.includes('VEVO'))
        .filter((name, index, self) => self.indexOf(name) === index);

        const shuffled = artists.sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 5);

        console.log(`✅ Artistas aleatorios: ${selected.join(', ')}`);
        res.json(selected);
    });
});

// ========================================
// API: STREAMING DE AUDIO
// ========================================

app.get('/api/stream', (req, res) => {
    const { id } = req.query;

    if (!id || id.length !== 11) {
        return res.status(400).json({ error: 'ID de video inválido' });
    }

    const videoUrl = `https://www.youtube.com/watch?v=${id}`;

    console.log(`▶️ Obteniendo stream para: ${id}`);

    const cmd = `yt-dlp -f "bestaudio" --get-url "${videoUrl}"`;

    exec(cmd, { timeout: 15000 }, (error, stdout, stderr) => {
        if (error) {
            console.error('❌ Error obteniendo stream:', stderr);
            return res.status(500).json({ error: 'No se pudo obtener el stream' });
        }

        const streamUrl = stdout.trim();
        if (!streamUrl) {
            return res.status(500).json({ error: 'URL de stream vacía' });
        }

        console.log(`✅ Stream obtenido`);
        res.redirect(302, streamUrl);
    });
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
    ║   📱 Red:   http://TU_IP:${PORT}      ║
    ║                                      ║
    ║   Estado: ✅ Activo                  ║
    ╚══════════════════════════════════════╝
    `);
});
