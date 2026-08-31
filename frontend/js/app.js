// ========================================
// 🎵 MANUEL MUSIC - FRONTEND
// ========================================

let currentMode = 'nube'; // Se detectará automáticamente

// ========================================
// INICIALIZACIÓN
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎵 Manuel Music App iniciada');

    // Detectar modo
    await detectMode();

    // Cargar contenido inicial
    loadRandomArtists();
    loadRecommended();

    // Configurar búsqueda
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');

    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            const query = searchInput.value.trim();
            if (query) searchSongs(query);
        });
    }

    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim();
                if (query) searchSongs(query);
            }
        });
    }
});

// ========================================
// DETECTAR MODO (local o nube)
// ========================================

async function detectMode() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();
        currentMode = data.mode === 'LOCAL' ? 'local' : 'nube';
        console.log(` Modo detectado: ${currentMode}`);

        // Actualizar UI según el modo
        updateUIForMode();
    } catch (error) {
        console.error('❌ Error detectando modo:', error);
        currentMode = 'nube';
    }
}

function updateUIForMode() {
    const downloadHint = document.getElementById('download-hint');
    if (downloadHint) {
        if (currentMode === 'nube') {
            downloadHint.textContent = '💡 La descarga solo está disponible en modo local (tu PC)';
            downloadHint.style.display = 'block';
        } else {
            downloadHint.style.display = 'none';
        }
    }
}

// ========================================
// BUSCAR CANCIONES
// ========================================

async function searchSongs(query) {
    console.log(`🔍 Buscando: "${query}"`);

    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const songs = await response.json();

        if (songs.error) {
            showNotification(songs.error, 'error');
            return;
        }

        displayResults(songs);
    } catch (error) {
        console.error('❌ Error en búsqueda:', error);
        showNotification('Error en la búsqueda', 'error');
    }
}

function displayResults(songs) {
    const resultsContainer = document.getElementById('search-results');
    if (!resultsContainer) return;

    if (songs.length === 0) {
        resultsContainer.innerHTML = '<p class="no-results">No se encontraron canciones</p>';
        return;
    }

    resultsContainer.innerHTML = songs.map(song => `
    <div class="song-card" data-id="${song.id}">
    <img src="${song.thumbnail}" alt="${song.title}" class="song-thumbnail">
    <div class="song-info">
    <h3 class="song-title">${song.title}</h3>
    <p class="song-artist">${song.uploader}</p>
    <p class="song-duration">${song.duration}</p>
    </div>
    <div class="song-actions">
    <button class="btn-play" onclick="playSong('${song.id}', '${escapeHtml(song.title)}')">
    ▶️
    </button>
    ${song.canDownload ? `
        <button class="btn-download" onclick="downloadSong('${song.id}', '${escapeHtml(song.title)}')">
        ️ MP3
        </button>
        ` : `
        <button class="btn-download disabled" title="Descarga solo disponible en local">
        ⬇️
        </button>
        `}
        </div>
        </div>
        `).join('');
}

// ========================================
// REPRODUCIR CANCIÓN
// ========================================

async function playSong(id, title) {
    console.log(`▶️ Reproduciendo: ${title}`);

    try {
        const response = await fetch(`/api/stream?id=${id}`);
        const data = await response.json();

        if (data.type === 'youtube') {
            // Modo nube: mostrar embed de YouTube
            showYouTubePlayer(data.embedUrl);
        } else {
            // Modo local: usar reproductor de audio
            const audioPlayer = document.getElementById('audio-player');
            if (audioPlayer) {
                audioPlayer.src = `/api/stream?id=${id}`;
                audioPlayer.play();
            }
        }

        showNotification(`Reproduciendo: ${title}`, 'success');
    } catch (error) {
        console.error('❌ Error al reproducir:', error);
        showNotification('Error al reproducir', 'error');
    }
}

function showYouTubePlayer(embedUrl) {
    let playerContainer = document.getElementById('youtube-player');

    if (!playerContainer) {
        playerContainer = document.createElement('div');
        playerContainer.id = 'youtube-player';
        playerContainer.className = 'youtube-player-container';
        document.body.appendChild(playerContainer);
    }

    playerContainer.innerHTML = `
    <div class="youtube-player-overlay">
    <div class="youtube-player-content">
    <button class="close-player" onclick="closeYouTubePlayer()">✕</button>
    <iframe
    width="100%"
    height="100%"
    src="${embedUrl}"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen>
    </iframe>
    </div>
    </div>
    `;

    playerContainer.style.display = 'block';
}

function closeYouTubePlayer() {
    const playerContainer = document.getElementById('youtube-player');
    if (playerContainer) {
        playerContainer.innerHTML = '';
        playerContainer.style.display = 'none';
    }
}

// ========================================
// DESCARGAR CANCIÓN (solo local)
// ========================================

async function downloadSong(id, title) {
    if (currentMode === 'nube') {
        showNotification('La descarga solo está disponible en modo local', 'warning');
        return;
    }

    console.log(`⬇️ Descargando: ${title}`);

    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id, title })
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${title}.mp3`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            showNotification(`Descargando: ${title}`, 'success');
        } else {
            const error = await response.json();
            showNotification(error.error || 'Error en la descarga', 'error');
        }
    } catch (error) {
        console.error('❌ Error en descarga:', error);
        showNotification('Error en la descarga', 'error');
    }
}

// ========================================
// CARGAR ARTISTAS ALEATORIOS
// ========================================

async function loadRandomArtists() {
    try {
        const response = await fetch('/api/random-artists');
        const artists = await response.json();

        const container = document.getElementById('random-artists');
        if (container && artists.length > 0) {
            container.innerHTML = artists.map(artist =>
            `<button class="artist-btn" onclick="searchSongs('${escapeHtml(artist)}')">${artist}</button>`
            ).join('');
        }
    } catch (error) {
        console.error('❌ Error cargando artistas:', error);
    }
}

// ========================================
// CARGAR MÚSICA RECOMENDADA
// ========================================

async function loadRecommended() {
    try {
        const response = await fetch('/api/recommended');
        const categories = await response.json();

        const container = document.getElementById('recommended-section');
        if (!container) return;

        container.innerHTML = Object.values(categories).map(cat => `
        <div class="category-section">
        <h2>${cat.title}</h2>
        <div class="songs-grid">
        ${cat.songs.map(song => `
            <div class="song-card-small" data-id="${song.id}">
            <img src="${song.thumbnail}" alt="${song.title}" class="song-thumbnail-small">
            <div class="song-info-small">
            <h4 class="song-title-small">${song.title}</h4>
            <p class="song-artist-small">${song.uploader}</p>
            </div>
            <div class="song-actions-small">
            <button class="btn-play-small" onclick="playSong('${song.id}', '${escapeHtml(song.title)}')">
            ▶️
            </button>
            ${song.canDownload ? `
                <button class="btn-download-small" onclick="downloadSong('${song.id}', '${escapeHtml(song.title)}')">
                ⬇️
                </button>
                ` : ''}
                </div>
                </div>
                `).join('')}
                </div>
                </div>
                `).join('');
    } catch (error) {
        console.error(' Error cargando recomendados:', error);
    }
}

// ========================================
// UTILIDADES
// ========================================

function escapeHtml(text) {
    return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}
