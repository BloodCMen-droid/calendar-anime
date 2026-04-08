'use strict';

// ── CONSTANTS ──
const STORAGE_KEY = 'animeTracker_v3'; // bump version to reset stale localStorage
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
const CLOUDINARY_UPLOAD_PRESET = 'anime_tracker'; // You'll need to create this preset in Cloudinary

// Initialize Firebase
let app, database;
try {
  app = window.firebase.initializeApp(firebaseConfig);
  database = window.firebase.getDatabase(app);
} catch (error) {
  console.error('Firebase initialization error:', error);
}

// ── STATE ──
let animes = [];
let currentWeekOffset = 0; // 0 = current week
let editingId = null;

// ── INIT ──
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  renderAll();
  setupEventListeners();
});

// ── DATA MANAGEMENT ──
async function loadData() {
  try {
    const animesRef = window.firebase.ref(database, 'animes');
    const snapshot = await window.firebase.get(animesRef);

    if (snapshot.exists()) {
      const data = snapshot.val();
      // Convert Firebase object to array
      animes = Object.keys(data).map(key => ({
        id: key,
        ...data[key]
      }));
    } else {
      animes = [];
    }
  } catch (error) {
    console.error('Error loading data from Firebase:', error);
    // Fallback to local JSON if Firebase fails
    try {
      const cachebustedUrl = `./data/animes.json?v=${new Date().getTime()}`;
      const res = await fetch(cachebustedUrl);
      if (res.ok) {
        animes = await res.json();
      }
    } catch (e) {
      animes = [];
    }
  }
}

function saveToLocalStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: DATA_VERSION,
    animes,
  }));
}

async function saveData() {
  try {
    const animesRef = window.firebase.ref(database, 'animes');
    const animesObject = {};
    animes.forEach(anime => {
      animesObject[anime.id] = { ...anime };
      delete animesObject[anime.id].id; // Remove id from data since it's the key
    });
    await window.firebase.set(animesRef, animesObject);
  } catch (error) {
    console.error('Error saving to Firebase:', error);
    // Fallback to localStorage
    saveToLocalStorage();
  }
}

// ── CLOUDINARY IMAGE UPLOAD ──
async function uploadImageToCloudinary(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', 'anime_tracker'); // Create folder for anime images

  try {
    const response = await fetch(CLOUDINARY_URL, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.secure_url; // Return the uploaded image URL
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    throw error;
  }
}

// ── MIGRATE EXISTING DATA TO FIREBASE ──
async function migrateDataToFirebase() {
  try {
    // Load from local JSON first
    const cachebustedUrl = `./data/animes.json?v=${new Date().getTime()}`;
    const res = await fetch(cachebustedUrl);
    if (res.ok) {
      const localAnimes = await res.json();
      const animesRef = window.firebase.ref(database, 'animes');
      const animesObject = {};
      localAnimes.forEach(anime => {
        const id = generateId();
        animesObject[id] = { ...anime, id };
      });
      await window.firebase.set(animesRef, animesObject);
      showToast('Datos migrados a Firebase ✓', 'success');
    }
  } catch (error) {
    console.error('Error migrating data:', error);
    showToast('Error al migrar datos', 'error');
  }
}

function generateId() {
  const newRef = window.firebase.push(window.firebase.ref(database, 'animes'));
  return newRef.key;
}

// ── DATE / WEEK UTILS ──
function getWeekStart(offset = 0) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = today.getDay(); // 0=Sun
  // Days to subtract to get to Monday: Sun(-6) Mon(0) Tue(-1) Wed(-2) Thu(-3) Fri(-4) Sat(-5)
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
// Returns the Monday of the week containing a given date
function getMondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun
  // Days to subtract to get to Monday: Sun(6) Mon(0) Tue(1) Wed(2) Thu(3) Fri(4) Sat(5)
  const daysBack = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - daysBack);
  return d;
}

// Returns which episode number airs on a given date for an anime (1-based).
// Returns null if before premiere or beyond total episodes.
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
  const episodeNumber = diffWeeks + 1; // 1-indexed

  if (episodeNumber < 1 || episodeNumber > anime.totalEpisodes) return null;
  return episodeNumber;
}

// Should this anime appear on this specific day?
function animeAppearsOnDate(anime, date) {
  const dayName = DAYS[date.getDay()];
  if (anime.airDay !== dayName) return false;
  const epWeek = getEpisodeWeek(anime, new Date(date));
  return epWeek !== null;
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

  // Disable prev if no anime would ever show before current week - 8 weeks
  document.getElementById('btn-prev').disabled = currentWeekOffset <= -4;
  document.getElementById('btn-next').disabled = currentWeekOffset >= 16;
}

// ── CALENDAR ──
function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const days = getWeekDays(currentWeekOffset);
  grid.innerHTML = '';

  // Order: Mon Tue Wed Thu Fri Sat Sun (days array starts Monday)
  days.forEach((date, idx) => {
    const dayIndex = date.getDay(); // 0=Sun,1=Mon...
    const dayKey = DAYS[dayIndex];

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
      // Sort by air time
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
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 320">
      <rect width="240" height="320" fill="${bg}"/>
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
        font-family="Inter, Arial, sans-serif" font-size="22" fill="#e0e7ff" letter-spacing="0.5px">
        ${text}
      </text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getCoverSrc(anime) {
  if (anime.coverPath && anime.coverPath.trim()) return anime.coverPath.trim();
  if (anime.portada && anime.portada.trim()) return anime.portada.trim();
  if (anime.foto && anime.foto.trim()) return anime.foto.trim();
  if (anime.coverUrl && anime.coverUrl.trim()) return anime.coverUrl.trim();
  return buildCoverFallbackSvg(anime.title, anime.color);
}

function buildAnimeEntry(anime, epWeek, date) {
  const el = document.createElement('div');
  el.className = 'anime-entry has-cover';
  el.style.setProperty('--entry-color', anime.color || '#00fff5');

  const coverSrc = getCoverSrc(anime);
  const fallbackCover = buildCoverFallbackSvg(anime.title, anime.color);
  const timeStr = anime.airTime
    ? `<span class="entry-time">${anime.airTime}</span>`
    : '';

  el.innerHTML = `
    <img class="anime-cover" src="${escapeAttr(coverSrc)}" alt="" loading="lazy" onerror="this.onerror=null; this.src='${escapeAttr(fallbackCover)}';">
    <div class="entry-title">${escapeHtml(anime.title)}</div>
    <div class="entry-meta">
      <span class="entry-ep">EP ${epWeek}/${anime.totalEpisodes}</span>
      ${timeStr}
    </div>
  `;

  el.addEventListener('click', () => openEditModal(anime.id));
  return el;
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

    item.innerHTML = `
      <div class="item-cover-wrap">
        <img class="item-cover" src="${escapeAttr(coverSrc)}" alt="" loading="lazy" onerror="this.onerror=null; this.src='${escapeAttr(fallbackCover)}';">
      </div>
      <div class="item-info">
        <div class="item-title">${escapeHtml(anime.title)}</div>
        <div class="item-details">
          <span class="detail-tag">${escapeHtml(DAY_FULL[DAYS.indexOf(anime.airDay)] || anime.airDay)}</span>
          <span class="detail-tag">${anime.totalEpisodes} eps</span>
          <span class="detail-tag airing">EN EMISIÓN</span>
        </div>
      </div>
      <div class="item-actions">
        <button class="btn btn-ghost btn-sm" onclick="openEditModal(${anime.id})">✎</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDelete(${anime.id})">✕</button>
      </div>
    `;

    container.appendChild(item);
  });
}

// ── STATS ──
function renderStats() {
  document.getElementById('stat-total').textContent = animes.length;

  const today = new Date();
  const todayKey = DAYS[today.getDay()];
  const todayCount = animes.filter(a => animeAppearsOnDate(a, new Date())).length;
  document.getElementById('stat-today').textContent = todayCount;

  // Count animes in current week
  const days = getWeekDays(0);
  const weekSet = new Set();
  days.forEach(d => {
    animes.forEach(a => {
      if (animeAppearsOnDate(a, new Date(d))) weekSet.add(a.id);
    });
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
  document.getElementById('field-platform').value = anime.platform || '';
  document.getElementById('field-cover').value = anime.coverUrl && !anime.coverUrl.startsWith('data:') ? anime.coverUrl : '';
  document.getElementById('field-cover-file').value = '';
  document.getElementById('field-color').value = anime.color || '#00fff5';

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
  let coverUrl = coverFieldValue;
  let coverPath = '';

  // Handle image upload to Cloudinary
  if (coverFile) {
    try {
      showToast('Subiendo imagen...', 'info');
      coverUrl = await uploadImageToCloudinary(coverFile);
      coverPath = '';
      showToast('Imagen subida ✓', 'success');
    } catch (error) {
      showToast('Error al subir imagen: ' + error.message, 'error');
      return;
    }
  } else if (editingId) {
    const existing = animes.find(a => a.id === editingId);
    if (existing) {
      if (!coverFieldValue) {
        coverUrl = existing.coverUrl || '';
        coverPath = existing.coverPath || '';
      } else if (coverFieldValue.startsWith('./portadas/') || coverFieldValue.startsWith('portadas/')) {
        coverPath = coverFieldValue;
      } else {
        coverPath = '';
      }
    }
  } else if (coverFieldValue.startsWith('./portadas/') || coverFieldValue.startsWith('portadas/')) {
    coverPath = coverFieldValue;
  }

  const data = {
    title,
    totalEpisodes,
    premiereDate,
    airDay: document.getElementById('field-day').value,
    airTime: document.getElementById('field-time').value,
    platform: document.getElementById('field-platform').value.trim(),
    coverPath,
    coverUrl,
    color: document.getElementById('field-color').value,
    status: 'airing'
  };

  if (editingId) {
    const idx = animes.findIndex(a => a.id === editingId);
    if (idx !== -1) {
      animes[idx] = { ...animes[idx], ...data };
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
  const anime = animes.find(a => a.id === id);
  if (!anime) return;
  if (!confirm(`¿Eliminar "${anime.title}"?`)) return;

  animes = animes.filter(a => a.id !== id);

  // Delete from Firebase
  try {
    const animeRef = window.firebase.ref(database, `animes/${id}`);
    await window.firebase.remove(animeRef);
  } catch (error) {
    console.error('Error deleting from Firebase:', error);
  }

  renderAll();
  showToast('Anime eliminado', 'info');
}

// ── WEEK NAV ACTIONS ──
function prevWeek() {
  if (currentWeekOffset > -4) {
    currentWeekOffset--;
    renderAll();
  }
}

function nextWeek() {
  if (currentWeekOffset < 16) {
    currentWeekOffset++;
    renderAll();
  }
}

function goToCurrentWeek() {
  currentWeekOffset = 0;
  renderAll();
}

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
  // Modal overlay click to close
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  // Form submit
  document.getElementById('form-anime').addEventListener('submit', (e) => {
    e.preventDefault();
    saveAnime();
  });

  // ESC to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

// ── RESET & RELOAD FROM JSON ──
async function resetAndReload() {
  if (!confirm('¿Recargar todos los datos desde Firebase? Se perderán cambios no guardados.')) return;
  localStorage.removeItem(STORAGE_KEY);
  // Also clear old versions
  localStorage.removeItem('animeTracker_v2');
  localStorage.removeItem('animeTracker_v1');
  await loadData();
  renderAll();
  showToast('Datos recargados desde Firebase ✓', 'success');
}

// Expose globals for inline HTML handlers
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