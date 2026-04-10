// progressService.js
// Firebase Realtime Database progress tracking for anime episodes

// Assuming database is initialized in app.js
// This service manages /progress/{animeId}/{episodeNumber}

let progress = {}; // Local cache: progress[animeId][episode] = { watched: boolean, watchedAt?: string }

// Load all progress data from Firebase
async function loadProgress() {
  try {
    const progressRef = database.ref('progress');
    const snapshot = await progressRef.get();
    if (snapshot.exists()) {
      progress = snapshot.val();
    } else {
      progress = {};
    }
  } catch (error) {
    console.error('Error loading progress:', error);
    progress = {};
  }
}

// Mark an episode as watched or unwatched
async function markEpisode(animeId, episode, watched) {
  try {
    const episodeRef = database.ref(`progress/${animeId}/${episode}`);
    if (watched) {
      const watchedAt = new Date().toISOString();
      await episodeRef.set({ watched: true, watchedAt });
      if (!progress[animeId]) progress[animeId] = {};
      progress[animeId][episode] = { watched: true, watchedAt };
    } else {
      await episodeRef.remove();
      if (progress[animeId]) {
        delete progress[animeId][episode];
        if (Object.keys(progress[animeId]).length === 0) {
          delete progress[animeId];
        }
      }
    }
  } catch (error) {
    console.error('Error marking episode:', error);
    throw error;
  }
}

// Get progress for a specific anime
function getAnimeProgress(animeId) {
  return progress[animeId] || {};
}

// Get all progress data
function getAllProgress() {
  return progress;
}

// Check if an episode is watched
function isEpisodeWatched(animeId, episode) {
  return progress[animeId]?.[episode]?.watched || false;
}

// Expose functions globally
window.loadProgress = loadProgress;
window.markEpisode = markEpisode;
window.getAnimeProgress = getAnimeProgress;
window.getAllProgress = getAllProgress;
window.isEpisodeWatched = isEpisodeWatched;