// ========================================
//  MANUEL MUSIC - FRONTEND COMPLETO
// Versión Final: Modo Dual + YouTube API + 150 canciones
// ========================================

const API_URL = window.location.origin;
let isPlaying = false;
let searchTimeout = null;
let pendingDownload = null;
let isDragging = false;
let currentMode = 'nube';
let ytPlayer = null; // Player de YouTube IFrame API

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

// Referencias del reproductor
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressFilled = document.getElementById('progressFilled');
const progressThumb = document.getElementById('progressThumb');
const currentTimeEl = document.getElementById('currentTime');
const totalTimeEl = document.getElementById('totalTime');

// Playlist
let playlist = [];
let currentTrackIndex = -1;

// ========================================
// INICIALIZACIÓN
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log(' Manuel Music App iniciada');
    await detectMode();
    setupEventListeners();
    checkUrlForSearch();
});

async function detectMode() {
    try {
        const response = await fetch(`${API_URL}/api/health`);
        const data = await response.json();
        currentMode = data.mode === 'LOCAL' ? 'local' : 'nube';
        console.log(`🌐 Modo detectado: ${currentMode.toUpperCase()}`);

        const downloadHint = document.createElement('div');
        downloadHint.id = 'downloadHint';
        downloadHint.style.cssText = 'text-align:center; padding:10px; background:rgba(255,255,255,0.1); border-radius:8px; margin:10px 0; font-size:0.9em; color:#aaa;';
        downloadHint.textContent = currentMode === 'nube'
        ? '☁️ Modo Nube: La descarga de MP3 solo está disponible en tu PC.'
        : '💻 Modo Local: Descarga de MP3 disponible.';

        const container = document.querySelector('.main-content') || document.body;
        if (container) container.insertBefore(downloadHint, container.firstChild);
    } catch (error) {
        console.error('Error detectando modo:', error);
    }
}

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

        const logoBtn = document.getElementById('logoBtn');
        if (logoBtn) logoBtn.addEventListener('click', () => { window.location.href = '/'; });

        // Controles del reproductor
        prevBtn.addEventListener('click', playPrevious);
        nextBtn.addEventListener('click', playNext);
        playPauseBtn.addEventListener('click', togglePlayPause);

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

        // Barra de progreso
        progressContainer.addEventListener('click', seekToPosition);

        progressThumb.addEventListener('mousedown', (e) => { isDragging = true; e.preventDefault(); });
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const rect = progressBar.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            const clampedPos = Math.max(0, Math.min(1, pos));
            progressFilled.style.width = `${clampedPos * 100}%`;
            progressThumb.style.left = `${clampedPos * 100}%`;
            if (audioPlayer.duration) currentTimeEl.textContent = formatTime(clampedPos * audioPlayer.duration);
        });
            document.addEventListener('mouseup', (e) => {
                if (!isDragging) return;
                isDragging = false;
                const rect = progressBar.getBoundingClientRect();
                const clampedPos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                if (audioPlayer.duration) audioPlayer.currentTime = clampedPos * audioPlayer.duration;
            });

                // Soporte táctil
                progressThumb.addEventListener('touchstart', () => { isDragging = true; }, { passive: true });
                document.addEventListener('touchmove', (e) => {
                    if (!isDragging) return;
                    const touch = e.touches[0];
                    const rect = progressBar.getBoundingClientRect();
                    const clampedPos = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
                    progressFilled.style.width = `${clampedPos * 100}%`;
                    progressThumb.style.left = `${clampedPos * 100}%`;
                    if (audioPlayer.duration) currentTimeEl.textContent = formatTime(clampedPos * audioPlayer.duration);
                }, { passive: true });
                    document.addEventListener('touchend', (e) => {
                        if (!isDragging) return;
                        isDragging = false;
                        const touch = e.changedTouches[0];
                        const rect = progressBar.getBoundingClientRect();
                        const clampedPos = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
                        if (audioPlayer.duration) audioPlayer.currentTime = clampedPos * audioPlayer.duration;
                    });

                        audioPlayer.addEventListener('timeupdate', updateProgress);
                        audioPlayer.addEventListener('loadedmetadata', () => { totalTimeEl.textContent = formatTime(audioPlayer.duration); });
                        audioPlayer.addEventListener('ended', () => {
                            isPlaying = false;
                            playPauseBtn.textContent = '▶️';
                            playNext();
                        });

                        window.addEventListener('popstate', handlePopState);
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
        if (!response.ok) return;
        const artists = await response.json();
        if (artists.error) return;
        renderQuickSearchButtons(artists);
    } catch (error) { console.error('Error cargando artistas:', error); }
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
        btn.addEventListener('click', () => { searchInput.value = artist; performSearch(); });
        quickSearchContainer.appendChild(btn);
    });
}

// ========================================
// MÚSICA RECOMENDADA
// ========================================

async function loadRecommended() {
    const container = document.getElementById('recommendedContainer');
    const loading = document.getElementById('recommendedLoading');
    playlist = [];
    currentTrackIndex = -1;
    try {
        const response = await fetch(`${API_URL}/api/recommended`);
        const categories = await response.json();
        if (loading) loading.style.display = 'none';
        if (container) container.innerHTML = '';
        Object.values(categories).forEach(category => {
            if (category.songs && category.songs.length > 0) {
                if (container) container.appendChild(createRecommendedSection(category));
            }
        });
    } catch (error) {
        console.error('Error cargando recomendaciones:', error);
        if (loading) loading.innerHTML = '<p class="error-text">Error al cargar</p>';
    }
}

function createRecommendedSection(category) {
    const section = document.createElement('div');
    section.className = 'recommended-category';
    category.songs.forEach(song => { if (song.id && song.id.length === 11) playlist.push(song); });

    const songsHtml = category.songs.map((song, index) => {
        const isValidId = song.id && song.id.length === 11;
        const thumbnailUrl = isValidId ? `https://img.youtube.com/vi/${song.id}/hqdefault.jpg` : getFallbackThumbnail();
        const escapedTitle = escapeHtml(song.title).replace(/'/g, "\\'");
        const escapedArtist = escapeHtml(song.uploader).replace(/'/g, "\\'");
        const canDownload = song.canDownload !== false;

        return `
        <div class="rec-song-card" style="animation-delay: ${index * 0.05}s">
        <img src="${thumbnailUrl}" alt="${escapeHtml(song.title)}" class="rec-thumbnail" onerror="this.onerror=null; this.src='${getFallbackThumbnail()}';">
        <div class="rec-info">
        <h4 class="rec-title" title="${escapeHtml(song.title)}">${escapeHtml(song.title)}</h4>
        <p class="rec-artist">${escapeHtml(song.uploader)}</p>
        </div>
        <div class="rec-actions">
        <button class="rec-btn rec-btn-play" onclick="playPreview('${song.id}', '${escapedTitle}', '${escapedArtist}', '${thumbnailUrl}')" ${!isValidId ? 'disabled' : ''}>▶️</button>
        <button class="rec-btn rec-btn-download" onclick="downloadSong('${song.id}', '${escapedTitle}', '${escapedArtist}', '${thumbnailUrl}')" ${!canDownload ? 'disabled title="Solo en local"' : ''}>${canDownload ? '⬇️' : '☁️'}</button>
        </div>
        </div>
        `;
    }).join('');

    section.innerHTML = `<h3 class="category-title">${category.title}</h3><div class="rec-grid">${songsHtml}</div>`;
    return section;
}

// ========================================
// BÚSQUEDA
// ========================================

async function performSearch(queryFromUrl = null) {
    const query = queryFromUrl || searchInput.value.trim();
    if (!query) { showNotification('Escribe algo para buscar', 'error'); return; }

    if (!queryFromUrl) {
        searchInput.value = query;
        window.history.pushState({ search: query }, '', `${window.location.pathname}?q=${encodeURIComponent(query)}`);
    }

    if (recommendedSection) recommendedSection.style.display = 'none';
    if (resultsSection) resultsSection.style.display = 'block';
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
    if (initialState) initialState.style.display = 'block';
    if (loadingState) loadingState.style.display = 'none';
    if (errorState) errorState.style.display = 'none';
    if (resultsGrid) resultsGrid.innerHTML = '';
    if (resultsTitle) resultsTitle.textContent = 'Resultados';
    if (resultsCount) resultsCount.textContent = '';
    window.history.replaceState({}, '', window.location.pathname);
    if (recommendedSection) recommendedSection.style.display = 'block';
    if (resultsSection) resultsSection.style.display = 'none';
    const recContainer = document.getElementById('recommendedContainer');
    if (recContainer && recContainer.children.length === 0) loadRecommended();
}

function displayResults(songs, query) {
    if (initialState) initialState.style.display = 'none';
    if (loadingState) loadingState.style.display = 'none';
    if (errorState) errorState.style.display = 'none';
    if (resultsTitle) resultsTitle.textContent = 'Resultados';
    if (resultsCount) resultsCount.textContent = `${songs.length} canciones`;
    if (resultsGrid) resultsGrid.innerHTML = '';

    playlist = [...songs];
    currentTrackIndex = -1;

    songs.forEach((song, index) => {
        if (resultsGrid) resultsGrid.appendChild(createSongCard(song, index));
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
    const canDownload = song.canDownload !== false;

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
    <button class="btn-download" onclick="downloadSong('${song.id}', '${escapedTitleForAttr}', '${escapedArtistForAttr}', '${thumbnailUrl}')" ${!canDownload ? 'disabled title="Descarga solo disponible en modo local"' : ''}>
    ${canDownload ? '⬇️ MP3' : '☁️ Nube'}
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
// REPRODUCIR (LÓGICA DUAL CON YOUTUBE API)
// ========================================

async function playPreview(id, title, artist, thumbnail) {
    if (!id || id.length !== 11) { showNotification('❌ ID de video inválido', 'error'); return; }

    if (player) {
        player.style.display = 'block';
        if (playerThumbnail) playerThumbnail.src = thumbnail;
        if (playerTitle) playerTitle.textContent = title;
        if (playerArtist) playerArtist.textContent = artist;
    }

    try {
        const response = await fetch(`${API_URL}/api/stream?id=${id}`);
        if (response.headers.get('content-type')?.includes('application/json')) {
            const data = await response.json();
            if (data.type === 'youtube') {
                showYouTubePlayer(data.embedUrl, title);
                const trackIndex = playlist.findIndex(track => track.id === id);
                if (trackIndex !== -1) currentTrackIndex = trackIndex;
                showNotification(`▶️ Reproduciendo: ${title}`, 'info');
                return;
            }
        }

        // Modo local: audio directo
        closeYouTubePlayer();
        audioPlayer.src = `${API_URL}/api/stream?id=${id}`;
        await audioPlayer.play();
        isPlaying = true;
        if (playPauseBtn) playPauseBtn.textContent = '️';

        const trackIndex = playlist.findIndex(track => track.id === id);
        if (trackIndex !== -1) currentTrackIndex = trackIndex;

        showNotification(`▶️ Reproduciendo: ${title}`, 'info');
    } catch (error) {
        console.error('Error al reproducir:', error);
        showNotification('❌ Error al reproducir', 'error');
    }
}

// ========================================
// YOUTUBE IFRAME API
// ========================================

function showYouTubePlayer(embedUrl, title) {
    // Ocultar audio local
    audioPlayer.pause();
    audioPlayer.src = '';

    // Mostrar info en el player
    if (player) player.style.display = 'block';
    if (playerThumbnail) playerThumbnail.style.display = 'block';
    if (playerTitle) playerTitle.textContent = title;
    if (playerArtist) playerArtist.textContent = 'YouTube';

    // Extraer video ID
    const videoId = embedUrl.split('v=')[1]?.split('&')[0] || embedUrl.split('/embed/')[1]?.split('?')[0];

    if (!videoId) {
        showNotification(' No se pudo obtener el ID del video', 'error');
        return;
    }

    // Crear contenedor
    let ytContainer = document.getElementById('youtubePlayerInline');
    if (!ytContainer) {
        ytContainer = document.createElement('div');
        ytContainer.id = 'youtubePlayerInline';
        ytContainer.style.cssText = 'width:100%; height:200px; background:#000;';

        const playerControls = document.querySelector('.yt-controls');
        if (playerControls && playerControls.parentNode) {
            playerControls.parentNode.insertBefore(ytContainer, playerControls);
        } else if (player) {
            player.appendChild(ytContainer);
        }
    }

    ytContainer.innerHTML = '<div id="ytPlayerDiv"></div>';
    ytContainer.style.display = 'block';

    // Cargar API de YouTube
    if (!window.YT) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
    }

    const createPlayer = () => {
        ytPlayer = new YT.Player('ytPlayerDiv', {
            videoId: videoId,
            playerVars: {
                autoplay: 1,
                controls: 1,
                modestbranding: 1,
                rel: 0
            },
            events: {
                'onReady': (event) => {
                    event.target.playVideo();
                    isPlaying = true;
                    if (playPauseBtn) playPauseBtn.textContent = '️';
                },
                'onStateChange': (event) => {
                    if (event.data === YT.PlayerState.PLAYING) {
                        isPlaying = true;
                        if (playPauseBtn) playPauseBtn.textContent = '⏸️';
                    } else if (event.data === YT.PlayerState.PAUSED) {
                        isPlaying = false;
                        if (playPauseBtn) playPauseBtn.textContent = '▶️';
                    } else if (event.data === YT.PlayerState.ENDED) {
                        isPlaying = false;
                        if (playPauseBtn) playPauseBtn.textContent = '▶️';
                        playNext();
                    }
                }
            }
        });
    };

    if (window.YT && window.YT.Player) {
        createPlayer();
    } else {
        window.onYouTubeIframeAPIReady = createPlayer;
    }
}

function closeYouTubePlayer() {
    if (ytPlayer) {
        ytPlayer.destroy();
        ytPlayer = null;
    }

    const ytContainer = document.getElementById('youtubePlayerInline');
    if (ytContainer) {
        ytContainer.innerHTML = '';
        ytContainer.style.display = 'none';
    }

    if (playerThumbnail) playerThumbnail.style.display = 'block';
    isPlaying = false;
    if (playPauseBtn) playPauseBtn.textContent = '▶️';
}

// ========================================
// CAMBIAR DE CANCIÓN
// ========================================

function playNext() {
    if (playlist.length === 0) return;

    currentTrackIndex++;
    if (currentTrackIndex >= playlist.length) currentTrackIndex = 0;

    const track = playlist[currentTrackIndex];
    if (track && track.id) {
        closeYouTubePlayer();
        playPreview(track.id, track.title, track.uploader, track.thumbnail);
    }
}

function playPrevious() {
    if (playlist.length === 0) return;

    if (currentMode === 'local' && audioPlayer.currentTime > 3) {
        audioPlayer.currentTime = 0;
        return;
    }

    currentTrackIndex--;
    if (currentTrackIndex < 0) currentTrackIndex = playlist.length - 1;

    const track = playlist[currentTrackIndex];
    if (track && track.id) {
        closeYouTubePlayer();
        playPreview(track.id, track.title, track.uploader, track.thumbnail);
    }
}

// ========================================
// DESCARGAR CANCIÓN
// ========================================

async function downloadSong(id, title, artist, thumbnail) {
    if (currentMode === 'nube') {
        showNotification('☁️ La descarga de MP3 solo está disponible en tu PC (modo local)', 'info');
        return;
    }
    const btn = event.target.closest('.btn-download, .rec-btn-download');
    if (!btn || btn.disabled) return;
    pendingDownload = { id, title, artist, thumbnail, btn };
    showFolderModal();
}

function showFolderModal() {
    const modal = document.getElementById('folderModal');
    if (!modal) return;
    if (localStorage.getItem('preferredDownloadFolder')) {
        const cb = document.getElementById('rememberFolder');
        if (cb) cb.checked = true;
    }
    modal.style.display = 'flex';
}

function closeFolderModal() {
    const modal = document.getElementById('folderModal');
    if (modal) modal.style.display = 'none';
    pendingDownload = null;
}

async function confirmDownload() {
    if (!pendingDownload) return;
    const { id, title, artist, thumbnail, btn } = pendingDownload;
    const cb = document.getElementById('rememberFolder');
    if (cb && cb.checked) localStorage.setItem('preferredDownloadFolder', 'custom');
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

        const cleanTitle = title.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim().substring(0, 200);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${cleanTitle}.mp3`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { window.URL.revokeObjectURL(url); if (document.body.contains(a)) document.body.removeChild(a); }, 100);

        btn.innerHTML = '✅';
        showNotification(`✅ "${cleanTitle}" descargada`, 'success');
        setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 2000);
    } catch (error) {
        console.error('Error en descarga:', error);
        btn.innerHTML = '❌';
        showNotification('❌ Error al descargar', 'error');
        setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 2000);
    }
}

// ========================================
// UTILIDADES Y ESTADOS
// ========================================

function togglePlayPause() {
    // Si hay un player de YouTube activo
    if (ytPlayer && ytPlayer.getPlayerState) {
        const state = ytPlayer.getPlayerState();
        if (state === YT.PlayerState.PLAYING) {
            ytPlayer.pauseVideo();
            isPlaying = false;
            if (playPauseBtn) playPauseBtn.textContent = '▶️';
        } else if (state === YT.PlayerState.PAUSED || state === YT.PlayerState.CUED) {
            ytPlayer.playVideo();
            isPlaying = true;
            if (playPauseBtn) playPauseBtn.textContent = '⏸️';
        }
        return;
    }

    // Si es audio local
    if (!audioPlayer.src) return;
    if (isPlaying) {
        audioPlayer.pause();
        if (playPauseBtn) playPauseBtn.textContent = '▶️';
    } else {
        audioPlayer.play();
        if (playPauseBtn) playPauseBtn.textContent = '⏸️';
    }
    isPlaying = !isPlaying;
}

function seekToPosition(e) {
    const rect = progressBar.getBoundingClientRect();
    const clampedPos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (audioPlayer.duration) audioPlayer.currentTime = clampedPos * audioPlayer.duration;
}

function updateProgress() {
    if (audioPlayer.duration && !isDragging) {
        const percent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        if (progressFilled) progressFilled.style.width = `${percent}%`;
        if (progressThumb) progressThumb.style.left = `${percent}%`;
        if (currentTimeEl) currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
    }
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function showLoading() {
    if (initialState) initialState.style.display = 'none';
    if (errorState) errorState.style.display = 'none';
    if (resultsGrid) resultsGrid.innerHTML = '';
    if (loadingState) loadingState.style.display = 'block';
    if (resultsTitle) resultsTitle.textContent = 'Buscando...';
    if (resultsCount) resultsCount.textContent = '';
}

function showError(message) {
    if (initialState) initialState.style.display = 'none';
    if (loadingState) loadingState.style.display = 'none';
    if (resultsGrid) resultsGrid.innerHTML = '';
    if (errorState) errorState.style.display = 'block';
    if (errorMessage) errorMessage.textContent = message;
    if (resultsTitle) resultsTitle.textContent = 'Error';
    if (resultsCount) resultsCount.textContent = '';
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    notification.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
    if (notifications) notifications.appendChild(notification);
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
window.closeYouTubePlayer = closeYouTubePlayer;
