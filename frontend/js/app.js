// ========================================
// 🎵 MANUEL MUSIC - APLICACIÓN COMPLETA
// Versión: 9.0 - Reproductor estilo YouTube con drag
// ========================================

const API_URL = window.location.origin;
let isPlaying = false;
let searchTimeout = null;
let pendingDownload = null;
let isDragging = false;

// Referencias DOM
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const resultsGrid = document.getElementById('resultsGrid');
const resultsTitle = document.getElementById('resultsTitle');
const resultsCount = document.getElementById('resultsCount');
const initialState = document.getElementById('initialState');
const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const errorMessage = document.getElementById('errorMessage');
const notifications = document.getElementById('notifications');
const player = document.getElementById('player');
const audioPlayer = document.getElementById('audioPlayer');
const playerThumbnail = document.getElementById('playerThumbnail');
const playerTitle = document.getElementById('playerTitle');
const playerArtist = document.getElementById('playerArtist');
const playPauseBtn = document.getElementById('playPauseBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const volumeBtn = document.getElementById('volumeBtn');
const volumeSlider = document.getElementById('volumeSlider');
const recommendedSection = document.getElementById('recommendedSection');
const resultsSection = document.getElementById('resultsSection');

// Referencias del reproductor estilo YouTube
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressFilled = document.getElementById('progressFilled');
const progressThumb = document.getElementById('progressThumb');
const currentTimeEl = document.getElementById('currentTime');
const totalTimeEl = document.getElementById('totalTime');

// Playlist y control de reproducción
let playlist = [];
let currentTrackIndex = -1;

// ========================================
// INICIALIZACIÓN
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🎵 Manuel Music App iniciada');
    setupEventListeners();
    checkUrlForSearch();
});

function setupEventListeners() {
    searchBtn.addEventListener('click', () => performSearch());
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); performSearch(); }
    });
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const query = searchInput.value.trim();
        if (query.length > 2) searchTimeout = setTimeout(() => performSearch(), 600);
    });

        // Logo clicable → ir al inicio
        const logoBtn = document.getElementById('logoBtn');
        if (logoBtn) {
            logoBtn.addEventListener('click', () => {
                window.location.href = '/';
            });
        }

        // Controles del reproductor
        playPauseBtn.addEventListener('click', togglePlayPause);
        prevBtn.addEventListener('click', playPrevious);
        nextBtn.addEventListener('click', playNext);

        // Control de volumen
        volumeBtn.addEventListener('click', () => {
            if (audioPlayer.volume > 0) {
                audioPlayer.dataset.lastVolume = audioPlayer.volume;
                audioPlayer.volume = 0;
                volumeSlider.value = 0;
                volumeBtn.textContent = '🔇';
            } else {
                audioPlayer.volume = audioPlayer.dataset.lastVolume || 1;
                volumeSlider.value = audioPlayer.volume * 100;
                volumeBtn.textContent = '🔊';
            }
        });

        volumeSlider.addEventListener('input', (e) => {
            audioPlayer.volume = e.target.value / 100;
            volumeBtn.textContent = audioPlayer.volume === 0 ? '🔇' : audioPlayer.volume < 0.5 ? '🔉' : '🔊';
        });

        // Barra de progreso - clic para saltar
        progressContainer.addEventListener('click', seekToPosition);

        // Drag de la barra de progreso
        progressThumb.addEventListener('mousedown', (e) => {
            isDragging = true;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const rect = progressBar.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            const clampedPos = Math.max(0, Math.min(1, pos));
            const percent = clampedPos * 100;

            progressFilled.style.width = `${percent}%`;
            progressThumb.style.left = `${percent}%`;

            if (audioPlayer.duration) {
                const previewTime = clampedPos * audioPlayer.duration;
                currentTimeEl.textContent = formatTime(previewTime);
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (!isDragging) return;
            isDragging = false;

            const rect = progressBar.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            const clampedPos = Math.max(0, Math.min(1, pos));

            if (audioPlayer.duration) {
                audioPlayer.currentTime = clampedPos * audioPlayer.duration;
            }
        });

        // Soporte táctil (móvil)
        progressThumb.addEventListener('touchstart', (e) => {
            isDragging = true;
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;

            const touch = e.touches[0];
            const rect = progressBar.getBoundingClientRect();
            const pos = (touch.clientX - rect.left) / rect.width;
            const clampedPos = Math.max(0, Math.min(1, pos));
            const percent = clampedPos * 100;

            progressFilled.style.width = `${percent}%`;
            progressThumb.style.left = `${percent}%`;

            if (audioPlayer.duration) {
                const previewTime = clampedPos * audioPlayer.duration;
                currentTimeEl.textContent = formatTime(previewTime);
            }
        }, { passive: true });

        document.addEventListener('touchend', (e) => {
            if (!isDragging) return;
            isDragging = false;

            const rect = progressBar.getBoundingClientRect();
            const touch = e.changedTouches[0];
            const pos = (touch.clientX - rect.left) / rect.width;
            const clampedPos = Math.max(0, Math.min(1, pos));

            if (audioPlayer.duration) {
                audioPlayer.currentTime = clampedPos * audioPlayer.duration;
            }
        });

        // Actualizar barra de progreso mientras suena
        audioPlayer.addEventListener('timeupdate', updateProgress);
        audioPlayer.addEventListener('loadedmetadata', () => {
            totalTimeEl.textContent = formatTime(audioPlayer.duration);
        });
        audioPlayer.addEventListener('ended', () => {
            isPlaying = false;
            playPauseBtn.textContent = '▶️';
            playNext();
        });

        window.addEventListener('popstate', handlePopState);

        // Cargar artistas aleatorios al iniciar
        loadRandomArtists();
}

function checkUrlForSearch() {
    const urlParams = new URLSearchParams(window.location.search);
    const queryFromUrl = urlParams.get('q');

    if (queryFromUrl) {
        searchInput.value = queryFromUrl;
        performSearch(queryFromUrl);
    } else {
        loadRecommended();
    }
}

// ========================================
// ARTISTAS ALEATORIOS
// ========================================

async function loadRandomArtists() {
    try {
        const response = await fetch(`${API_URL}/api/random-artists`);

        if (!response.ok) {
            console.error('Error HTTP:', response.status);
            return;
        }

        const artists = await response.json();

        if (artists.error) {
            console.error('Error cargando artistas:', artists.error);
            return;
        }

        renderQuickSearchButtons(artists);
    } catch (error) {
        console.error('Error cargando artistas aleatorios:', error);
    }
}

function renderQuickSearchButtons(artists) {
    const quickSearchContainer = document.querySelector('.quick-search');
    if (!quickSearchContainer) return;

    quickSearchContainer.innerHTML = '';

    const label = document.createElement('span');
    label.className = 'quick-label';
    label.textContent = 'Prueba con:';
    quickSearchContainer.appendChild(label);

    artists.forEach(artist => {
        const btn = document.createElement('button');
        btn.className = 'quick-btn';
        btn.textContent = artist;
        btn.dataset.query = artist;
        btn.addEventListener('click', () => {
            searchInput.value = artist;
            performSearch();
        });
        quickSearchContainer.appendChild(btn);
    });
}

// ========================================
// BÚSQUEDA
// ========================================

async function performSearch(queryFromUrl = null) {
    const query = queryFromUrl || searchInput.value.trim();
    if (!query) { showNotification('Escribe algo para buscar', 'error'); return; }

    if (!queryFromUrl) {
        searchInput.value = query;
        const newUrl = `${window.location.pathname}?q=${encodeURIComponent(query)}`;
        window.history.pushState({ search: query }, '', newUrl);
    }

    recommendedSection.style.display = 'none';
    resultsSection.style.display = 'block';

    showLoading();
    searchBtn.disabled = true;

    try {
        const response = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(query)}`);
        const songs = await response.json();
        if (songs.error) { showError(songs.error); return; }
        if (songs.length === 0) { showError('No se encontraron resultados'); return; }
        displayResults(songs, query);
        showNotification(`Se encontraron ${songs.length} canciones`, 'success');
    } catch (error) {
        console.error('Error en búsqueda:', error);
        showError('Error de conexión con el servidor');
    } finally {
        searchBtn.disabled = false;
    }
}

function handlePopState(event) {
    if (event.state && event.state.search) {
        searchInput.value = event.state.search;
        performSearch(event.state.search);
    } else {
        resetToInitialState();
    }
}

function resetToInitialState() {
    searchInput.value = '';
    initialState.style.display = 'block';
    loadingState.style.display = 'none';
    errorState.style.display = 'none';
    resultsGrid.innerHTML = '';
    resultsTitle.textContent = 'Resultados';
    resultsCount.textContent = '';
    window.history.replaceState({}, '', window.location.pathname);

    recommendedSection.style.display = 'block';
    resultsSection.style.display = 'none';
    if (document.getElementById('recommendedContainer').children.length === 0) {
        loadRecommended();
    }
}

function displayResults(songs, query) {
    initialState.style.display = 'none';
    loadingState.style.display = 'none';
    errorState.style.display = 'none';
    resultsTitle.textContent = 'Resultados';
    resultsCount.textContent = `${songs.length} canciones`;
    resultsGrid.innerHTML = '';

    // Actualizar playlist con las canciones de búsqueda
    playlist = [...songs];
    currentTrackIndex = -1;

    songs.forEach((song, index) => {
        const card = createSongCard(song, index);
        resultsGrid.appendChild(card);
    });
}

function createSongCard(song, index) {
    const card = document.createElement('div');
    card.className = 'song-card';
    card.style.animationDelay = `${index * 0.05}s`;

    const escapedTitle = escapeHtml(song.title);
    const escapedArtist = escapeHtml(song.uploader);
    const isValidId = song.id && song.id.length === 11;
    const thumbnailUrl = isValidId ? `https://img.youtube.com/vi/${song.id}/hqdefault.jpg` : getFallbackThumbnail();

    const escapedTitleForAttr = escapedTitle.replace(/'/g, "\\'");
    const escapedArtistForAttr = escapedArtist.replace(/'/g, "\\'");

    card.innerHTML = `
    <img src="${thumbnailUrl}" alt="${escapedTitle}" class="song-thumbnail" onerror="this.onerror=null; this.src='${getFallbackThumbnail()}';">
    <div class="song-info">
    <h3 class="song-title" title="${escapedTitle}">${escapedTitle}</h3>
    <p class="song-artist">${escapedArtist}</p>
    <p class="song-duration">⏱️ ${song.duration}</p>
    </div>
    <div class="song-actions">
    <button class="btn-download" onclick="downloadSong('${song.id}', '${escapedTitleForAttr}', '${escapedArtistForAttr}', '${thumbnailUrl}')" ${!isValidId ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
    ${isValidId ? '⬇️ MP3' : '❌ No disponible'}
    </button>
    <button class="btn-play" onclick="playPreview('${song.id}', '${escapedTitleForAttr}', '${escapedArtistForAttr}', '${thumbnailUrl}')" ${!isValidId ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>▶️</button>
    </div>
    `;
    return card;
}

function getFallbackThumbnail() {
    return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#1db954;stop-opacity:1" /><stop offset="100%" style="stop-color:#169c46;stop-opacity:1" /></linearGradient></defs><rect width="200" height="200" fill="url(#grad)"/><text x="100" y="120" font-size="80" text-anchor="middle" fill="white">🎵</text></svg>`);
}

// ========================================
// MÚSICA RECOMENDADA
// ========================================

async function loadRecommended() {
    const container = document.getElementById('recommendedContainer');
    const loading = document.getElementById('recommendedLoading');

    // Resetear playlist al cargar recomendaciones
    playlist = [];
    currentTrackIndex = -1;

    try {
        const response = await fetch(`${API_URL}/api/recommended`);
        const categories = await response.json();

        loading.style.display = 'none';
        container.innerHTML = '';

        Object.values(categories).forEach(category => {
            if (category.songs && category.songs.length > 0) {
                const section = createRecommendedSection(category);
                container.appendChild(section);
            }
        });
    } catch (error) {
        console.error('Error cargando recomendaciones:', error);
        loading.innerHTML = '<p class="error-text">Error al cargar recomendaciones</p>';
    }
}

function createRecommendedSection(category) {
    const section = document.createElement('div');
    section.className = 'recommended-category';

    // Añadir canciones de recomendaciones a la playlist
    category.songs.forEach(song => {
        if (song.id && song.id.length === 11) {
            playlist.push(song);
        }
    });

    const songsHtml = category.songs.map((song, index) => {
        const isValidId = song.id && song.id.length === 11;
        const thumbnailUrl = isValidId ? `https://img.youtube.com/vi/${song.id}/hqdefault.jpg` : getFallbackThumbnail();
        const escapedTitle = escapeHtml(song.title).replace(/'/g, "\\'");
        const escapedArtist = escapeHtml(song.uploader).replace(/'/g, "\\'");

        return `
        <div class="rec-song-card" style="animation-delay: ${index * 0.05}s">
        <img src="${thumbnailUrl}" alt="${escapeHtml(song.title)}" class="rec-thumbnail" onerror="this.onerror=null; this.src='${getFallbackThumbnail()}';">
        <div class="rec-info">
        <h4 class="rec-title" title="${escapeHtml(song.title)}">${escapeHtml(song.title)}</h4>
        <p class="rec-artist">${escapeHtml(song.uploader)}</p>
        </div>
        <div class="rec-actions">
        <button class="rec-btn rec-btn-play" onclick="playPreview('${song.id}', '${escapedTitle}', '${escapedArtist}', '${thumbnailUrl}')" ${!isValidId ? 'disabled' : ''}>▶️</button>
        <button class="rec-btn rec-btn-download" onclick="downloadSong('${song.id}', '${escapedTitle}', '${escapedArtist}', '${thumbnailUrl}')" ${!isValidId ? 'disabled' : ''}>⬇️ MP3</button>
        </div>
        </div>
        `;
    }).join('');

    section.innerHTML = `
    <h3 class="category-title">${category.title}</h3>
    <div class="rec-grid">${songsHtml}</div>
    `;
    return section;
}

// ========================================
// REPRODUCIR PREVIEW
// ========================================

function playPreview(id, title, artist, thumbnail) {
    if (!id || id.length !== 11) {
        showNotification('❌ ID de video inválido', 'error');
        return;
    }

    // Mostrar el reproductor
    player.style.display = 'block';
    playerThumbnail.src = thumbnail;
    playerTitle.textContent = title;
    playerArtist.textContent = artist;

    // Configurar el audio
    audioPlayer.src = `${API_URL}/api/stream?id=${id}`;
    audioPlayer.play();

    isPlaying = true;
    playPauseBtn.textContent = '⏸️';

    // Actualizar índice de la playlist
    const trackIndex = playlist.findIndex(track => track.id === id);
    if (trackIndex !== -1) {
        currentTrackIndex = trackIndex;
    }

    showNotification(`▶️ Reproduciendo: ${title}`, 'info');
}

// ========================================
// DESCARGAR CANCIÓN
// ========================================

async function downloadSong(id, title, artist, thumbnail) {
    const btn = event.target.closest('.btn-download, .rec-btn-download');
    if (!btn || btn.disabled) return;
    pendingDownload = { id, title, artist, thumbnail, btn };
    showFolderModal();
}

function showFolderModal() {
    const modal = document.getElementById('folderModal');
    const savedFolder = localStorage.getItem('preferredDownloadFolder');
    if (savedFolder) {
        document.getElementById('rememberFolder').checked = true;
    }
    modal.style.display = 'flex';
}

function closeFolderModal() {
    document.getElementById('folderModal').style.display = 'none';
    pendingDownload = null;
}

async function confirmDownload() {
    if (!pendingDownload) return;
    const { id, title, artist, thumbnail, btn } = pendingDownload;
    const rememberFolder = document.getElementById('rememberFolder').checked;

    if (rememberFolder) localStorage.setItem('preferredDownloadFolder', 'custom');

    closeFolderModal();

    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳...';
    showNotification(`Descargando: ${title}`, 'info');

    try {
        const response = await fetch(`${API_URL}/api/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, title })
        });

        if (!response.ok) throw new Error('Error en la descarga');

        const blob = await response.blob();
        if (blob.size < 1000) throw new Error('Archivo corrupto');

        const cleanTitle = title
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 200);

        const fileName = `${cleanTitle}.mp3`;

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            window.URL.revokeObjectURL(url);
            if (document.body.contains(a)) document.body.removeChild(a);
        }, 100);

            btn.innerHTML = '✅';
            showNotification(`✅ "${cleanTitle}" descargada`, 'success');

            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }, 2000);

    } catch (error) {
        console.error('Error en descarga:', error);
        btn.innerHTML = '❌';
        showNotification(`❌ Error al descargar`, 'error');
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }, 2000);
    }
}

// ========================================
// REPRODUCTOR - FUNCIONES BÁSICAS
// ========================================

function togglePlayPause() {
    if (!audioPlayer.src) return;
    if (isPlaying) {
        audioPlayer.pause();
        playPauseBtn.textContent = '▶️';
    } else {
        audioPlayer.play();
        playPauseBtn.textContent = '️';
    }
    isPlaying = !isPlaying;
}

// ========================================
// FUNCIONES DE LA BARRA DE PROGRESO
// ========================================

function seekToPosition(e) {
    const rect = progressBar.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const clampedPos = Math.max(0, Math.min(1, pos));
    if (audioPlayer.duration) {
        audioPlayer.currentTime = clampedPos * audioPlayer.duration;
    }
}

function updateProgress() {
    if (audioPlayer.duration && !isDragging) {
        const percent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        progressFilled.style.width = `${percent}%`;
        progressThumb.style.left = `${percent}%`;
        currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
    }
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ========================================
// FUNCIONES DE CANCIÓN ANTERIOR/SIGUIENTE
// ========================================

function playNext() {
    if (playlist.length === 0) return;

    currentTrackIndex++;
    if (currentTrackIndex >= playlist.length) {
        currentTrackIndex = 0;
    }

    const track = playlist[currentTrackIndex];
    if (track && track.id) {
        playPreview(track.id, track.title, track.uploader, track.thumbnail);
    }
}

function playPrevious() {
    if (playlist.length === 0) return;

    if (audioPlayer.currentTime > 3) {
        audioPlayer.currentTime = 0;
        return;
    }

    currentTrackIndex--;
    if (currentTrackIndex < 0) {
        currentTrackIndex = playlist.length - 1;
    }

    const track = playlist[currentTrackIndex];
    if (track && track.id) {
        playPreview(track.id, track.title, track.uploader, track.thumbnail);
    }
}

// ========================================
// ESTADOS DE LA UI
// ========================================

function showLoading() {
    initialState.style.display = 'none';
    errorState.style.display = 'none';
    resultsGrid.innerHTML = '';
    loadingState.style.display = 'block';
    resultsTitle.textContent = 'Buscando...';
    resultsCount.textContent = '';
}

function showError(message) {
    initialState.style.display = 'none';
    loadingState.style.display = 'none';
    resultsGrid.innerHTML = '';
    errorState.style.display = 'block';
    errorMessage.textContent = message;
    resultsTitle.textContent = 'Error';
    resultsCount.textContent = '';
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    notification.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
    notifications.appendChild(notification);
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => { if (notification.parentNode) notification.remove(); }, 300);
    }, 4000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Exponer funciones globalmente
window.downloadSong = downloadSong;
window.playPreview = playPreview;
window.closeFolderModal = closeFolderModal;
window.confirmDownload = confirmDownload;
window.playNext = playNext;
window.playPrevious = playPrevious;
