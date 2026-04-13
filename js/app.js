'use strict';

// ── CONSTANTS ──
const STORAGE_KEY = 'animeTracker_v3';
const DATA_VERSION = '2026-spring';
const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const DAY_LABELS = ['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB'];
const DAY_FULL = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

// ── FIREBASE CONFIG ──
const firebaseConfig = {
  apiKey: "AIzaSyB7pfqOMBPFf3XfRxY2zmHLCLaB4HHi7Fk",
  authDomain: "calendar-anime.firebaseapp.com",
  databaseURL: "https://calendar-anime-default-rtdb.firebaseio.com",
  projectId: "calendar-anime",
  storageBucket: "calendar-anime.firebasestorage.app",
  messagingSenderId: "1029635699596",
  appId: "1:1029635699596:web:338a7a0ae4a23351b85ca9"
};

// ── CLOUDINARY CONFIG ──
const CLOUDINARY_URL = 'https://api.cloudinary.com/v1_1/imgapi/image/upload';
const CLOUDINARY_UPLOAD_PRESET = 'gym_preset';
const USE_CLOUDINARY = true;

function optimizarUrlCloudinary(url) {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', '/upload/w_800,h_800,c_fill,g_auto,f_webp,q_auto/');
}

// Initialize Firebase
let app, database;
try {
  app = firebase.initializeApp(firebaseConfig);
  database = firebase.database();
} catch (error) {
  console.error('Firebase initialization error:', error);
}

// ── STATE ──
let animes = [];
let currentWeekOffset = 0;
let editingId = null;

// ── INIT ──
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  await loadProgress();
  removeDuplicates();
  renderAll();
  setupEventListeners();
  setupPlatformBuilder();
});

// ── DATA MANAGEMENT ──
async function loadData() {
  try {
    const animesRef = database.ref('animes');
    const snapshot = await animesRef.get();
    if (snapshot.exists()) {
      const data = snapshot.val();
      animes = Object.keys(data).map(key => ({ id: key, ...data[key] }));
      return;
    }
  } catch (error) {
    console.error('Error loading data from Firebase:', error);
  }
  try {
    const cachebustedUrl = `./data/animes.json?v=${new Date().getTime()}`;
    const res = await fetch(cachebustedUrl);
    if (res.ok) {
      animes = await res.json();
    } else {
      animes = [];
    }
  } catch (e) {
    animes = [];
  }
}

function saveToLocalStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: DATA_VERSION, animes }));
}

function removeDuplicates() {
  const seen = new Set();
  animes = animes.filter(anime => {
    if (!anime.id) return true;
    if (seen.has(anime.id)) return false;
    seen.add(anime.id);
    return true;
  });
}

async function saveData() {
  removeDuplicates();
  saveToLocalStorage();
  try {
    const animesRef = database.ref('animes');
    const animesObject = {};
    animes.forEach(anime => {
      animesObject[anime.id] = { ...anime };
      delete animesObject[anime.id].id;
    });
    await animesRef.set(animesObject);
  } catch (error) {
    console.error('Error saving to Firebase:', error);
  }
}

// ── CLOUDINARY IMAGE UPLOAD ──
async function uploadImageToCloudinary(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', 'anime_tracker');
  const response = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
  if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
  const data = await response.json();
  return data.secure_url;
}

async function migrateDataToFirebase() {
  try {
    const res = await fetch(`./data/animes.json?v=${new Date().getTime()}`);
    if (res.ok) {
      const localAnimes = await res.json();
      const animesRef = database.ref('animes');
      const animesObject = {};
      localAnimes.forEach(anime => {
        const id = generateId();
        animesObject[id] = { ...anime, id };
      });
      await animesRef.set(animesObject);
      showToast('Datos migrados a Firebase ✓', 'success');
    }
  } catch (error) {
    showToast('Error al migrar datos', 'error');
  }
}

function generateId() {
  return `anime_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ── DATE / WEEK UTILS ──
function getWeekStart(offset = 0) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = today.getDay();
  const daysBack = day === 0 ? 6 : day - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysBack + offset * 7);
  return monday;
}

function getWeekDays(offset = 0) {
  const start = getWeekStart(offset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDateShort(date) {
  return `${date.getDate().toString().padStart(2,'0')}/${(date.getMonth()+1).toString().padStart(2,'0')}`;
}

function formatDateFull(date) {
  return `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')}`;
}

function isToday(date) {
  const today = new Date();
  return date.getDate() === today.getDate() &&
         date.getMonth() === today.getMonth() &&
         date.getFullYear() === today.getFullYear();
}

function isPast(date) {
  const today = new Date();
  today.setHours(0,0,0,0);
  return date < today;
}

// ── EPISODE LOGIC ──
function getMondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const daysBack = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - daysBack);
  return d;
}

function getEpisodeWeek(anime, weekDate) {
  const premiere = parseDate(anime.premiereDate);
  if (!premiere) return null;
  premiere.setHours(0, 0, 0, 0);
  const checkDate = new Date(weekDate);
  checkDate.setHours(0, 0, 0, 0);
  if (checkDate < premiere) return null;
  const premiereMonday = getMondayOf(premiere);
  const checkMonday = getMondayOf(checkDate);
  const diffMs = checkMonday - premiereMonday;
  const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
  const episodeNumber = diffWeeks + 1;
  if (episodeNumber < 1 || episodeNumber > anime.totalEpisodes) return null;
  return episodeNumber;
}

function animeAppearsOnDate(anime, date) {
  const dayName = DAYS[date.getDay()];
  if (anime.airDay !== dayName) return false;
  return getEpisodeWeek(anime, new Date(date)) !== null;
}

// ── PLATFORM URL UTILS ──
/**
 * Builds the episode URL from a platform URL pattern.
 * Detects trailing slash variants automatically.
 * Pattern examples:
 *   jkanime.com/rezero/1     → jkanime.com/rezero/{ep}
 *   jkanime.com/rezero/1/    → jkanime.com/rezero/{ep}/
 * If the stored url already has {ep} placeholder, just replace it.
 */
function buildEpisodeUrl(urlPattern, episodeNumber) {
  if (!urlPattern) return null;

  // Already uses {ep} placeholder
  if (urlPattern.includes('{ep}')) {
    return urlPattern.replace('{ep}', episodeNumber);
  }

  // Try to detect trailing slash variant: .../number/ or .../number
  // Matches: anything ending in /digits/ or /digits at end of string
  const withTrailingSlash = urlPattern.match(/^(.*\/)(\d+)(\/?)$/);
  if (withTrailingSlash) {
    const base = withTrailingSlash[1];       // e.g. "jkanime.com/rezero/"
    const trailingSlash = withTrailingSlash[3]; // "/" or ""
    return `${base}${episodeNumber}${trailingSlash}`;
  }

  // Fallback: return pattern as-is
  return urlPattern;
}

/**
 * Normalizes a URL entered by user so it always ends without episode number,
 * and returns the pattern string (with {ep} placeholder).
 * e.g. "jkanime.com/rezero/1"  → "jkanime.com/rezero/{ep}"
 *      "jkanime.com/rezero/1/" → "jkanime.com/rezero/{ep}/"
 *      "jkanime.com/rezero/"   → "jkanime.com/rezero/{ep}/" (no number, assume add at end)
 */
function normalizeUrlPattern(url) {
  if (!url) return '';
  url = url.trim();

  // Already has placeholder
  if (url.includes('{ep}')) return url;

  // Ends in /digits/ or /digits
  const match = url.match(/^(.*\/)(\d+)(\/?)$/);
  if (match) {
    return `${match[1]}{ep}${match[3]}`;
  }

  // URL ends in / → append {ep}/
  if (url.endsWith('/')) {
    return url + '{ep}/';
  }

  // URL has no number at end → append /{ep}
  return url.replace(/\/?$/, '/{ep}');
}

// ── PLATFORM BUILDER (form) ──
let formPlatforms = []; // Array of { name, urlPattern }

function setupPlatformBuilder() {
  document.getElementById('btn-add-platform').addEventListener('click', () => {
    addPlatformRow();
  });
}

function addPlatformRow(name = '', urlPattern = '') {
  formPlatforms.push({ name, urlPattern });
  renderPlatformRows();
}

function removePlatformRow(index) {
  formPlatforms.splice(index, 1);
  renderPlatformRows();
}

function renderPlatformRows() {
  const container = document.getElementById('platforms-list');
  container.innerHTML = '';

  formPlatforms.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'platform-row';
    row.innerHTML = `
      <input type="text" class="platform-name" placeholder="Nombre (ej: JKAnime)"
        value="${escapeAttr(p.name)}"
        oninput="updatePlatformField(${i}, 'name', this.value)">
      <input type="text" class="platform-url" placeholder="URL del ep 1 (ej: jkanime.com/rezero/1)"
        value="${escapeAttr(p.urlPattern)}"
        oninput="updatePlatformField(${i}, 'urlPattern', this.value)">
      <button type="button" class="btn btn-danger platform-remove" onclick="removePlatformRow(${i})">✕</button>
    `;
    container.appendChild(row);
  });
}

function updatePlatformField(index, field, value) {
  if (formPlatforms[index]) {
    formPlatforms[index][field] = value;
  }
}

// ── RENDER ALL ──
function renderAll() {
  renderWeekNav();
  renderCalendar();
  renderAnimeList();
  renderStats();
}

// ── WEEK NAV ──
function renderWeekNav() {
  const days = getWeekDays(currentWeekOffset);
  const start = days[0];
  const end = days[6];
  const label = currentWeekOffset === 0 ? 'SEMANA ACTUAL' :
                currentWeekOffset > 0 ? `+${currentWeekOffset} SEMANA${currentWeekOffset>1?'S':''}` :
                `${currentWeekOffset} SEMANA${currentWeekOffset<-1?'S':''}`;
  document.getElementById('week-label').textContent = label;
  document.getElementById('week-dates').textContent =
    `${formatDateShort(start)} – ${formatDateShort(end)} · ${end.getFullYear()}`;
  document.getElementById('btn-prev').disabled = currentWeekOffset <= -4;
  document.getElementById('btn-next').disabled = currentWeekOffset >= 16;
}

// ── CALENDAR ──
function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const days = getWeekDays(currentWeekOffset);
  grid.innerHTML = '';

  days.forEach((date, idx) => {
    const dayIndex = date.getDay();
    const animesForDay = animes.filter(a => animeAppearsOnDate(a, new Date(date)));

    const col = document.createElement('div');
    col.className = 'day-col';
    if (isToday(date)) col.classList.add('today');
    else if (isPast(date)) col.classList.add('past');

    col.innerHTML = `
      <div class="day-header">
        <span class="day-name">${DAY_LABELS[dayIndex]}</span>
        <span class="day-number">${date.getDate()}</span>
      </div>
      <div class="day-entries" id="entries-${idx}"></div>
    `;
    grid.appendChild(col);

    const entriesEl = col.querySelector('.day-entries');
    if (animesForDay.length === 0) {
      entriesEl.innerHTML = `<div class="empty-day">—</div>`;
    } else {
      animesForDay.sort((a, b) => (a.airTime || '').localeCompare(b.airTime || ''));
      animesForDay.forEach(anime => {
        const epWeek = getEpisodeWeek(anime, new Date(date));
        entriesEl.appendChild(buildAnimeEntry(anime, epWeek, new Date(date)));
      });
    }
  });
}

function escapeSvgText(text) {
  if (!text) return '';
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function buildCoverFallbackSvg(title, color) {
  const bg = color || '#111f2f';
  const text = escapeSvgText(title || 'Anime');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 320">
    <rect width="240" height="320" fill="${bg}"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
      font-family="Inter, Arial, sans-serif" font-size="22" fill="#e0e7ff" letter-spacing="0.5px">
      ${text}
    </text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getCoverSrc(anime) {
  if (anime.coverUrl && anime.coverUrl.trim()) return optimizarUrlCloudinary(anime.coverUrl.trim());
  if (anime.coverPath && anime.coverPath.trim()) return anime.coverPath.trim();
  if (anime.portada && anime.portada.trim()) return anime.portada.trim();
  if (anime.foto && anime.foto.trim()) return anime.foto.trim();
  return buildCoverFallbackSvg(anime.title, anime.color);
}

function buildAnimeEntry(anime, epWeek, date) {
  const el = document.createElement('div');
  el.className = 'anime-entry has-cover';
  el.style.setProperty('--entry-color', anime.color || '#00fff5');

  if (isEpisodeWatched(anime.id, epWeek)) el.classList.add('watched');

  const coverSrc = getCoverSrc(anime);
  const fallbackCover = buildCoverFallbackSvg(anime.title, anime.color);
  const timeStr = anime.airTime ? `<span class="entry-time">${anime.airTime}</span>` : '';

  el.innerHTML = `
    <img class="anime-cover" src="${escapeAttr(coverSrc)}" alt="" loading="lazy"
      onerror="this.onerror=null; this.src='${escapeAttr(fallbackCover)}';">
    <div class="entry-title">${escapeHtml(anime.title)}</div>
    <div class="entry-meta">
      <span class="entry-ep">EP ${epWeek}/${anime.totalEpisodes}</span>
      ${timeStr}
    </div>
    <div class="entry-progress">
      <label class="episode-toggle">
        <input type="checkbox"
          ${isEpisodeWatched(anime.id, epWeek) ? 'checked' : ''}
          onchange="toggleEpisode('${anime.id}', ${epWeek})"
          onclick="event.stopPropagation()">
        Ep ${epWeek} — Visto
      </label>
    </div>
  `;

  // Click on card → open watch popup (not edit modal)
  el.addEventListener('click', (e) => {
    // Don't trigger if clicking checkbox or its label
    if (e.target.type === 'checkbox' || e.target.classList.contains('episode-toggle')) return;
    openWatchPopup(anime.id, epWeek);
  });

  return el;
}

// ── WATCH POPUP ──
function openWatchPopup(animeId, epNumber) {
  const anime = animes.find(a => a.id === animeId);
  if (!anime) return;

  const platforms = anime.platforms || [];
  const color = anime.color || '#00fff5';

  // Build platform buttons
  let platformsHtml = '';
  if (platforms.length > 0) {
    platformsHtml = platforms.map(p => {
      const url = buildEpisodeUrl(p.urlPattern, epNumber);
      const fullUrl = url && !url.startsWith('http') ? `https://${url}` : url;
      return `
        <a class="watch-platform-btn" href="${escapeAttr(fullUrl)}" target="_blank" rel="noopener"
          style="--platform-color: ${escapeAttr(color)}">
          <span class="watch-platform-icon">▶</span>
          <span>${escapeHtml(p.name || 'Ver')}</span>
        </a>
      `;
    }).join('');
  } else {
    platformsHtml = `<p class="watch-no-platforms">Sin plataformas configuradas.<br>
      <button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="closeWatchPopup(); openEditModal('${animeId}')">
        + Agregar plataformas
      </button></p>`;
  }

  document.getElementById('watch-popup-ep').textContent = `EP ${epNumber} — ${anime.title.toUpperCase()}`;
  document.getElementById('watch-popup-platforms').innerHTML = platformsHtml;
  document.getElementById('watch-popup-edit').onclick = () => { closeWatchPopup(); openEditModal(animeId); };

  // Set accent color on popup
  document.getElementById('watch-popup').style.setProperty('--popup-color', color);

  document.getElementById('watch-popup-overlay').classList.add('open');
}

function closeWatchPopup() {
  document.getElementById('watch-popup-overlay').classList.remove('open');
}

// ── ANIME LIST ──
function renderAnimeList() {
  const container = document.getElementById('anime-list');
  container.innerHTML = '';

  if (animes.length === 0) {
    container.innerHTML = `<div style="color:var(--text-dim);font-family:var(--font-mono);font-size:12px;padding:20px;grid-column:1/-1;">
      SIN ANIMES — AGREGA UNO CON EL BOTÓN +
    </div>`;
    return;
  }

  animes.forEach(anime => {
    const item = document.createElement('div');
    item.className = 'anime-list-item';
    item.style.setProperty('--item-color', anime.color || '#00fff5');

    const coverSrc = getCoverSrc(anime);
    const fallbackCover = buildCoverFallbackSvg(anime.title, anime.color);
    const platforms = anime.platforms || [];
    const platformTags = platforms.map(p =>
      `<span class="detail-tag">${escapeHtml(p.name)}</span>`
    ).join('');

    item.innerHTML = `
      <div class="item-cover-wrap">
        <img class="item-cover" src="${escapeAttr(coverSrc)}" alt="" loading="lazy"
          onerror="this.onerror=null; this.src='${escapeAttr(fallbackCover)}';">
      </div>
      <div class="item-info">
        <div class="item-title">${escapeHtml(anime.title)}</div>
        <div class="item-details">
          <span class="detail-tag">${escapeHtml(DAY_FULL[DAYS.indexOf(anime.airDay)] || anime.airDay)}</span>
          <span class="detail-tag">${anime.totalEpisodes} eps</span>
          <span class="detail-tag airing">EN EMISIÓN</span>
          ${platformTags}
        </div>
      </div>
      <div class="item-actions">
        <button class="btn btn-ghost btn-sm" onclick="openEditModal('${anime.id}')">✎</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDelete('${anime.id}')">✕</button>
      </div>
    `;
    container.appendChild(item);
  });
}

// ── STATS ──
function renderStats() {
  document.getElementById('stat-total').textContent = animes.length;
  const todayCount = animes.filter(a => animeAppearsOnDate(a, new Date())).length;
  document.getElementById('stat-today').textContent = todayCount;
  const days = getWeekDays(0);
  const weekSet = new Set();
  days.forEach(d => {
    animes.forEach(a => { if (animeAppearsOnDate(a, new Date(d))) weekSet.add(a.id); });
  });
  document.getElementById('stat-week').textContent = weekSet.size;
}

// ── MODAL ──
function openAddModal() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'NUEVO ANIME';
  document.getElementById('form-anime').reset();
  document.getElementById('field-cover-file').value = '';
  document.getElementById('field-color').value = randomNeonColor();
  document.getElementById('field-total-ep').value = 12;
  document.getElementById('field-premiere').value = formatDateFull(new Date());
  formPlatforms = [];
  renderPlatformRows();
  openModal();
}

function openEditModal(id) {
  const anime = animes.find(a => a.id === id);
  if (!anime) return;
  editingId = id;
  document.getElementById('modal-title').textContent = 'EDITAR ANIME';
  document.getElementById('field-title').value = anime.title || '';
  document.getElementById('field-total-ep').value = anime.totalEpisodes || 12;
  document.getElementById('field-premiere').value = anime.premiereDate || '';
  document.getElementById('field-day').value = anime.airDay || 'monday';
  document.getElementById('field-time').value = anime.airTime || '';
  document.getElementById('field-cover').value = anime.coverUrl && !anime.coverUrl.startsWith('data:') ? anime.coverUrl : '';
  document.getElementById('field-cover-file').value = '';
  document.getElementById('field-color').value = anime.color || '#00fff5';

  // Load existing platforms
  formPlatforms = (anime.platforms || []).map(p => ({ ...p }));
  renderPlatformRows();

  openModal();
}

function openModal() {
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('field-title').focus();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  editingId = null;
}

// ── SAVE ANIME ──
async function saveAnime() {
  const title = document.getElementById('field-title').value.trim();
  if (!title) { showToast('El título es obligatorio', 'error'); return; }

  const totalEpisodes = parseInt(document.getElementById('field-total-ep').value) || 12;
  const premiereDate = document.getElementById('field-premiere').value;
  if (!premiereDate) { showToast('La fecha de estreno es obligatoria', 'error'); return; }

  const coverFieldValue = document.getElementById('field-cover').value.trim();
  const coverFile = document.getElementById('field-cover-file').files[0];
  let coverUrl = '';
  let coverPath = '';

  if (coverFieldValue) {
    if (coverFieldValue.startsWith('./portadas/') || coverFieldValue.startsWith('portadas/')) {
      coverPath = coverFieldValue;
    } else {
      coverUrl = coverFieldValue;
    }
  } else if (coverFile && USE_CLOUDINARY) {
    try {
      showToast('Subiendo imagen...', 'info');
      coverUrl = await uploadImageToCloudinary(coverFile);
      showToast('Imagen subida ✓', 'success');
    } catch (error) {
      showToast('Error al subir imagen: ' + error.message, 'error');
      return;
    }
  } else if (editingId) {
    const existing = animes.find(a => a.id == editingId);
    if (existing) { coverUrl = existing.coverUrl || ''; coverPath = existing.coverPath || ''; }
  }

  // Normalize platform URL patterns
  const platforms = formPlatforms
    .filter(p => p.name.trim() || p.urlPattern.trim())
    .map(p => ({
      name: p.name.trim(),
      urlPattern: normalizeUrlPattern(p.urlPattern.trim())
    }));

  const data = {
    title,
    totalEpisodes,
    premiereDate,
    airDay: document.getElementById('field-day').value,
    airTime: document.getElementById('field-time').value,
    platforms,
    coverPath,
    coverUrl,
    color: document.getElementById('field-color').value,
    status: 'airing'
  };

  if (editingId) {
    const idx = animes.findIndex(a => a.id == editingId);
    if (idx !== -1) {
      data.id = editingId;
      animes[idx] = { ...data };
      showToast('Anime actualizado ✓', 'success');
    }
  } else {
    data.id = generateId();
    animes.push(data);
    showToast('Anime agregado ✓', 'success');
  }

  await saveData();
  closeModal();
  renderAll();
}

// ── DELETE ──
async function confirmDelete(id) {
  const anime = animes.find(a => a.id == id);
  if (!anime) return;
  if (!confirm(`¿Eliminar "${anime.title}"?`)) return;
  animes = animes.filter(a => a.id != id);
  try {
    await database.ref(`animes/${id}`).remove();
  } catch (error) {
    console.error('Error deleting from Firebase:', error);
  }
  renderAll();
  showToast('Anime eliminado', 'info');
}

// ── WEEK NAV ──
function prevWeek() { if (currentWeekOffset > -4) { currentWeekOffset--; renderAll(); } }
function nextWeek() { if (currentWeekOffset < 16) { currentWeekOffset++; renderAll(); } }
function goToCurrentWeek() { currentWeekOffset = 0; renderAll(); }

// ── TOAST ──
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3100);
}

// ── HELPERS ──
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function randomNeonColor() {
  const neons = ['#00fff5','#ff00c8','#7c3aed','#39ff14','#ff6600','#ffe600','#38bdf8','#f472b6','#a78bfa','#fbbf24','#34d399','#f97316'];
  return neons[Math.floor(Math.random() * neons.length)];
}

// ── EVENT LISTENERS ──
function setupEventListeners() {
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
  document.getElementById('form-anime').addEventListener('submit', (e) => {
    e.preventDefault();
    saveAnime();
  });
  document.getElementById('watch-popup-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('watch-popup-overlay')) closeWatchPopup();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModal(); closeWatchPopup(); }
  });
}

// ── RESET ──
async function resetAndReload() {
  if (!confirm('¿Recargar todos los datos desde Firebase?')) return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('animeTracker_v2');
  localStorage.removeItem('animeTracker_v1');
  await loadData();
  await loadProgress();
  renderAll();
  showToast('Datos recargados desde Firebase ✓', 'success');
}

// ── EPISODE TOGGLE ──
async function toggleEpisode(animeId, episode) {
  const currentlyWatched = isEpisodeWatched(animeId, episode);
  try {
    await markEpisode(animeId, episode, !currentlyWatched);
    renderCalendar();
  } catch (error) {
    showToast('Error updating progress', 'error');
  }
}

// ── EXPOSE GLOBALS ──
window.openAddModal = openAddModal;
window.resetAndReload = resetAndReload;
window.migrateDataToFirebase = migrateDataToFirebase;
window.openEditModal = openEditModal;
window.closeModal = closeModal;
window.saveAnime = saveAnime;
window.confirmDelete = confirmDelete;
window.prevWeek = prevWeek;
window.nextWeek = nextWeek;
window.goToCurrentWeek = goToCurrentWeek;
window.toggleEpisode = toggleEpisode;
window.closeWatchPopup = closeWatchPopup;
window.openWatchPopup = openWatchPopup;
window.removePlatformRow = removePlatformRow;
window.updatePlatformField = updatePlatformField;