/*
 * ff-catalog
 *
 * Copyright (C) 2026 Afnan Tawsif
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

// ================================================================
//  🚀  CONFIGURATION  –  Edit these to point to your own fork
// ================================================================

const CONFIG = {
    WEBSITE_URL: '',
    CDN_BASE_URL: 'icons/PNG/',
    FALLBACK_CDN_BASE_URL: 'icons/PNG/',

    DATABASE_URL: 'database.msgpack.gz',
    FALLBACK_DATABASE_URL: 'database.msgpack.gz',

    WHATS_NEW_URL: 'WebApp/Online/whats_new.json',
    FALLBACK_WHATS_NEW_URL: 'WebApp/Online/whats_new.json',

    AUTHOR_IMAGE_URL: 'images/shizuka.svg',
    FALLBACK_AUTHOR_IMAGE_URL: 'images/shizuka.svg',

    BANNER_IMAGE_URL: 'images/shizuka.svg',
    FALLBACK_BANNER_IMAGE_URL: 'images/shizuka.svg',

    FALLBACK_IMAGE_URL: 'icons/error.webp',
    ERROR_403_IMAGE_URL: 'icons/error-403.webp',
    NETWORK_ERROR_IMAGE_URL: 'icons/network-error.webp',

    GITHUB_REPO_URL: 'https://github.com/Garena100BDvi/ff-catalog',
    GITHUB_API_TREE_URL: '/api/github-tree',

    CONTACT: {
        devName: 'Shizuka',
        secondName: 'Shizuka',
        telegram: 'https://web.telegram.org/a/#8449796307'
    },

    ONLINE_BASE_URL: 'WebApp/Online/',
    FALLBACK_ONLINE_BASE_URL: 'WebApp/Online/',
    TUTORIAL_MD_URL: 'WebApp/Online/tutorial.md',
    FALLBACK_TUTORIAL_MD_URL: 'WebApp/Online/tutorial.md',
    HAYATO_IMAGE_URL: 'WebApp/Online/hayato.webp',
    FALLBACK_HAYATO_IMAGE_URL: 'WebApp/Online/hayato.webp',
    PERFORMANCE_MODE_IMAGE_URL: 'WebApp/Online/hayato.webp',
    FALLBACK_PERFORMANCE_MODE_IMAGE_URL: 'WebApp/Online/hayato.webp',
};

// ================================================================
//  END OF CONFIGURATION
// ================================================================

// --------------------------------------------------------------
//  HELPER: Return correct fallback URL based on error
// --------------------------------------------------------------
function getFallbackUrl(err) {
    const status = (typeof err === 'number') ? err : (err.status || 0);

    if (status === 403) {
        return CONFIG.ERROR_403_IMAGE_URL;
    }
    if (status === 0) {
        return CONFIG.NETWORK_ERROR_IMAGE_URL;
    }
    return CONFIG.FALLBACK_IMAGE_URL;
}

// --------------------------------------------------------------
//  HELPER: Fetch with automatic fallback on ANY primary error
// --------------------------------------------------------------
async function fetchWithFallback(primaryUrl, fallbackUrl, options = {}) {
    const {
        timeout = 8000,
        ...fetchOptions
    } = options;

    async function fetchWithTimeout(url) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                ...fetchOptions,
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            return response;
        } catch (err) {
            clearTimeout(timeoutId);

            if (err.name === 'AbortError') {
                const timeoutErr = new Error('Request timed out');
                timeoutErr.status = 0;
                throw timeoutErr;
            }

            const networkErr = new Error(`Network error: ${err.message}`);
            networkErr.status = 0;
            throw networkErr;
        }
    }

    let primaryError = null;

    // ----------------------------------------------------------
    // 1. Try primary CDN
    // ----------------------------------------------------------
    try {
        const response = await fetchWithTimeout(primaryUrl);

        if (response.ok) {
            return response;
        }

        primaryError = new Error(`HTTP ${response.status}`);
        primaryError.status = response.status;
    } catch (err) {
        primaryError = err;
    }

    // ----------------------------------------------------------
    // 2. Primary failed → ALWAYS try fallback CDN
    // ----------------------------------------------------------
    if (fallbackUrl) {
        try {
            const fallbackResponse = await fetchWithTimeout(fallbackUrl);

            if (fallbackResponse.ok) {
                return fallbackResponse;
            }

            const fallbackError = new Error(
                `Fallback CDN failed with HTTP ${fallbackResponse.status}`
            );
            fallbackError.status = fallbackResponse.status;
            fallbackError.primaryError = primaryError;

            throw fallbackError;
        } catch (fallbackErr) {
            console.warn(
                'Primary CDN failed; fallback CDN also failed.',
                {
                    primaryError,
                    fallbackError: fallbackErr
                }
            );

            throw primaryError;
        }
    }

    throw primaryError;
}

// ================================================================
//  🖼️  ROBUST IMAGE LOADER
//  - In-flight deduplication (no artificial 500 ms sleep)
//  - Cache-first, then primary CDN → fallback CDN
//  - Overall timeout still enforced
// ================================================================

// URLs currently being loaded. If a second caller asks for the same
// URL while the first is still in flight, they share the same promise
// instead of issuing their own fetch. This is what makes the old
// 500 ms "wait and retry the cache" trick unnecessary.
const _inflightImageLoads = new Map();

async function loadImageWithRetry(url, options = {}) {
    const {
        fallbackUrl = url,
            cacheName = 'ff-icons',
            timeout = 20000,
            primaryTimeout = 15000,
            fallbackTimeout = 8000
    } = options;

    const key = cacheName + '::' + url;

    // ----------------------------------------------------------
    // If an identical load is already in flight, reuse it.
    // ----------------------------------------------------------
    const existing = _inflightImageLoads.get(key);
    if (existing) {
        return existing;
    }

    // ----------------------------------------------------------
    // Helper: fetch a URL with an AbortController timeout.
    // ----------------------------------------------------------
    async function fetchWithTimeout(targetUrl, ms) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), ms);
        try {
            const response = await fetch(targetUrl, { signal: controller.signal });
            clearTimeout(id);
            return response;
        } catch (err) {
            clearTimeout(id);
            if (err.name === 'AbortError') {
                const timeoutErr = new Error('Request timed out');
                timeoutErr.status = 0;
                throw timeoutErr;
            }
            throw err;
        }
    }

    // ----------------------------------------------------------
    // Helper: try primary, then fallback on ANY error.
    // ----------------------------------------------------------
    async function networkFetchWithFallback(primaryUrl, fbUrl) {
        let primaryError = null;

        try {
            const response = await fetchWithTimeout(primaryUrl, primaryTimeout);
            if (response.ok) return response;

            primaryError = new Error(`Primary CDN returned HTTP ${response.status}`);
            primaryError.status = response.status;
        } catch (err) {
            primaryError = err.status
                ? err
                : Object.assign(new Error(`Primary CDN network error: ${err.message}`), { status: 0 });
        }

        if (fbUrl) {
            try {
                const fallbackResponse = await fetchWithTimeout(fbUrl, fallbackTimeout);
                if (fallbackResponse.ok) return fallbackResponse;
                console.warn(`Fallback CDN returned HTTP ${fallbackResponse.status}`);
            } catch (fallbackErr) {
                console.warn('Fallback CDN network error:', fallbackErr);
            }
        }

        throw primaryError;
    }

    // ----------------------------------------------------------
    // The actual work: cache lookup → network → cache write.
    // ----------------------------------------------------------
    const work = (async () => {
        // ---- 1. Single cache lookup ----
        try {
            const cache = await caches.open(cacheName);
            const cachedResponse = await cache.match(url);
            if (cachedResponse) {
                const blob = await cachedResponse.blob();
                if (blob && blob.size > 0) {
                    return { blob, fromCache: true };
                }
            }
        } catch (_) {
            // Cache API unavailable (private mode, etc.) → fall through to network.
        }

        // ---- 2. Network: primary → fallback ----
        const response = await networkFetchWithFallback(url, fallbackUrl);
        const blob = await response.blob();

        if (!blob || blob.size === 0) {
            const emptyBlobError = new Error('Empty blob from CDN');
            emptyBlobError.status = 0;
            throw emptyBlobError;
        }

        // ---- 3. Cache write (awaited, so concurrent readers can hit it) ----
        try {
            const cache = await caches.open(cacheName);
            await cache.put(url, new Response(blob, { headers: response.headers }));
        } catch (_) {
            // Non-fatal: if caching fails we still return the blob.
        }

        return { blob, fromCache: false };
    })();

    // ----------------------------------------------------------
    // Enforce an overall wall-clock timeout on the whole pipeline.
    // ----------------------------------------------------------
    let overallTimerId = null;
    const overallTimeout = new Promise((_, reject) => {
        overallTimerId = setTimeout(() => {
            const err = new Error('Image loading timed out');
            err.status = 0;
            reject(err);
        }, timeout);
    });

    const tracked = Promise.race([work, overallTimeout])
        .finally(() => {
            clearTimeout(overallTimerId);
            _inflightImageLoads.delete(key);
        });

    _inflightImageLoads.set(key, tracked);
    return tracked;
}

// --------------------------------------------------------------
//  SETTINGS TAB LOGIC
// --------------------------------------------------------------
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');

        const settingsBody = document.querySelector('.settings-body');
        if (settingsBody) settingsBody.scrollTop = 0;

        if (btn.dataset.tab === 'contact') {
            loadAuthorImageWithCache();
        }

        setTimeout(updateSettingsScrollDown, 50);
    });
});

// --------------------------------------------------------------
//  APP CONSTANTS & SERVICE WORKER
// --------------------------------------------------------------
let WEBAPP_VERSION = 'Unknown';
let swRegistration = null;
let versionResolve = null;
const versionPromise = new Promise(resolve => { versionResolve = resolve; });

const WEBSITE_URL = CONFIG.WEBSITE_URL || (window.location.origin + window.location.pathname).replace(/\/+$/, '');

const WEBAPP_VERSION_STORAGE_KEY = 'ff_webapp_version';

const sourceCodeLink = document.getElementById('sourceCodeLink');
if (sourceCodeLink) sourceCodeLink.href = CONFIG.GITHUB_REPO_URL;

const contactTelegramEl = document.getElementById('contactTelegram');
if (contactTelegramEl) contactTelegramEl.href = CONFIG.CONTACT.telegram;
const devNameUI = document.getElementById('devNameUI');
if (devNameUI) devNameUI.textContent = `${CONFIG.CONTACT.devName} (${CONFIG.CONTACT.secondName})`;
document.getElementById('profileAuthorName').textContent = CONFIG.CONTACT.devName;
const profileSecondNameEl = document.getElementById('profileSecondName');
if (profileSecondNameEl) profileSecondNameEl.textContent = '@' + CONFIG.CONTACT.secondName;

const profileBannerEl = document.getElementById('profileBannerImage');
if (profileBannerEl) {
    profileBannerEl.onerror = () => {
        if (!profileBannerEl.dataset.triedLocal && !profileBannerEl.src.includes('icons/profile-banner.jpg')) {
            profileBannerEl.dataset.triedLocal = '1';
            profileBannerEl.src = 'icons/profile-banner.jpg';
        } else if (profileBannerEl.src !== CONFIG.FALLBACK_BANNER_IMAGE_URL) {
            profileBannerEl.src = CONFIG.FALLBACK_BANNER_IMAGE_URL;
        }
    };
    if (!profileBannerEl.getAttribute('src')) {
        profileBannerEl.src = 'icons/profile-banner.jpg';
    }
}

// --------------------------------------------------------------
//  FLAGS FOR CREDIT TOAST MANAGEMENT
// --------------------------------------------------------------
let initialLoadDone = false;
let creditToastShown = false;
let isUpdateReload = false;

// --------------------------------------------------------------
//  FETCH SERVICE WORKER VERSION (returns a promise)
//  – Now falls back to localStorage cache if network fails
// --------------------------------------------------------------
async function fetchSWVersion() {
    let version = null;
    let fromCache = false;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch('sw.js?nocache=' + Date.now(), {
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error('Network error');
        const text = await res.text();
        const patterns = [
            /CACHE_NAME\s*=\s*['"][^'"]*-(v[\d\.]+)['"]/,
            /version\s*[:=]\s*['"](v[\d\.]+)['"]/,
            /CACHE_NAME\s*=\s*['"]([^'"]*)['"]/
        ];
        for (const pat of patterns) {
            const match = text.match(pat);
            if (match) {
                version = match[1] || match[0];
                break;
            }
        }
        if (version) {
            localStorage.setItem(WEBAPP_VERSION_STORAGE_KEY, version);
        } else {
            console.warn('Could not extract version from sw.js');
            const cached = localStorage.getItem(WEBAPP_VERSION_STORAGE_KEY);
            if (cached) {
                version = cached;
                fromCache = true;
            }
        }
    } catch (e) {
        console.error("Could not fetch SW version", e);
        const cached = localStorage.getItem(WEBAPP_VERSION_STORAGE_KEY);
        if (cached) {
            version = cached;
            fromCache = true;
        }
    }

    if (version) {
        WEBAPP_VERSION = version;
        if (fromCache) {
            setTimeout(() => {
                showToast(`Using cached WebApp version: ${WEBAPP_VERSION}`);
            }, 800);
        }
    } else {
        WEBAPP_VERSION = 'Unknown';
    }

    document.getElementById('webappVersionUI').textContent = WEBAPP_VERSION;
    if (versionResolve) versionResolve(WEBAPP_VERSION);
    return WEBAPP_VERSION;
}

// --------------------------------------------------------------
//  SERVICE WORKER REGISTRATION (with update detection)
// --------------------------------------------------------------
function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.warn('Service workers not supported');
        return Promise.reject('Service workers not supported');
    }

    return navigator.serviceWorker.register('sw.js')
        .then(reg => {
            swRegistration = reg;
            console.log('Service Worker registered successfully');
            reg.update().catch(() => {});

            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        sessionStorage.setItem('sw_update_pending', 'true');
                        sessionStorage.setItem('webapp_updated', 'true');
                        sessionStorage.setItem('clear_url_on_load', 'true');
                    }
                });
            });

            return reg;
        })
        .catch(err => {
            console.error('SW Registration failed:', err);
            swRegistration = null;
            return Promise.reject(err);
        });
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        registerServiceWorker();

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (sessionStorage.getItem('sw_update_pending') === 'true') {
                sessionStorage.removeItem('sw_update_pending');
                if (!refreshing) {
                    refreshing = true;
                    window.location.reload();
                }
            }
        });
    });
}

// --------------------------------------------------------------
//  STATE & STACK
// --------------------------------------------------------------
let allItems = [];
let filteredItems = [];
let totalItemsCount = 0;
let itemsById = new Map();
let metadataObj = null;
let rawDbUpdatedOnText = "Unknown";
let dbUpdatedOnText = "Unknown";
let currentPage = 1;
let ITEMS_PER_PAGE = 80;
let totalPages = 1;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Storage mode: false = direct <img> loading (browser HTTP cache only)
//               true  = Cache API + blob → objectURL (offline-capable)
let useIconStorage = false;

let activeModalStack = [];
let currentItemModalId = null;

let toastTimeout = null;

// What's New pagination state
let whatsNewFullData = null;
let whatsNewCurrentPage = 1;
const WHATS_NEW_PER_PAGE = 5;

const rarityMap = {
    'NONE': 'None',
    'WHITE': 'Common',
    'GREEN': 'Uncommon',
    'BLUE': 'Rare',
    'PURPLE': 'Epic',
    'PURPLE_PLUS': 'Epic++',
    'ORANGE': 'Mythic',
    'ORANGE_PLUS': 'Mythic++',
    'RED': 'Artifact'
};

// --------------------------------------------------------------
//  FAVORITES SYSTEM – simple array of IDs, newest first
// --------------------------------------------------------------
const FAV_STORAGE_KEY = 'ff_favorites';
let favorites = []; // array of string IDs, newest first
let favoriteIds = new Set();

function normalizeFavoritesList(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const result = [];
    for (const id of list) {
        const strId = String(id).trim();
        if (strId && !seen.has(strId)) {
            seen.add(strId);
            result.push(strId);
        }
    }
    return result;
}

function loadFavorites() {
    let list = [];
    try {
        const raw = localStorage.getItem(FAV_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                list = parsed;
            }
        }
    } catch (e) {
        // ignore
    }
    const normalized = normalizeFavoritesList(list);
    favorites = normalized;
    favoriteIds = new Set(normalized);
    if (JSON.stringify(list) !== JSON.stringify(normalized)) {
        saveFavorites(normalized);
    } else {
        updateFavUI();
    }
}

function saveFavorites(list) {
    const normalized = normalizeFavoritesList(list);
    favorites = normalized;
    favoriteIds = new Set(normalized);
    try {
        localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(normalized));
    } catch (err) {
        console.warn('Failed to save favorites:', err);
    }
    updateFavUI();
}

function isFavorited(id) {
    return favoriteIds.has(String(id));
}

function toggleFavorite(id) {
    const strId = String(id);
    let list = favorites.slice();
    const idx = list.indexOf(strId);
    if (idx > -1) {
        list.splice(idx, 1);
    } else {
        list.unshift(strId); // newest first
    }
    saveFavorites(list);
    if (favFilterActive) {
        applyFilters();
    }
}

function getFavorites() {
    return favorites.slice();
}

function getFavoritedItems() {
    const items = [];
    favorites.forEach(id => {
        const item = itemsById.get(id);
        if (item) items.push(item);
    });
    return items;
}

// --------------------------------------------------------------
//  FAVORITES UI STATE
// --------------------------------------------------------------
let favFilterActive = false;

function loadFavState() {
    const stored = localStorage.getItem('favFilterActive');
    if (stored !== null) {
        favFilterActive = stored === 'true';
    } else {
        favFilterActive = false;
    }
}

function saveFavState() {
    localStorage.setItem('favFilterActive', String(favFilterActive));
}

function updateFavUI() {
    const count = favorites.length;

    const toggle = document.getElementById('favToggle');
    const starEl = document.getElementById('favStar');
    const countEl = document.getElementById('favCount');
    if (favFilterActive) {
        toggle.classList.add('active');
        starEl.textContent = '★';
    } else {
        toggle.classList.remove('active');
        starEl.textContent = '☆';
    }
    countEl.textContent = count;

    const toolbar = document.getElementById('favToolbar');
    const toolbarCount = document.getElementById('favToolbarCount');
    if (favFilterActive) {
        toolbar.classList.add('visible');
        toolbarCount.textContent = count;
    } else {
        toolbar.classList.remove('visible');
    }

    document.querySelectorAll('.star-btn').forEach(btn => {
        const id = btn.dataset.id;
        if (id) {
            const favorited = isFavorited(id);
            btn.innerHTML = favorited ? '★' : '☆';
            btn.classList.toggle('favorited', favorited);
        }
    });
}

// --------------------------------------------------------------
//  STATUS BAR UPDATE
// --------------------------------------------------------------
function updateStatusBar() {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    if (!dot || !text) return;
    const filtered = filteredItems.length;
    const total = favFilterActive ? favorites.length : totalItemsCount;
    text.textContent = `Showing ${filtered} of ${total} items`;

    const isReduced = document.body.classList.contains('reduce-effects');
    const hasSearchOrFilters = 
        searchInput.value.trim().length > 0 ||
        typeFilter.value ||
        rareFilter.value ||
        tagFilter.value;

    const isFavOnly = favFilterActive && !hasSearchOrFilters;

    // Remove previous color classes
    dot.classList.remove('filtered', 'favorites');

    if (isFavOnly) {
        dot.classList.add('favorites');
    } else if (hasSearchOrFilters || favFilterActive) {
        dot.classList.add('filtered');
    }
    // else: default purple (no extra class)

    if (isReduced) {
        dot.classList.remove('glow');
        dot.classList.add('no-glow');
    } else {
        dot.classList.remove('no-glow');
        dot.classList.add('glow');
    }
}

// --------------------------------------------------------------
//  MODE INDICATOR UPDATE
// --------------------------------------------------------------
function updateModeIndicator() {
    const dot = document.getElementById('modeDot');
    const text = document.getElementById('modeText');
    if (!dot || !text) return;

    const isReduced = document.body.classList.contains('reduce-effects');
    const isPerformance = reduceEffectsToggle.checked;

    if (isPerformance) {
        dot.className = 'status-dot mode-performance';
        text.textContent = 'Performance mode';
    } else {
        dot.className = 'status-dot mode-normal';
        text.textContent = 'Normal mode';
    }

    if (isReduced) {
        dot.classList.add('no-glow');
        dot.classList.remove('glow');
    } else {
        dot.classList.remove('no-glow');
        dot.classList.add('glow');
    }
}

// --------------------------------------------------------------
//  DOM REFS
// --------------------------------------------------------------
const grid = document.getElementById('itemGrid');
const gridWrapper = document.getElementById('gridWrapper');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');

const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');
const searchIcon = document.getElementById('searchIcon');
const tagFilter = document.getElementById('tagFilter');
const typeFilter = document.getElementById('typeFilter');
const rareFilter = document.getElementById('rareFilter');

// --- NEW: Filter pill and toggle ---
const filterVisibilityToggle = document.getElementById('filterVisibilityToggle');
const filterVisibilityIcon = document.getElementById('filterVisibilityIcon');
let filtersHidden = false;

const rangeName = document.getElementById('rangeName');
const rangeID = document.getElementById('rangeID');
const rangeDesc = document.getElementById('rangeDesc');
const rangeIcon = document.getElementById('rangeIcon');
const clickAction = document.getElementById('clickAction');
const downloadAs = document.getElementById('downloadAs');
const reqDataBtns = document.querySelectorAll('.req-data-btn');

const paginationContainer = document.getElementById('paginationContainer');
const jumpInput = document.getElementById('jumpInput');
const searchPageBtn = document.getElementById('searchPageBtn');
const totalPagesUI = document.getElementById('totalPagesUI');
const pageNumbersEl = document.getElementById('pageNumbers');
const toast = document.getElementById('toast');

const iconLimitInput = document.getElementById('iconLimitInput');
const iconLimitTick = document.getElementById('iconLimitTick');
const storageBarFill = document.getElementById('storageBarFill');
const storageBarText = document.getElementById('storageBarText');
const cleanStorageBtn = document.getElementById('cleanStorageBtn');

// --- NEW: Use-storage toggle refs ---
const useStorageToggle = document.getElementById('useStorageToggle');
const useStorageStatus = document.getElementById('useStorageStatus');
const iconStorageDetails = document.getElementById('iconStorageDetails');

const itemsPerPageInput = document.getElementById('itemsPerPageInput');
const itemsPerPageTick = document.getElementById('itemsPerPageTick');

const modalShareBtn = document.getElementById('modalShareBtn');

const reloadBtn = document.getElementById('reloadBtn');

// ----- HEADER TABS (replaces old mainTitle) -----
const catalogTab = document.getElementById('catalogTab');
const profilesTab = document.getElementById('profilesTab');

const viewChangelogsBtn = document.getElementById('viewChangelogsBtn');

const authorImg = document.getElementById('authorImage');
const authorLoader = document.getElementById('authorImageLoader');

// --------------------------------------------------------------
//  REDUCE EFFECTS TOGGLE – DOM REFS & STATE
// --------------------------------------------------------------
const reduceEffectsToggle = document.getElementById('reduceEffectsToggle');
const reduceEffectsStatus = document.getElementById('reduceEffectsStatus');

// --------------------------------------------------------------
//  SEARCH CLEAR BUTTON LOGIC
// --------------------------------------------------------------
searchInput.addEventListener('input', function() {
    const hasValue = this.value.length > 0;
    searchClear.style.display = hasValue ? 'flex' : 'none';
    searchIcon.style.display = hasValue ? 'none' : 'flex';  // hide icon when typing, show when empty
});

searchClear.addEventListener('click', function() {
    searchInput.value = '';
    searchClear.style.display = 'none';
    searchIcon.style.display = 'flex';
    searchInput.focus();
    applyFilters();
});

searchClear.style.display = 'none';
searchIcon.style.display = 'flex';

// Enter key closes keyboard and returns to top instantly
searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        searchInput.blur();
        if (document.activeElement === searchInput) {
            document.activeElement.blur();
        }
        requestAnimationFrame(() => {
            window.scrollTo({ top: 0, behavior: 'auto' });
        });
    }
});

// --------------------------------------------------------------
//  DATE FORMATTING
// --------------------------------------------------------------
function formatDatabaseDate(dateStr) {
    if (!dateStr || dateStr === "Unknown") return "Unknown";
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const year = parts[0];
    const monthNum = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
        "November", "December"
    ];
    const monthName = months[monthNum - 1];
    if (!monthName || isNaN(day)) return dateStr;
    return `${day} ${monthName}, ${year}`;
}

function showToast(msg) {
    if (toastTimeout) {
        clearTimeout(toastTimeout);
        toastTimeout = null;
    }
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.textContent = msg;
    toast.classList.add('show');
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
        toastTimeout = null;
    }, 3500);
}

function showCreditToastIfNeeded() {
    if (creditToastShown || isUpdateReload) return;
    creditToastShown = true;
    setTimeout(() => {
        showToast("🛠️ Dev: @Arafat.py (Garean100BD)");
    }, 800);
}

// --------------------------------------------------------------
//  WHAT'S NEW? DIALOG – (Removed)
// --------------------------------------------------------------
async function showWhatsNew() {
    return;
}

// --------------------------------------------------------------
//  AUTHOR IMAGE LOADING
// --------------------------------------------------------------
function getFallbackAuthorSVG() {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="130" height="130">
        <circle cx="50" cy="50" r="48" fill="#2a2a2a" stroke="#444" stroke-width="2"/>
        <circle cx="50" cy="35" r="20" fill="#555"/>
        <circle cx="50" cy="35" r="18" fill="#666"/>
        <ellipse cx="50" cy="80" rx="30" ry="22" fill="#555"/>
        <ellipse cx="50" cy="80" rx="28" ry="20" fill="#666"/>
        </svg>
        `)}`;
}

async function loadAuthorImageWithCache() {
    const img = authorImg;
    const loader = authorLoader;
    const cacheKey = CONFIG.AUTHOR_IMAGE_URL;
    const fetchUrlPrimary = CONFIG.AUTHOR_IMAGE_URL + '?nocache=' + Date.now();
    const fetchUrlFallback = CONFIG.FALLBACK_AUTHOR_IMAGE_URL + '?nocache=' + Date.now();

    loader.classList.remove('hidden');

    let cache = null;
    let cachedBlob = null;
    let cacheTimestamp = 0;

    try {
        cache = await caches.open('ff-author-v2');
        const cachedResponse = await cache.match(cacheKey);
        if (cachedResponse) {
            cachedBlob = await cachedResponse.blob();
            cacheTimestamp = parseInt(localStorage.getItem('ff-author-timestamp-v2')) || 0;
        }
    } catch (e) { /* ignore */ }

    if (cachedBlob) {
        const objectUrl = URL.createObjectURL(cachedBlob);
        setImageBlob(img, objectUrl);
        img.classList.add('loaded');
        loader.classList.add('hidden');
    } else {
        img.src = getFallbackAuthorSVG();
        img.classList.add('loaded');
    }

    const now = Date.now();
    const shouldRefresh = !cachedBlob || (now - cacheTimestamp > ONE_DAY_MS);

    if (shouldRefresh) {
        try {
            loader.classList.remove('hidden');
            const response = await fetchWithFallback(fetchUrlPrimary, fetchUrlFallback, { timeout: 15000 });
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            setImageBlob(img, objectUrl);
            img.classList.add('loaded');
            if (cache) {
                try {
                    await cache.put(cacheKey, new Response(blob, {
                        headers: { 'Content-Type': 'image/jpeg' }
                    }));
                    localStorage.setItem('ff-author-timestamp-v2', String(now));
                } catch (e) { /* ignore */ }
            }
        } catch (err) {
            console.warn('Failed to refresh author image:', err);
            if (cachedBlob) {
                showToast("Failed to refresh. Showing cached data");
            } else {
                showToast("Failed to load author image from online and cache");
            }
        } finally {
            loader.classList.add('hidden');
        }
    } else {
        loader.classList.add('hidden');
    }
}

// --------------------------------------------------------------
//  URL / HISTORY MANAGEMENT
// --------------------------------------------------------------
function getCleanPath() {
    return window.location.pathname;
}

function updateUrlFromStack(method = 'replace') {
    const params = new URLSearchParams();
    for (const id of activeModalStack) {
        if (id === 'itemModal') {
            if (currentItemModalId) {
                params.set('item', currentItemModalId);
            }
        } else if (id === 'settingsModal') {
            params.set('settings', 'true');
        }
    }
    const newUrl = getCleanPath() + (params.toString() ? '?' + params.toString() : '');
    if (method === 'push') {
        history.pushState({}, '', newUrl);
    } else {
        history.replaceState({}, '', newUrl);
    }
}

function syncModalsFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const itemId = params.get('item');
    const settings = params.get('settings');

    const desired = [];
    if (settings !== null) desired.push('settingsModal');
    if (itemId !== null) desired.push('itemModal');

    for (let i = activeModalStack.length - 1; i >= 0; i--) {
        const id = activeModalStack[i];
        if (!desired.includes(id)) {
            const modal = document.getElementById(id);
            if (modal) modal.classList.add('hidden');
            activeModalStack.splice(i, 1);
            if (id === 'itemModal') currentItemModalId = null;
        }
    }

    for (const id of desired) {
        if (!activeModalStack.includes(id)) {
            const modal = document.getElementById(id);
            if (modal) modal.classList.remove('hidden');
            activeModalStack.push(id);

            if (id === 'itemModal') {
                currentItemModalId = itemId;
                const item = itemsById.get(String(itemId));
                if (item) {
                    populateItemModal(item);
                } else {
                    showToast(`Item #${itemId} not found.`);
                    const idx = activeModalStack.indexOf(id);
                    if (idx > -1) {
                        activeModalStack.splice(idx, 1);
                        const m = document.getElementById(id);
                        if (m) m.classList.add('hidden');
                    }
                    currentItemModalId = null;
                    updateUrlFromStack('replace');
                }
            }
        }
    }

    if (activeModalStack.length === 0) {
        document.body.style.overflow = '';
    } else {
        document.body.style.overflow = 'hidden';
    }
}

// --------------------------------------------------------------
//  MODAL SYSTEM
// --------------------------------------------------------------
function openModal(id, data = null) {
    const modal = document.getElementById(id);
    if (!modal) return;

    if (activeModalStack.includes(id)) {
        modal.classList.remove('hidden');
        return;
    }

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    activeModalStack.push(id);

    scheduleTutorialAutoShow();

    if (id === 'itemModal' && data && data.itemId) {
        currentItemModalId = data.itemId;
    }

    if (id === 'itemModal') {
        setTimeout(() => {
            const iconNameEl = document.getElementById('modalIconName');
            if (iconNameEl) adjustIconNameOverflow(iconNameEl);
        }, 50);
    }

    if (id === 'settingsModal') {
        const body = document.querySelector('.settings-body');
        if (body) {
            body.addEventListener('scroll', updateSettingsScrollDown);
            setTimeout(updateSettingsScrollDown, 100);
        }
    }

    updateUrlFromStack('push');
}

function closeModal(id, isPopState = false) {
    if (isPopState) {
        forceHideModal(id);
        return;
    }

    forceHideModal(id);
    updateUrlFromStack('replace');
    if (activeModalStack.length === 0) {
        document.body.style.overflow = '';
        scheduleTutorialAutoShow();
    }
}

function forceHideModal(id) {
    const modal = document.getElementById(id);
    if (modal && !modal.classList.contains('hidden')) {
        if (id === 'reportModal') {
            whatsNewFullData = null;
            whatsNewCurrentPage = 1;
            const footer = document.getElementById('reportFooter');
            if (footer) footer.innerHTML = '';
            const content = document.getElementById('reportContent');
            if (content) {
                content.classList.remove('tutorial-mode', 'whatsnew-mode');
            }
            const perfImg = document.getElementById('perfImage');
            if (perfImg && perfImg.dataset.objectUrl) {
                URL.revokeObjectURL(perfImg.dataset.objectUrl);
                delete perfImg.dataset.objectUrl;
                perfImg.src = '';
                perfImg.style.display = 'none';
            }
            const spinner = document.getElementById('perfSpinner');
            if (spinner) spinner.style.display = 'block';
        }

        if (id === 'settingsModal') {
            const body = document.querySelector('.settings-body');
            if (body) {
                body.removeEventListener('scroll', updateSettingsScrollDown);
            }
        }
        modal.classList.add('hidden');
        const index = activeModalStack.indexOf(id);
        if (index > -1) {
            activeModalStack.splice(index, 1);
        }
        setTimeout(() => resetInternalScrolls(modal), 250);
        if (activeModalStack.length === 0) {
            document.body.style.overflow = '';
        }
        if (id === 'itemModal') {
            const modalImg = document.getElementById('modalImg');
            const modalEl = document.getElementById('itemModal');

            setTimeout(() => {
                if (modalEl && modalEl.classList.contains('hidden')) {
                    if (modalImg && modalImg.dataset.objectUrl) {
                        URL.revokeObjectURL(modalImg.dataset.objectUrl);
                        delete modalImg.dataset.objectUrl;
                    }
                    if (modalImg) {
                        modalImg.removeAttribute('src');
                        modalImg.classList.remove('loaded');
                    }
                }
            }, 300);

            currentItemModalId = null;
        }
    }
}

function resetInternalScrolls(container) {
    const scrollables = container.querySelectorAll('.item-modal-bottom, .modal-icon-name, .settings-body, .report-body, div');
    scrollables.forEach(el => {
        if (el.scrollTop) el.scrollTop = 0;
        if (el.scrollLeft) el.scrollLeft = 0;
    });
}

window.addEventListener('popstate', (e) => {
    if (dlDbMenu.classList.contains('show')) dlDbMenu.classList.remove('show');
    syncModalsFromUrl();
});

document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', e => {
        if (e.target === m) {
            const id = m.id;
            if (activeModalStack.length > 0 && activeModalStack[activeModalStack.length - 1] === id) {
                closeModal(id);
            }
        }
    });
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (dlDbMenu.classList.contains('show')) {
            dlDbMenu.classList.remove('show');
        } else if (activeModalStack.length > 0) {
            const topId = activeModalStack[activeModalStack.length - 1];
            closeModal(topId);
        }
    }
});

// --------------------------------------------------------------
//  ICON NAME OVERFLOW ADJUSTMENT
// --------------------------------------------------------------
function adjustIconNameOverflow(el) {
    if (!el) return;
    requestAnimationFrame(() => {
        const hasOverflow = el.scrollWidth > el.clientWidth;
        if (hasOverflow) {
            el.classList.remove('no-overflow');
            el.classList.add('overflowing');
        } else {
            el.classList.remove('overflowing');
            el.classList.add('no-overflow');
        }
    });
}

// --------------------------------------------------------------
//  ITEM MODAL POPULATION (with reload button and cache-first download)
// --------------------------------------------------------------
let currentShareItemId = null;
let modalImageLoadToken = 0;

async function populateItemModal(item) {
    const imageLoadToken = ++modalImageLoadToken;

    const iconUrl = CONFIG.CDN_BASE_URL + item.itemID + '.webp';
    const modalImg = document.getElementById('modalImg');

    const dlOption = downloadAs.value;
    const parts = dlOption.split('.');
    const pattern = parts[0];
    const ext = parts[1];
    let baseName = pattern === 'icon' ? (item.icon || item.itemID) : item.itemID;
    const dlFileName = `${baseName}.${ext}`;

    currentShareItemId = item.itemID;

    if (modalImg.dataset.objectUrl) {
        URL.revokeObjectURL(modalImg.dataset.objectUrl);
        delete modalImg.dataset.objectUrl;
    }
    modalImg.removeAttribute('src');
    modalImg.classList.remove('loaded', 'is-fallback');
    delete modalImg.dataset.loaded;
    modalImg.dataset.failed = "false";
    modalImg.onload = null;
    modalImg.onerror = null;
    modalImg.dataset.originalUrl = iconUrl;

    const modalWrapper = document.querySelector('.item-modal-left .img-wrapper');
    let modalReloadBtn = document.getElementById('modalReloadBtn');
    if (!modalReloadBtn) {
        modalReloadBtn = document.createElement('button');
        modalReloadBtn.id = 'modalReloadBtn';
        modalReloadBtn.className = 'reload-icon-btn';
        modalReloadBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>`;
        modalReloadBtn.title = 'Reload image';
        modalReloadBtn.style.display = 'none';
        modalWrapper.appendChild(modalReloadBtn);
    }
    modalReloadBtn.classList.remove('visible');
    modalReloadBtn.style.display = 'none';

    modalReloadBtn.onclick = async (e) => {
        e.stopPropagation();
        const url = modalImg.dataset.originalUrl;
        try {
            const cache = await caches.open('ff-icons');
            await cache.delete(url);
        } catch (_) {}
        modalImg.dataset.loaded = 'false';
        modalImg.classList.remove('loaded', 'is-fallback');
        modalReloadBtn.classList.remove('visible');
        modalReloadBtn.style.display = 'none';
        loadImageForElement(modalImg, item, modalReloadBtn, imageLoadToken);
    };

    loadImageForElement(modalImg, item, modalReloadBtn, imageLoadToken);

    modalImg.style.cursor = 'pointer';
    modalImg.title = `Click to copy ID: ${item.itemID}`;
    modalImg.onclick = () => {
        copyItemIDToClipboard(item.itemID);
    };

    document.getElementById('modalName').textContent = item.name || 'Unnamed';

    const iconNameEl = document.getElementById('modalIconName');
    iconNameEl.textContent = item.icon || 'Undefined';
    iconNameEl.title = 'Click to copy icon name';
    iconNameEl.style.cursor = 'pointer';
    iconNameEl.onclick = () => {
        if (item.icon) {
            copyTextToClipboard(item.icon, () => {
                showToast(`📋 Copied: ${item.icon}`);
            });
        }
    };
    adjustIconNameOverflow(iconNameEl);

    // ----- BADGES WITH COPYABLE CLASS (escaped) -----
    let badgesHTML = `<span class="badge badge-id copyable-box">ID: ${escapeHtml(item.itemID)}</span>`;
    if (item.type) {
        let displayType = item.type;
        if (displayType.toLowerCase().endsWith('s')) displayType = displayType.slice(0, -1);
        badgesHTML += `<span class="badge badge-type copyable-box">${escapeHtml(displayType)}</span>`;
    }
    if (item.rarity) {
        const mappedName = rarityMap[item.rarity] || item.rarity;
        badgesHTML += `<span class="badge rare-${escapeHtml(item.rarity)} copyable-box">${escapeHtml(mappedName)}</span>`;
    }
    if (item.tag) {
        const tags = item.tag.split(',').map(t => t.trim());
        tags.forEach(t => {
            if (t) badgesHTML += `<span class="badge badge-tag copyable-box">${escapeHtml(t)}</span>`;
        });
    }

    document.getElementById('modalBadges').innerHTML = badgesHTML;
    document.getElementById('modalDesc').textContent = item.description || 'No description available.';

    // ----- MODAL DOWNLOAD BUTTON with loading state -----
    const dlBtn = document.getElementById('modalDlBtn');
    dlBtn.onclick = () => {
        const currentDlOption = downloadAs.value;
        const parts = currentDlOption.split('.');
        const pattern = parts[0];
        const ext = parts[1];
        let baseName = pattern === 'icon' ? (item.icon || item.itemID) : item.itemID;
        const filename = `${baseName}.${ext}`;
        const displayedSrc = modalImg.src;
        triggerDownload(displayedSrc, filename, dlBtn, null);
    };

    const modalStar = document.getElementById('modalStarBtn');
    if (modalStar) {
        modalStar.dataset.id = String(item.itemID);
        const favorited = isFavorited(item.itemID);
        modalStar.innerHTML = favorited ? '★' : '☆';
        modalStar.classList.toggle('favorited', favorited);
        modalStar.onclick = (e) => {
            e.stopPropagation();
            toggleFavorite(item.itemID);
            document.querySelectorAll(`.star-btn[data-id="${item.itemID}"]`).forEach(btn => {
                const fav = isFavorited(item.itemID);
                btn.innerHTML = fav ? '★' : '☆';
                btn.classList.toggle('favorited', fav);
            });
        };
    }
}

function openItemModalWithData(item) {
    populateItemModal(item);
    openModal('itemModal', { itemId: item.itemID });
}

// ----- CLICK TO COPY BADGE -----
document.getElementById('modalBadges').addEventListener('click', function(e) {
    const badge = e.target.closest('.badge');
    if (!badge) return;
    e.stopPropagation();

    // Prevent spam clicks while "Copied!" is showing
    if (badge.classList.contains('copied')) return;

    let text = badge.textContent.trim();
    if (badge.classList.contains('badge-id')) {
        text = text.replace(/^ID:\s*/, '').trim();
    }

    copyTextToClipboard(text, () => {
        badge.classList.add('copied');
        showToast(`📋 Copied: ${text}`);
        setTimeout(() => {
            badge.classList.remove('copied');
        }, 1500);
    }, () => {
        showToast('Failed to copy');
    });
});

// --------------------------------------------------------------
//  COPY TEXT HELPER – with robust fallback
// --------------------------------------------------------------
function copyTextToClipboard(text, onSuccess, onError) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            if (onSuccess) onSuccess();
        }).catch(() => {
            fallbackCopyText(text, onSuccess, onError);
        });
    } else {
        fallbackCopyText(text, onSuccess, onError);
    }
}

function fallbackCopyText(text, onSuccess, onError) {
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '0';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) {
            if (onSuccess) onSuccess();
        } else {
            if (onError) onError();
        }
    } catch (err) {
        if (onError) onError();
    }
}

function copyItemIDToClipboard(itemID) {
    const text = String(itemID);
    copyTextToClipboard(text, () => {
        const tick = document.getElementById(`tick-${itemID}`);
        if (tick) {
            tick.classList.remove('blue-tick');
            tick.classList.add('show');
            setTimeout(() => tick.classList.remove('show'), 2000);
        }
        showToast(`📋 Copied ID: ${itemID}`);
    }, () => {
        showToast('Failed to copy ID.');
    });
}

// --------------------------------------------------------------
//  HELPER: Fetch image as blob (cache-first, then fallback)
// --------------------------------------------------------------
async function fetchImageAsBlob(imgUrl) {
    try {
        const { blob } = await loadImageWithRetry(imgUrl);
        return blob;
    } catch (err) {
        console.warn('fetchImageAsBlob: failed for', imgUrl, err);
        const fallbackUrl = CONFIG.FALLBACK_IMAGE_URL;
        try {
            const { blob } = await loadImageWithRetry(fallbackUrl);
            return blob;
        } catch {
            const response = await fetch(fallbackUrl);
            if (!response.ok) throw new Error('Failed to load fallback');
            return await response.blob();
        }
    }
}

// --------------------------------------------------------------
//  CONVERT BLOB TO PNG (in memory) using canvas
// --------------------------------------------------------------
async function convertBlobToPng(blob) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width || 256;
            canvas.height = img.naturalHeight || img.height || 256;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((pngBlob) => {
                if (pngBlob) {
                    resolve(pngBlob);
                } else {
                    reject(new Error('Failed to create PNG'));
                }
                URL.revokeObjectURL(url);
            }, 'image/png');
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to decode image for PNG conversion'));
        };
        img.src = url;
    });
}

// --------------------------------------------------------------
//  DOWNLOAD IMAGE – with loading spinner support
// --------------------------------------------------------------
function triggerDownload(primaryUrl, filename, customBtn, cardItemID) {
    let container = null;
    let loader = null;
    let card = null;
    let originalBtnHTML = '';

    // Show loading on button if provided
    if (customBtn) {
        customBtn.disabled = true;
        originalBtnHTML = customBtn.innerHTML;
        customBtn.innerHTML = `<div class="spinner" style="width:18px;height:18px;border:2px solid rgba(255,255,255,0.2);border-top:2px solid #fff;border-radius:50%;animation:spin 0.7s linear infinite;display:inline-block;"></div>`;
    }

    // Show loading on card and disable pointer events
    if (cardItemID) {
        const cardEl = document.querySelector(`.card:has([data-id="${cardItemID}"])`);
        if (cardEl) {
            card = cardEl;
            card.style.pointerEvents = 'none';
            container = card.querySelector('.img-container');
            if (container) {
                loader = container.querySelector('.card-loader');
                if (!loader) {
                    loader = document.createElement('div');
                    loader.className = 'card-loader';
                    const spinner = document.createElement('div');
                    spinner.className = 'spinner';
                    loader.appendChild(spinner);
                    container.appendChild(loader);
                }
                loader.classList.add('show');
            }
        }
    }

    fetchImageAsBlob(primaryUrl)
        .then(blob => {
            const ext = filename.split('.').pop().toLowerCase();
            if (ext === 'png') {
                return convertBlobToPng(blob);
            } else {
                return blob;
            }
        })
        .then(blob => {
            executeBlobDownload(blob, filename);
            // Hide loader and re-enable card immediately
            if (loader) loader.classList.remove('show');
            if (card) card.style.pointerEvents = '';
            if (customBtn) {
                customBtn.innerHTML = originalBtnHTML;
                customBtn.disabled = false;
            }
        })
        .catch(() => {
            alert('Failed to download image.');
            if (loader) loader.classList.remove('show');
            if (card) card.style.pointerEvents = '';
            if (customBtn) {
                customBtn.innerHTML = originalBtnHTML;
                customBtn.disabled = false;
            }
        });
}

function executeBlobDownload(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
    }, 0);
}

// --------------------------------------------------------------
//  COPY IMAGE TO CLIPBOARD – with loading spinner support
// --------------------------------------------------------------
async function copyImageToClipboard(imgUrl, customBtn, cardItemID) {
    let container = null;
    let loader = null;
    let card = null;
    let originalBtnHTML = '';

    // Show loading on button if provided
    if (customBtn) {
        customBtn.disabled = true;
        originalBtnHTML = customBtn.innerHTML;
        customBtn.innerHTML = `<div class="spinner" style="width:18px;height:18px;border:2px solid rgba(255,255,255,0.2);border-top:2px solid #fff;border-radius:50%;animation:spin 0.7s linear infinite;display:inline-block;"></div>`;
    }

    // Show loading on card and disable pointer events
    if (cardItemID) {
        const cardEl = document.querySelector(`.card:has([data-id="${cardItemID}"])`);
        if (cardEl) {
            card = cardEl;
            card.style.pointerEvents = 'none';
            container = card.querySelector('.img-container');
            if (container) {
                loader = container.querySelector('.card-loader');
                if (!loader) {
                    loader = document.createElement('div');
                    loader.className = 'card-loader';
                    const spinner = document.createElement('div');
                    spinner.className = 'spinner';
                    loader.appendChild(spinner);
                    container.appendChild(loader);
                }
                loader.classList.add('show');
            }
        }
    }

    try {
        let blob = await fetchImageAsBlob(imgUrl);
        blob = await convertBlobToPng(blob);
        const item = new ClipboardItem({ "image/png": blob });
        await navigator.clipboard.write([item]);

        // Success: hide loader immediately
        if (loader) loader.classList.remove('show');

        // Show tick on button if provided
        if (customBtn) {
            customBtn.innerHTML = `<svg viewBox="0 0 24 24" style="display:block;width:22px;height:22px;margin:0 auto;filter:drop-shadow(0 0 6px rgba(33,150,243,0.5));"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="none" stroke="#2196F3" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
            // Keep button disabled until tick fades
        }

        // Show tick on card if cardItemID provided
        if (cardItemID) {
            const tick = document.getElementById(`tick-${cardItemID}`);
            if (tick) {
                tick.classList.add('blue-tick');
                tick.classList.add('show');
            }
        }

        // Re-enable UI after tick fades (2s + 300ms)
        const restoreUI = () => {
            if (card) card.style.pointerEvents = '';
            if (customBtn) {
                customBtn.innerHTML = originalBtnHTML;
                customBtn.disabled = false;
            }
        };

        if (cardItemID) {
            // Wait for tick to fade out
            setTimeout(() => {
                const tick = document.getElementById(`tick-${cardItemID}`);
                if (tick) {
                    tick.classList.remove('show');
                    setTimeout(() => {
                        if (tick) tick.classList.remove('blue-tick');
                        restoreUI();
                    }, 300);
                } else {
                    restoreUI();
                }
            }, 2000);
        } else {
            // No card: just wait 2s
            setTimeout(restoreUI, 2000);
        }
    } catch (err) {
        console.error("Failed to copy image", err);
        showToast("Failed to copy image. Your browser might not support it.");
        // Restore UI immediately on error
        if (customBtn) {
            customBtn.innerHTML = originalBtnHTML;
            customBtn.disabled = false;
        }
        if (loader) loader.classList.remove('show');
        if (card) card.style.pointerEvents = '';
    }
}

// ----- MODAL COPY BUTTON -----
document.getElementById('modalCopyImgBtn').addEventListener('click', function() {
    const imgSrc = document.getElementById('modalImg').src;
    copyImageToClipboard(imgSrc, this, null);
});

// ----- MODAL SHARE BUTTON -----
modalShareBtn.addEventListener('click', function() {
    if (!currentShareItemId) {
        showToast("No item selected.");
        return;
    }
    const shareUrl = WEBSITE_URL + '?item=' + currentShareItemId;
    const itemName = document.getElementById('modalName').textContent || 'Free Fire Item';

    const shareData = {
        title: 'Free Fire Item',
        text: `Check out this Free Fire item: ${itemName}`,
        url: shareUrl
    };

    if (navigator.share) {
        navigator.share(shareData).catch((err) => {
            if (err.name !== 'AbortError') {
                showToast("Failed to share.");
            }
        });
    } else {
        navigator.clipboard.writeText(shareUrl).then(() => {
            showToast("Item link copied. Ready to share!");
            const originalHTML = this.innerHTML;
            this.innerHTML =
                `<svg viewBox="0 0 24 24" style="fill: #4CAF50; transform: scale(1.3);"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
            setTimeout(() => { this.innerHTML = originalHTML; }, 2000);
        }).catch(() => {
            showToast("Failed to copy link.");
        });
    }
});

// --------------------------------------------------------------
//  ITEM CLICK HANDLER – with loading support for download/copy
// --------------------------------------------------------------
function handleItemClick(item, imgSrc, cardElement) {
    const iconUrl = imgSrc || CONFIG.CDN_BASE_URL + item.itemID + '.webp';
    const dlOption = downloadAs.value;
    const parts = dlOption.split('.');
    const pattern = parts[0];
    const ext = parts[1];
    let baseName = pattern === 'icon' ? (item.icon || item.itemID) : item.itemID;
    const dlFileName = `${baseName}.${ext}`;

    currentShareItemId = item.itemID;

    if (clickAction.value === 'details') {
        openItemModalWithData(item);
    } else if (clickAction.value === 'download') {
        // Pass card element to show loader
        triggerDownload(iconUrl, dlFileName, null, item.itemID);
    } else if (clickAction.value === 'copyIcon') {
        copyImageToClipboard(iconUrl, null, item.itemID);
    } else {
        copyItemIDToClipboard(item.itemID);
    }
}

// --------------------------------------------------------------
//  HOME / RELOAD BUTTON & HEADER TABS
// --------------------------------------------------------------
function goHome() {
    while (activeModalStack.length > 0) {
        const id = activeModalStack.pop();
        const modal = document.getElementById(id);
        if (modal) modal.classList.add('hidden');
        if (id === 'itemModal') currentItemModalId = null;
    }
    document.body.style.overflow = '';
    const cleanUrl = getCleanPath();
    history.replaceState({}, '', cleanUrl);

    searchInput.value = '';
    tagFilter.value = '';
    typeFilter.value = '';
    rareFilter.value = '';

    searchClear.style.display = 'none';
    searchIcon.style.display = 'flex';

    currentPage = 1;
    applyFilters();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast("🏠 Back to home");

    // Ensure catalog tab is active
    ensureCatalogTabActive();
}

// Ensure the catalog tab stays active
function switchToCatalogView() {
    if (catalogTab) catalogTab.classList.add('active');
    if (profilesTab) profilesTab.classList.remove('active');

    const controls = document.querySelector('.controls-wrapper');
    const gridWrapper = document.getElementById('gridWrapper');
    const paginationContainer = document.getElementById('paginationContainer');
    const profilesView = document.getElementById('profilesView');

    if (controls) controls.style.display = '';
    if (gridWrapper) gridWrapper.style.display = '';
    if (paginationContainer) paginationContainer.style.display = '';
    if (profilesView) profilesView.classList.add('hidden');
}

function switchToProfilesView() {
    if (profilesTab) profilesTab.classList.add('active');
    if (catalogTab) catalogTab.classList.remove('active');

    const controls = document.querySelector('.controls-wrapper');
    const gridWrapper = document.getElementById('gridWrapper');
    const paginationContainer = document.getElementById('paginationContainer');
    const profilesView = document.getElementById('profilesView');

    if (controls) controls.style.display = 'none';
    if (gridWrapper) gridWrapper.style.display = 'none';
    if (paginationContainer) paginationContainer.style.display = 'none';
    if (profilesView) profilesView.classList.remove('hidden');

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Show ready state if no profile has been loaded yet
    const emptyState = document.getElementById('profileEmptyState');
    const cardWrapper = document.getElementById('profileCardWrapper');
    if (!currentLoadedProfileUid && emptyState) {
        if (!cardWrapper || cardWrapper.classList.contains('hidden')) {
            emptyState.classList.remove('hidden');
            emptyState.style.display = 'flex';
        }
    }
}

function ensureCatalogTabActive() {
    switchToCatalogView();
}

// Reload button goes home
reloadBtn.addEventListener('click', goHome);

// Catalog tab – switches to catalog view
if (catalogTab) {
    catalogTab.addEventListener('click', () => {
        switchToCatalogView();
    });
}

// Profiles tab – switch to FF Profiles view
if (profilesTab) {
    profilesTab.addEventListener('click', () => {
        switchToProfilesView();
    });
}

// ================================================================
//  FF PROFILES VIEWER (RAILWAY API INTEGRATION)
// ================================================================
let currentLoadedProfileUid = null;
const profileClientCache = new Map();

function formatDatePretty(dateStr) {
    if (!dateStr) return 'N/A';
    try {
        const d = new Date(dateStr.replace(' ', 'T'));
        if (isNaN(d.getTime())) return dateStr;
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const m = months[d.getMonth()];
        const day = d.getDate();
        const year = d.getFullYear();
        let hours = d.getHours();
        const minutes = d.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        return `${m} ${day}, ${year} at ${hours.toString().padStart(2, '0')}:${minutes} ${ampm}`;
    } catch (_) {
        return dateStr;
    }
}

function calculateAccountAge(createAtStr) {
    if (!createAtStr) return 'N/A';
    try {
        const created = new Date(createAtStr.replace(' ', 'T'));
        const now = new Date();
        if (isNaN(created.getTime())) return 'N/A';

        let years = now.getFullYear() - created.getFullYear();
        let months = now.getMonth() - created.getMonth();
        let days = now.getDate() - created.getDate();

        if (days < 0) {
            months -= 1;
            const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
            days += prevMonth.getDate();
        }
        if (months < 0) {
            years -= 1;
            months += 12;
        }

        const parts = [];
        if (years > 0) parts.push(`${years} year${years > 1 ? 's' : ''}`);
        if (months > 0) parts.push(`${months} month${months > 1 ? 's' : ''}`);
        if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
        return (parts.join(', ') || '0 days') + ' old';
    } catch (_) {
        return 'N/A';
    }
}

function formatLanguage(lang) {
    if (!lang) return 'N/A';
    return lang.replace('Language_', '').toLowerCase().replace(/^\w/, c => c.toUpperCase());
}

function formatRankShow(rk) {
    if (!rk) return 'N/A';
    return rk.replace('RankShow_', '').toLowerCase().replace(/^\w/, c => c.toUpperCase());
}

function formatFreeFireBio(rawBio) {
    if (!rawBio) return '<span style="color:#888;">No bio available.</span>';
    // Remove formatting tags like [b], [c], [i], [u]
    let text = rawBio.replace(/\[\/?(b|c|i|u)\]/gi, '');
    let escaped = escapeHtml(text);
    // Convert hex color codes [RRGGBB] into styled colored spans
    let colored = escaped.replace(/\[([A-Fa-f0-9]{6})\]/g, (match, hex) => {
        return `</span><span style="color: #${hex}; font-weight: 700; text-shadow: 0 0 8px rgba(0,0,0,0.5);">`;
    });
    return `<span>` + colored + `</span>`;
}

function cleanFreeFireBioText(rawBio) {
    if (!rawBio) return '';
    return rawBio
        .replace(/\[\/?(b|c|i|u)\]/gi, '')
        .replace(/\[[A-Fa-f0-9]{6}\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

async function fetchAndRenderProfile(uid) {
    uid = (uid || '').trim();
    if (!uid) {
        showToast("Please enter a player UID");
        return;
    }

    const loadingEl = document.getElementById('profileLoading');
    const errorEl = document.getElementById('profileError');
    const cardWrapper = document.getElementById('profileCardWrapper');
    const emptyState = document.getElementById('profileEmptyState');
    const errorText = document.getElementById('profileErrorText');
    const loadingMsg = document.getElementById('profileLoadingMsg');
    const btnSpinner = document.getElementById('profileBtnSpinner');
    const btnIcon = document.getElementById('profileBtnIcon');
    const searchBtn = document.getElementById('profileSearchBtn');

    // Instant render from client cache to keep the app ultra-fast and responsive
    const now = Date.now();
    const cached = profileClientCache.get(uid);
    if (cached && (now - cached.timestamp < 300000)) {
        currentLoadedProfileUid = uid;
        renderPlayerProfileCard(cached.data, cardWrapper);
        if (emptyState) { emptyState.classList.add('hidden'); emptyState.style.display = 'none'; }
        if (loadingEl) { loadingEl.classList.add('hidden'); loadingEl.style.display = 'none'; }
        if (errorEl) { errorEl.classList.add('hidden'); errorEl.style.display = 'none'; }
        if (cardWrapper) {
            cardWrapper.classList.remove('hidden');
            cardWrapper.style.display = 'block';
            cardWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
    }

    // Button loading state
    if (btnSpinner) btnSpinner.classList.remove('hidden');
    if (btnIcon) btnIcon.classList.add('hidden');
    if (searchBtn) searchBtn.disabled = true;

    // Strict state transitions: only loadingEl is visible
    if (emptyState) {
        emptyState.classList.add('hidden');
        emptyState.style.display = 'none';
    }
    if (loadingMsg) loadingMsg.textContent = `Fetching player statistics, ranks, and clan details for UID ${uid}...`;
    if (loadingEl) {
        loadingEl.classList.remove('hidden');
        loadingEl.style.display = 'flex';
    }
    if (errorEl) {
        errorEl.classList.add('hidden');
        errorEl.style.display = 'none';
    }
    if (cardWrapper) {
        cardWrapper.classList.add('hidden');
        cardWrapper.style.display = 'none';
    }

    try {
        let data = null;
        // 1. Try server proxy (with in-memory cache and 15s timeout)
        try {
            const resp = await fetch(`/api/profile?uid=${encodeURIComponent(uid)}`, {
                signal: AbortSignal.timeout(16000)
            });
            if (resp.ok) {
                data = await resp.json();
            }
        } catch (e) {
            console.warn("Proxy profile fetch error:", e);
        }

        // 2. Retry server proxy if initial attempt failed
        if (!data || !data.basicInfo) {
            try {
                const retryResp = await fetch(`/api/profile?uid=${encodeURIComponent(uid)}`, {
                    signal: AbortSignal.timeout(12000)
                });
                if (retryResp.ok) {
                    data = await retryResp.json();
                }
            } catch (e) {
                console.warn("Retry profile fetch error:", e);
            }
        }

        if (!data || !data.basicInfo) {
            throw new Error(`Profile data for UID "${uid}" could not be retrieved.`);
        }

        // Cache response in client to make repeated checks instant
        profileClientCache.set(uid, { timestamp: Date.now(), data });

        currentLoadedProfileUid = uid;
        renderPlayerProfileCard(data, cardWrapper);

        // Success: show cardWrapper only
        if (loadingEl) {
            loadingEl.classList.add('hidden');
            loadingEl.style.display = 'none';
        }
        if (errorEl) {
            errorEl.classList.add('hidden');
            errorEl.style.display = 'none';
        }
        if (cardWrapper) {
            cardWrapper.classList.remove('hidden');
            cardWrapper.style.display = 'block';
            cardWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    } catch (err) {
        console.error("Profile fetch error:", err);
        // Error: show errorEl only
        if (loadingEl) {
            loadingEl.classList.add('hidden');
            loadingEl.style.display = 'none';
        }
        if (cardWrapper) {
            cardWrapper.classList.add('hidden');
            cardWrapper.style.display = 'none';
        }
        if (errorEl) {
            if (errorText) errorText.textContent = `Player UID "${uid}" not found or Free Fire API server is temporarily busy.`;
            errorEl.classList.remove('hidden');
            errorEl.style.display = 'flex';
        }
    } finally {
        if (btnSpinner) btnSpinner.classList.add('hidden');
        if (btnIcon) btnIcon.classList.remove('hidden');
        if (searchBtn) searchBtn.disabled = false;
    }
}

function renderPlayerProfileCard(data, container) {
    if (!container) return;
    const b = data.basicInfo || {};
    const c = data.clanBasicInfo || {};
    const capt = data.captainBasicInfo || {};
    const p = data.petInfo || {};
    const s = data.socialInfo || {};
    const cr = data.creditScoreInfo || {};
    const prof = data.profileInfo || {};

    // Dynamic player-specific headPic and avatar resolution
    // NEVER fall back to hardcoded 902052025! Each player UID has their own avatar.
    const headPic = b.headPic != null ? b.headPic : (prof.avatarId != null ? prof.avatarId : null);
    const charModelId = prof.avatarId || null;
    const bannerId = b.bannerId || 'N/A';

    const defaultAvatarSvg = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20100%20100'%20width='100'%20height='100'%3E%3Cdefs%3E%3ClinearGradient%20id='g'%20x1='0%25'%20y1='0%25'%20x2='100%25'%20y2='100%25'%3E%3Cstop%20offset='0%25'%20stop-color='%23ff7a00'/%3E%3Cstop%20offset='100%25'%20stop-color='%23ff0055'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect%20width='100'%20height='100'%20rx='18'%20fill='url(%23g)'/%3E%3Ccircle%20cx='50'%20cy='38'%20r='18'%20fill='%23ffffff'%20opacity='0.9'/%3E%3Cpath%20d='M22%2084%20C24%2060%2040%2056%2050%2056%20C60%2056%2076%2060%2078%2084%20Z'%20fill='%23ffffff'%20opacity='0.9'/%3E%3C/svg%3E";

    const avatarUrl = headPic ? (CONFIG.CDN_BASE_URL + headPic + '.webp') : defaultAvatarSvg;
    const bannerUrl = (bannerId && bannerId !== 'N/A') ? (CONFIG.CDN_BASE_URL + bannerId + '.webp') : '';

    const nickname = escapeHtml(b.nickname || 'Unknown Player');
    const level = b.level || 1;
    const accountId = escapeHtml(b.accountId || '');
    const likes = (b.liked != null ? b.liked : 0).toLocaleString();
    const region = escapeHtml(b.region || 'BD');
    const primeLevel = (b.primeInfo && b.primeInfo.primeLevel) || 4;

    const createdFormatted = formatDatePretty(b.createAt);
    const ageFormatted = calculateAccountAge(b.createAt);
    const lastLoginFormatted = formatDatePretty(b.lastLoginAt);
    const signatureHtml = formatFreeFireBio(s.signature);
    const cleanBio = cleanFreeFireBioText(s.signature);

    const exp = (b.exp || 0).toLocaleString();
    const seasonId = b.seasonId || 'N/A';
    const creditScore = cr.creditScore != null ? cr.creditScore : 100;
    const title = b.title || 'N/A';
    const releaseVer = b.releaseVersion || 'OB55';
    const accountType = b.accountType != null ? b.accountType : 1;
    const language = formatLanguage(s.language);
    const rankShow = formatRankShow(s.rankShow);

    const brPoints = (b.rankingPoints || 0).toLocaleString();
    const brMax = b.maxRank || 'N/A';
    const csPoints = (b.csRankingPoints || 0).toLocaleString();
    const csMax = b.csMaxRank || 'N/A';
    const showBr = b.showBrRank ? 'Yes' : 'No';
    const showCs = b.showCsRank ? 'Yes' : 'No';

    const avatarId = b.headPic != null ? b.headPic : (prof.avatarId || 'N/A');
    const bpBadges = b.badgeCnt != null ? b.badgeCnt : 0;
    const bpId = b.badgeId || 'N/A';

    const petId = p.id || 'N/A';
    const petLvl = p.level || 'N/A';
    const petExp = p.exp != null ? p.exp : 'N/A';
    const petSelected = p.isSelected ? 'Yes' : 'No';
    const petSkillId = p.selectedSkillId || 'N/A';
    const petSkinId = p.skinId || 'N/A';

    const clanName = escapeHtml(c.clanName || 'N/A');
    const clanLvl = c.clanLevel || 'N/A';
    const leaderName = escapeHtml(capt.nickname || b.nickname || 'N/A');
    const leaderLvl = capt.level || b.level || 'N/A';
    const leaderRegion = escapeHtml(capt.region || b.region || 'N/A');
    const leaderLogin = formatDatePretty(capt.lastLoginAt || b.lastLoginAt);
    const clanId = escapeHtml(c.clanId || 'N/A');
    const members = `${c.memberNum || 0}/${c.capacity || 50}`;
    const leaderUid = escapeHtml(capt.accountId || c.captainId || b.accountId || 'N/A');
    const leaderLikes = (capt.liked != null ? capt.liked : b.liked || 0).toLocaleString();
    const leaderCreated = formatDatePretty(capt.createAt || b.createAt);

    container.innerHTML = `
        <div class="ff-player-card" id="ffPlayerCard">
            <!-- Heroic Edge-to-Edge Banner Header with Shining Animation -->
            <div class="ff-hero-banner-container" id="ffBannerContainer" title="Click to view full HD banner">
                <img class="ff-hero-banner-img" id="ffPlayerBannerImg" src="/api/banner?uid=${encodeURIComponent(accountId)}" alt="${nickname} Banner" decoding="async" />
                <div class="ff-banner-shine"></div>
                <div class="ff-banner-img-loader" id="ffBannerLoader">
                    <div class="spinner"></div>
                </div>
            </div>

            <!-- Cohesive Meta Bar Below Banner -->
            <div class="ff-hero-meta-bar">
                <button class="ff-uid-chip" id="ffCopyUidBtn" title="Click to copy UID">
                    <span style="color: #c084fc; font-size: 11px; text-transform: uppercase; font-weight: 800; letter-spacing: 0.5px;">UID</span>
                    <span>${accountId}</span>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                </button>
                <div class="ff-hero-stats">
                    <span class="ff-stat-pill"><span style="color: #ff4081;">🤍</span> ${likes} Likes</span>
                    <span class="ff-stat-pill"><span style="color: #00e5ff;">🌐</span> ${region}</span>
                    <span class="ff-stat-pill prime"><span style="color: #ffb300;">★</span> Prime ${primeLevel}</span>
                </div>
            </div>

            <!-- Main Profile Content Body with standard padding -->
            <div class="ff-card-body">
                <!-- Account Timestamps -->
            <div class="ff-timestamps">
                <div class="ff-timestamp-item">
                    <svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg>
                    <span>Account created on ${createdFormatted}</span>
                </div>
                <div class="ff-timestamp-item">
                    <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
                    <span>${ageFormatted}</span>
                </div>
                <div class="ff-timestamp-item">
                    <svg viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.2 14.2L11 13V7h1.5v5.2l4.5 2.7-.8 1.3z"/></svg>
                    <span>Last login ${lastLoginFormatted}</span>
                </div>
            </div>

            <!-- BIO Section -->
            <div class="ff-bio-card">
                <div class="ff-section-title">✏️ BIO</div>
                <div class="ff-bio-box">
                    <div style="padding-right: 36px;">${signatureHtml}</div>
                    <button class="ff-bio-copy-btn" id="ffCopyBioBtn" title="Copy BIO">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                    </button>
                </div>
            </div>

            <!-- Middle 2x2 Grid -->
            <div class="ff-info-grid">
                <!-- ACCOUNT INFO -->
                <div class="ff-panel">
                    <div class="ff-section-title">ACCOUNT INFO</div>
                    <div class="ff-row"><span class="ff-label">EXP</span><span class="ff-val">${exp}</span></div>
                    <div class="ff-row"><span class="ff-label">Season ID</span><span class="ff-val">${seasonId}</span></div>
                    <div class="ff-row"><span class="ff-label">Credit Score</span><span class="ff-val">${creditScore}</span></div>
                    <div class="ff-row"><span class="ff-label">Title</span><span class="ff-val">${title}</span></div>
                    <div class="ff-row"><span class="ff-label">Release Version</span><span class="ff-val">${releaseVer}</span></div>
                    <div class="ff-row"><span class="ff-label">Account Type</span><span class="ff-val">${accountType}</span></div>
                    <div class="ff-row"><span class="ff-label">Gender</span><span class="ff-val">N/A</span></div>
                    <div class="ff-row"><span class="ff-label">Language</span><span class="ff-val">${language}</span></div>
                    <div class="ff-row"><span class="ff-label">Mode Prefer</span><span class="ff-val">N/A</span></div>
                    <div class="ff-row"><span class="ff-label">Time Active</span><span class="ff-val">N/A</span></div>
                    <div class="ff-row"><span class="ff-label">Rank Show</span><span class="ff-val">${rankShow}</span></div>
                </div>

                <!-- RANK INFO -->
                <div class="ff-panel">
                    <div class="ff-section-title">RANK INFO</div>
                    <div class="ff-row"><span class="ff-label">BR Rank Points</span><span class="ff-val">${brPoints}</span></div>
                    <div class="ff-row"><span class="ff-label">BR Max Rank</span><span class="ff-val">${brMax}</span></div>
                    <div class="ff-row"><span class="ff-label">CS Rank Points</span><span class="ff-val">${csPoints}</span></div>
                    <div class="ff-row"><span class="ff-label">CS Max Rank</span><span class="ff-val">${csMax}</span></div>
                    <div class="ff-row"><span class="ff-label">Show BR Rank</span><span class="ff-val">${showBr}</span></div>
                    <div class="ff-row"><span class="ff-label">Show CS Rank</span><span class="ff-val">${showCs}</span></div>
                </div>

                <!-- EQUIPPED ITEMS -->
                <div class="ff-panel">
                    <div class="ff-section-title">EQUIPPED ITEMS</div>
                    <div class="ff-row"><span class="ff-label">Avatar ID</span><span class="ff-val">${avatarId}</span></div>
                    ${charModelId && charModelId != avatarId ? `<div class="ff-row"><span class="ff-label">Character ID</span><span class="ff-val">${charModelId}</span></div>` : ''}
                    <div class="ff-row"><span class="ff-label">Banner ID</span><span class="ff-val">${bannerId}</span></div>
                    <div class="ff-row"><span class="ff-label">BP Badges</span><span class="ff-val">${bpBadges}</span></div>
                    <div class="ff-row"><span class="ff-label">BP ID</span><span class="ff-val">${bpId}</span></div>
                </div>

                <!-- PET DETAILS -->
                <div class="ff-panel">
                    <div class="ff-section-title">PET DETAILS</div>
                    <div class="ff-row"><span class="ff-label">Pet ID</span><span class="ff-val">${petId}</span></div>
                    <div class="ff-row"><span class="ff-label">Pet Level</span><span class="ff-val">${petLvl}</span></div>
                    <div class="ff-row"><span class="ff-label">Pet EXP</span><span class="ff-val">${petExp}</span></div>
                    <div class="ff-row"><span class="ff-label">Pet Selected</span><span class="ff-val">${petSelected}</span></div>
                    <div class="ff-row"><span class="ff-label">Pet Skill ID</span><span class="ff-val">${petSkillId}</span></div>
                    <div class="ff-row"><span class="ff-label">Pet Skin ID</span><span class="ff-val">${petSkinId}</span></div>
                </div>
            </div>

            <!-- GUILD INFO -->
            <div class="ff-panel">
                <div class="ff-section-title">GUILD INFO</div>
                <div class="ff-guild-columns">
                    <div>
                        <div class="ff-row"><span class="ff-label">Guild Name</span><span class="ff-val">${clanName}</span></div>
                        <div class="ff-row"><span class="ff-label">Guild Level</span><span class="ff-val">${clanLvl}</span></div>
                        <div class="ff-row"><span class="ff-label">Leader Name</span><span class="ff-val">${leaderName}</span></div>
                        <div class="ff-row"><span class="ff-label">Leader Level</span><span class="ff-val">${leaderLvl}</span></div>
                        <div class="ff-row"><span class="ff-label">Leader Region</span><span class="ff-val">${leaderRegion}</span></div>
                        <div class="ff-row"><span class="ff-label">Leader Last Login</span><span class="ff-val">${leaderLogin}</span></div>
                    </div>
                    <div>
                        <div class="ff-row"><span class="ff-label">Guild ID</span><span class="ff-val">${clanId}</span></div>
                        <div class="ff-row"><span class="ff-label">Members</span><span class="ff-val">${members}</span></div>
                        <div class="ff-row"><span class="ff-label">Leader UID</span><span class="ff-val">${leaderUid}</span></div>
                        <div class="ff-row"><span class="ff-label">Leader Likes</span><span class="ff-val">${leaderLikes}</span></div>
                        <div class="ff-row"><span class="ff-label">Leader Created</span><span class="ff-val">${leaderCreated}</span></div>
                    </div>
                </div>
            </div>

            <!-- Author Official Watermark Badge -->
            <div class="ff-card-watermark">
                <img class="ff-watermark-img" id="ffWatermarkImg" src="icons/watermark.jpg" alt="Watermark" onerror="this.onerror=null;this.src='icons/watermark.jpg';" crossorigin="anonymous" />
            </div>

            <!-- Action Buttons -->
            <div class="ff-card-actions">
                <button class="ff-btn-download" id="ffDownloadCardJpgBtn" title="Download Full Account Card as JPG">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                    Download JPG
                </button>
                <button class="ff-btn-check" id="ffCheckAnotherBtn">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
                    Check Another
                </button>
            </div>
            </div> <!-- .ff-card-body -->
        </div> <!-- .ff-player-card -->
    `;

    // Hook up player banner interactions
    const playerBannerImg = document.getElementById('ffPlayerBannerImg');
    const bannerLoader = document.getElementById('ffBannerLoader');
    const bannerContainer = document.getElementById('ffBannerContainer');

    if (playerBannerImg) {
        const hideLoader = () => {
            if (bannerLoader) bannerLoader.classList.add('hidden');
        };
        if (playerBannerImg.complete && playerBannerImg.naturalWidth > 0) {
            hideLoader();
        } else {
            playerBannerImg.addEventListener('load', hideLoader, { once: true });
        }
        playerBannerImg.addEventListener('error', function() {
            if (!this.dataset.triedFallback) {
                this.dataset.triedFallback = '1';
                this.src = 'icons/profile-banner.jpg';
            } else {
                hideLoader();
            }
        });
    }

    if (bannerContainer) {
        bannerContainer.addEventListener('click', () => {
            const bannerSrc = playerBannerImg ? playerBannerImg.src : `/api/banner?uid=${encodeURIComponent(accountId)}`;
            openBannerLightbox(bannerSrc, nickname, accountId);
        });
    }

    document.getElementById('ffCopyUidBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        copyTextToClipboard(String(b.accountId || ''), () => showToast(`📋 UID Copied: ${b.accountId}`));
    });

    document.getElementById('ffCopyBioBtn')?.addEventListener('click', () => {
        copyTextToClipboard(cleanBio || String(s.signature || ''), () => showToast("📋 Bio Copied!"));
    });

    document.getElementById('ffDownloadCardJpgBtn')?.addEventListener('click', async () => {
        await downloadEntireCardAsJpg(nickname, accountId);
    });

    document.getElementById('ffCheckAnotherBtn')?.addEventListener('click', () => {
        const input = document.getElementById('profileUidInput');
        if (input) {
            input.focus();
            input.select();
            input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });
}

// Function to capture and download the ENTIRE player card as a high-res JPG image
async function downloadEntireCardAsJpg(nickname, accountId) {
    const card = document.getElementById('ffPlayerCard');
    if (!card) return;

    const dlBtn = document.getElementById('ffDownloadCardJpgBtn');
    const actionsEl = card.querySelector('.ff-card-actions');
    const originalBtnText = dlBtn ? dlBtn.innerHTML : '';

    if (dlBtn) {
        dlBtn.disabled = true;
        dlBtn.innerHTML = `
            <span class="spinner" style="width:16px;height:16px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;display:inline-block;vertical-align:middle;margin-right:6px;animation:spin 0.7s linear infinite;"></span>
            Generating JPG...
        `;
    }
    showToast('⏳ Generating Full Account Card JPG...');

    // Temporarily hide action buttons during capture
    if (actionsEl) actionsEl.style.display = 'none';

    try {
        if (typeof html2canvas === 'undefined') {
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'html2canvas.min.js';
                s.onload = resolve;
                s.onerror = () => {
                    reject(new Error("Failed to load html2canvas library"));
                };
                document.head.appendChild(s);
            });
        }

        const canvas = await html2canvas(card, {
            scale: 3, // 3x Ultra HD resolution for razor-sharp text and graphics
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#121215',
            logging: false,
            imageTimeout: 20000,
            windowWidth: 1200,
            onclone: (clonedDoc) => {
                const clonedCard = clonedDoc.getElementById('ffPlayerCard');
                if (clonedCard) {
                    clonedCard.classList.add('ff-export-mode');
                    const clonedActions = clonedCard.querySelector('.ff-card-actions');
                    if (clonedActions) clonedActions.style.display = 'none';
                }
            }
        });

        canvas.toBlob((blob) => {
            if (!blob) {
                showToast('❌ Failed to generate JPG');
                return;
            }
            const cleanName = (nickname || 'FreeFire').replace(/[^a-zA-Z0-9_\-\u0980-\u09FF]/g, '_');
            const filename = `${cleanName}_Profile_${accountId || 'account'}.jpg`;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 3000);
            showToast('✅ Full Account Card JPG Downloaded!');
        }, 'image/jpeg', 0.98);
    } catch (err) {
        console.error('Failed to capture card as JPG:', err);
        showToast('❌ Could not generate card JPG');
    } finally {
        if (actionsEl) actionsEl.style.display = 'flex';
        if (dlBtn) {
            dlBtn.disabled = false;
            dlBtn.innerHTML = originalBtnText;
        }
    }
}

// Function to convert and download banner image as JPG
async function downloadBannerAsJpg(imageUrl, filename) {
    showToast('⏳ Downloading Banner JPG...');
    const targetFilename = filename.endsWith('.jpg') ? filename : `${filename}.jpg`;
    
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error('Network response not ok: ' + response.status);
        const blob = await response.blob();
        
        let imgBitmap = null;
        if (typeof createImageBitmap === 'function') {
            try {
                imgBitmap = await createImageBitmap(blob);
            } catch (_) {}
        }

        const canvas = document.createElement('canvas');
        if (imgBitmap) {
            canvas.width = imgBitmap.width;
            canvas.height = imgBitmap.height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#0d0d0f';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(imgBitmap, 0, 0);
        } else {
            await new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    canvas.width = img.naturalWidth || 2450;
                    canvas.height = img.naturalHeight || 600;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#0d0d0f';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    resolve();
                };
                img.onerror = reject;
                img.src = URL.createObjectURL(blob);
            });
        }

        canvas.toBlob((jpgBlob) => {
            if (!jpgBlob) {
                showToast('❌ Could not convert to JPG');
                return;
            }
            const blobUrl = URL.createObjectURL(jpgBlob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = targetFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
            showToast('✅ Banner JPG Downloaded!');
        }, 'image/jpeg', 0.95);
    } catch (err) {
        console.warn('Canvas JPG conversion failed, falling back to direct download:', err);
        const a = document.createElement('a');
        a.href = imageUrl;
        a.download = targetFilename;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('✅ Banner Downloaded!');
    }
}

// Banner HD Lightbox Modal Helper
function openBannerLightbox(imageUrl, title, uid) {
    let modal = document.getElementById('ffBannerModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ffBannerModal';
        modal.className = 'ff-lightbox-modal';
        modal.innerHTML = `
            <div class="ff-lightbox-content">
                <div class="ff-lightbox-header">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <span id="ffLightboxTitle">Player Banner (HD 2450x600)</span>
                        <button class="ff-btn-dl-jpg" id="ffLightboxDlJpgBtn" style="padding: 4px 12px; font-size: 12px;">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                            <span>Download JPG</span>
                        </button>
                    </div>
                    <button class="ff-lightbox-close" id="ffLightboxCloseBtn">&times;</button>
                </div>
                <div style="width: 100%; aspect-ratio: 2450 / 600; background: #0d0d0f; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                    <img class="ff-lightbox-img" id="ffLightboxImg" src="" alt="Full Banner" style="width:100%; height:100%; object-fit:contain; display:block;" />
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.id === 'ffLightboxCloseBtn' || e.target.closest('#ffLightboxCloseBtn')) {
                modal.classList.remove('active');
            }
        });
    }
    const imgEl = document.getElementById('ffLightboxImg');
    const titleEl = document.getElementById('ffLightboxTitle');
    const dlBtn = document.getElementById('ffLightboxDlJpgBtn');
    if (imgEl) imgEl.src = imageUrl;
    if (titleEl && title) titleEl.textContent = `${title} • Official Banner`;
    if (dlBtn) {
        dlBtn.onclick = (e) => {
            e.stopPropagation();
            const cleanName = (title || 'FreeFire').replace(/[^a-zA-Z0-9_\-\u0980-\u09FF]/g, '_');
            downloadBannerAsJpg(imageUrl, `${cleanName}_Banner_${uid || 'ff'}.jpg`);
        };
    }
    modal.classList.add('active');
}

// Global profile search button hooks
const profileUidInput = document.getElementById('profileUidInput');
const profileClearBtn = document.getElementById('profileInputClearBtn');

function updateProfileClearBtn() {
    if (!profileClearBtn || !profileUidInput) return;
    profileClearBtn.style.display = profileUidInput.value.trim() ? 'inline-flex' : 'none';
}

if (profileUidInput) {
    profileUidInput.addEventListener('input', updateProfileClearBtn);
    updateProfileClearBtn();
}

if (profileClearBtn) {
    profileClearBtn.addEventListener('click', () => {
        if (profileUidInput) {
            profileUidInput.value = '';
            profileUidInput.focus();
            updateProfileClearBtn();
        }
    });
}

document.getElementById('profileSearchBtn')?.addEventListener('click', () => {
    if (profileUidInput) fetchAndRenderProfile(profileUidInput.value);
});

profileUidInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        fetchAndRenderProfile(profileUidInput.value);
    }
});

document.getElementById('profileRetryBtn')?.addEventListener('click', () => {
    if (profileUidInput) fetchAndRenderProfile(profileUidInput.value);
});

// On page load, ensure catalog tab is active
document.addEventListener('DOMContentLoaded', () => {
    ensureCatalogTabActive();
});

// --------------------------------------------------------------
//  SETTINGS BUTTON
// --------------------------------------------------------------
document.getElementById('openSettings').addEventListener('click', () => {
    if (activeModalStack.includes('settingsModal')) {
        const modal = document.getElementById('settingsModal');
        if (modal) modal.classList.remove('hidden');
        return;
    }
    openModal('settingsModal');
});

// --------------------------------------------------------------
//  VIEW CHANGELOGS BUTTON
// --------------------------------------------------------------
if (viewChangelogsBtn) {
    viewChangelogsBtn.addEventListener('click', () => {
        showWhatsNew();
    });
}

// --------------------------------------------------------------
//  RESYNC BUTTON
// --------------------------------------------------------------
const resyncBtn = document.getElementById('resyncBtn');
if (resyncBtn) {
    resyncBtn.addEventListener('click', () => {
        initDatabase(true);
    });
}

// --------------------------------------------------------------
//  UPDATE WEBAPP BUTTON
// --------------------------------------------------------------
document.getElementById('updateWebAppBtn').addEventListener('click', async () => {
    const btn = document.getElementById('updateWebAppBtn');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = 'Checking...';
    btn.disabled = true;

    try {
        if (!swRegistration) {
            try {
                await registerServiceWorker();
                if (!swRegistration) {
                    showToast('Service worker still not registered. Check console.');
                    return;
                }
            } catch (err) {
                showToast('Service worker registration failed. Check console.');
                return;
            }
        }

        const res = await fetch('sw.js?nocache=' + Date.now());
        if (!res.ok) throw new Error('Network error');
        const text = await res.text();

        let newVersion = null;
        const patterns = [
            /CACHE_NAME\s*=\s*['"][^'"]*-(v[\d\.]+)['"]/,
            /version\s*[:=]\s*['"](v[\d\.]+)['"]/,
            /CACHE_NAME\s*=\s*['"]([^'"]*)['"]/
        ];
        for (const pat of patterns) {
            const match = text.match(pat);
            if (match) {
                newVersion = match[1] || match[0];
                break;
            }
        }

        if (!newVersion) {
            showToast('Could not detect version in sw.js');
            return;
        }

        if (newVersion === WEBAPP_VERSION) {
            showToast('No WebApp update found (same version)');
            return;
        }

        localStorage.setItem('new_sw_version', newVersion);

        sessionStorage.setItem('webapp_updated', 'true');
        sessionStorage.setItem('clear_url_on_load', 'true');
        await swRegistration.update();
        showToast(`Updating to ${newVersion}...`);

    } catch (err) {
        console.error(err);
        showToast('WebApp update failed. Check console.');
    } finally {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
    }
});

// --------------------------------------------------------------
//  DOWNLOAD MENU LOGIC
// --------------------------------------------------------------
const dlDbBtn = document.getElementById('dlDbBtn');
const dlDbMenu = document.getElementById('dlDbMenu');

if (dlDbBtn && dlDbMenu) {
    dlDbBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dlDbMenu.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
        if (!dlDbBtn.contains(e.target) && !dlDbMenu.contains(e.target)) {
            dlDbMenu.classList.remove('show');
        }
    });
}

function triggerLocalDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (dlDbMenu) dlDbMenu.classList.remove('show');
}

const dlJsonBtn = document.getElementById('dlJson');
if (dlJsonBtn) {
    dlJsonBtn.addEventListener('click', () => {
        if (!allItems.length) {
            showToast("No data to export");
            return;
        }
        const meta = metadataObj || { updated_on: "Unknown" };
        const jsonData = [meta, ...allItems];
        triggerLocalDownload(
            new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' }),
            'ff-catalog.json'
        );
    });
}

const dlMsgpackBtn = document.getElementById('dlMsgpack');
if (dlMsgpackBtn) {
    dlMsgpackBtn.addEventListener('click', async () => {
        if (!allItems.length) return;
        const encoded = MessagePack.encode(allItems);
        triggerLocalDownload(
            new Blob([encoded], { type: 'application/octet-stream' }),
            'ff-catalog.msgpack'
        );
    });
}

// --------------------------------------------------------------
//  REPORT COPY LOGIC
// --------------------------------------------------------------
document.getElementById('reportContent').addEventListener('click', (e) => {
    const box = e.target.closest('.copyable-box');
    if (!box) return;

    // Prevent spam clicks while "Copied!" is showing
    if (box.classList.contains('copied')) return;

    const textToCopy = box.innerText.replace('Copied!', '').trim();
    navigator.clipboard.writeText(textToCopy).then(() => {
        box.classList.add('copied');
        setTimeout(() => box.classList.remove('copied'), 2000);
    }).catch(err => console.error('Failed to copy', err));
});

// --------------------------------------------------------------
//  SUMMARIZE DATABASE  (UPDATED with footer close button)
// --------------------------------------------------------------
const summarizeBtn = document.getElementById('summarizeBtn');
if (summarizeBtn) {
    summarizeBtn.addEventListener('click', () => {
    if (!allItems.length) return;

    let reportHTML = `<h3 class="report-title">Overview</h3>`;
    reportHTML += `<p><strong>Updated on:</strong> ${dbUpdatedOnText}</p>`;
    reportHTML += `<p><strong>Total Items Found:</strong> ${allItems.length}</p>`;

    const idCounts = {};
    allItems.forEach(item => {
        const id = String(item.itemID);
        idCounts[id] = (idCounts[id] || 0) + 1;
    });
    const duplicates = Object.keys(idCounts).filter(id => idCounts[id] > 1);

    reportHTML += `<h3 class="report-title">Duplicated Items</h3>`;
    if (duplicates.length === 0) {
        reportHTML += `<p>No duplicated items found.</p>`;
    } else {
        reportHTML += `<p>Found ${duplicates.length} duplicated item IDs:</p><ul>`;
        duplicates.forEach(id => {
            reportHTML += `<li class="copyable-box">${id} (appears ${idCounts[id]} times)</li>`;
        });
        reportHTML += `</ul>`;
    }

    const extraKeys = new Set();
    allItems.forEach(item => {
        Object.keys(item).forEach(k => {
            if (!['icon', 'itemID', 'name', 'description'].includes(k)) {
                extraKeys.add(k);
            }
        });
    });
    reportHTML += `<h3 class="report-title">Extra tags</h3>`;
    if (extraKeys.size === 0) {
        reportHTML += `<p>No extra tags found.</p>`;
    } else {
        reportHTML += `<p>These tags were found except the primary (name, itemID, icon, description) tags:</p><ul>`;
        extraKeys.forEach(tag => {
            reportHTML += `<li class="copyable-box">${tag}</li>`;
        });
        reportHTML += `</ul>`;
    }

    let typeCounts = {};
    allItems.forEach(item => {
        const t = item.type || 'Undefined';
        typeCounts[t] = (typeCounts[t] || 0) + 1;
    });

    reportHTML += `<h3 class="report-title">Count by type</h3><div class="summary-section">`;
    Object.keys(typeCounts).sort().forEach(k => {
        reportHTML += `<div class="summary-row copyable-box"><span>${k}</span> <span>${typeCounts[k]}</span></div>`;
    });
    reportHTML += `</div>`;

    let rareCounts = {};
    allItems.forEach(item => {
        const r = item.rarity || 'Undefined';
        rareCounts[r] = (rareCounts[r] || 0) + 1;
    });

    reportHTML += `<h3 class="report-title">Count by rarity</h3><div class="summary-section">`;
    Object.keys(rareCounts).sort().forEach(k => {
        const mappedName = rarityMap[k] || k;
        reportHTML += `<div class="summary-row copyable-box"><span>${mappedName}</span> <span>${rareCounts[k]}</span></div>`;
    });
    reportHTML += `</div>`;

    document.getElementById('reportTitle').textContent = "Database Info";
    document.getElementById('reportContent').innerHTML = reportHTML;
    document.getElementById('reportContent').classList.remove('whatsnew-mode', 'tutorial-mode');

    document.getElementById('reportFooter').innerHTML = `<button class="whatsnew-close-btn" onclick="closeModal('reportModal')" style="background: var(--glow); border: none; color: #fff; padding: 6px 18px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; transition: all 0.2s ease; box-shadow: 0 4px 12px rgba(168, 66, 255, 0.4);">CLOSE</button>`;

    const modal = document.getElementById('reportModal');
    if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        if (!activeModalStack.includes('reportModal')) {
            activeModalStack.push('reportModal');
        }
    }
});
}

// --------------------------------------------------------------
//  MISSING ICONS CACHE (persistent in localStorage)
// --------------------------------------------------------------
const MISSING_ICONS_CACHE_KEY = 'ff_missing_icons_cache';

function saveMissingIconsCache(data) {
    try {
        const cacheData = {
            timestamp: Date.now(),
            data: data
        };
        localStorage.setItem(MISSING_ICONS_CACHE_KEY, JSON.stringify(cacheData));
    } catch (e) {
        console.warn('Failed to save missing icons cache', e);
    }
}

function loadMissingIconsCache() {
    try {
        const raw = localStorage.getItem(MISSING_ICONS_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed.timestamp && (Date.now() - parsed.timestamp) < ONE_DAY_MS) {
            return parsed.data;
        }
        return null;
    } catch (e) {
        return null;
    }
}

// --------------------------------------------------------------
//  FIND MISSING FILTERS & ICONS  (UPDATED with caching and footer close button)
// --------------------------------------------------------------
const findFiltersBtn = document.getElementById('findFiltersBtn');
if (findFiltersBtn) {
    findFiltersBtn.addEventListener('click', async () => {
    if (!allItems.length) return;

    loadingText.textContent = 'Checking missing icons...';
    loadingOverlay.classList.add('active');

    try {
        const ignoredKeys = ['icon', 'itemID', 'name', 'description', 'rarity'];
        let allKeys = new Set();
        let dbTags = new Set();
        let dbTypes = new Set();
        let dbRares = new Set();

        allItems.forEach(item => {
            Object.keys(item).forEach(k => allKeys.add(k));
            if (item.tag) dbTags.add(item.tag);
            if (item.type) dbTypes.add(item.type);
            if (item.rarity) dbRares.add(item.rarity);
        });

        const htmlTags = Array.from(document.querySelectorAll('#tagFilter option')).map(o => o.value.toLowerCase()).filter(v => v);
        const htmlTypes = Array.from(document.querySelectorAll('#typeFilter option:not([disabled])')).map(o => o.value.toLowerCase()).filter(v => v);
        const htmlRares = Array.from(document.querySelectorAll('#rareFilter option:not([disabled])')).map(o => o.value.toLowerCase()).filter(v => v);

        const missingTags = Array.from(dbTags).filter(t => !htmlTags.includes(t.toLowerCase()));
        const missingTypes = Array.from(dbTypes).filter(t => !htmlTypes.includes(t.toLowerCase()));
        const missingRares = Array.from(dbRares).filter(r => !htmlRares.includes(r.toLowerCase()));

        let missingIconIds = [];
        let iconCheckError = null;
        let cacheData = null;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            const res = await fetch(CONFIG.GITHUB_API_TREE_URL, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!res.ok) {
                if (res.status === 403) throw new Error("GitHub API rate limit exceeded. Try again later or use VPN.");
                if (res.status === 404) throw new Error("Repository or branch not found");
                throw new Error(`HTTP Error ${res.status}`);
            }

            const data = await res.json();
            let repoImages = new Set();

            if (data.tree && Array.isArray(data.tree)) {
                data.tree.forEach(file => {
                    if (file.path.startsWith('Item-webp/') && file.path.endsWith('.webp')) {
                        const filename = file.path.replace('Item-webp/', '').replace('.webp', '');
                        repoImages.add(filename);
                    }
                });

                allItems.forEach(item => {
                    if (!repoImages.has(String(item.itemID))) {
                        missingIconIds.push(item.itemID);
                    }
                });

                const blackWhiteMissing = [];
                const otherMissing = [];
                missingIconIds.forEach(id => {
                    const item = itemsById.get(String(id));
                    if (item && item.icon === 'UI_Icon_BlackWhite_01') {
                        blackWhiteMissing.push(id);
                    } else {
                        otherMissing.push(id);
                    }
                });
                cacheData = { missingIconIds, blackWhiteMissing, otherMissing };
                saveMissingIconsCache(cacheData);
            } else {
                throw new Error("Invalid API response format");
            }
        } catch (e) {
            iconCheckError = e.name === 'AbortError' ? "Request timed out" : e.message;
            cacheData = loadMissingIconsCache();
        }

        let reportHTML = "";

        if (missingTags.length === 0 && missingTypes.length === 0 && missingRares.length === 0) {
            reportHTML +=
                "<h3 class='report-title'>Missing Filters</h3><p>No missing filters found. HTML is up to date with database.</p>";
        } else {
            reportHTML += "<h3 class='report-title'>Missing Filters in html</h3>";
            if (missingTags.length > 0) reportHTML +=
                `<h4>Tag filters:</h4><ul><li class="copyable-box">${missingTags.join('</li><li class="copyable-box">')}</li></ul>`;
            if (missingTypes.length > 0) reportHTML +=
                `<h4>Type filters:</h4><ul><li class="copyable-box">${missingTypes.join('</li><li class="copyable-box">')}</li></ul>`;
            if (missingRares.length > 0) reportHTML +=
                `<h4>Rarity filters:</h4><ul><li class="copyable-box">${missingRares.join('</li><li class="copyable-box">')}</li></ul>`;
        }

        reportHTML += "<h3 class='report-title'>Missing Icons in Repo</h3>";
        if (iconCheckError) {
            reportHTML += `<p style="color: #ff4c4c;">Error checking icons: ${iconCheckError}</p>`;
            if (cacheData) {
                reportHTML += `<p><strong>Showing cached report:</strong></p>`;
                const { blackWhiteMissing, otherMissing } = cacheData;
                if (blackWhiteMissing.length === 0 && otherMissing.length === 0) {
                    reportHTML += "<p>All items in the database have their corresponding webp icons on the repository (cached).</p>";
                } else {
                    if (blackWhiteMissing.length > 0) {
                        reportHTML += `<p>Found <strong>${blackWhiteMissing.length}</strong> missing icons with 'UI_Icon_BlackWhite_01' icon (cached):</p><ul>`;
                        blackWhiteMissing.forEach(id => {
                            reportHTML += `<li class="copyable-box">${id}</li>`;
                        });
                        reportHTML += `</ul>`;
                    }
                    if (otherMissing.length > 0) {
                        reportHTML += `<p><strong>${otherMissing.length}</strong> other missing icons (cached):</p>`;
                        reportHTML += `<div class="missing-icons-grid">`;
                        reportHTML += `<div class="grid-header">Item ID</div><div class="grid-header">Icon Name</div>`;
                        otherMissing.forEach(id => {
                            const item = itemsById.get(String(id));
                            const iconName = item ? item.icon : 'N/A';
                            reportHTML += `<div class="grid-row">`;
                            reportHTML += `<div class="id-cell"><span class="copyable-box">${id}</span></div>`;
                            reportHTML += `<div class="name-cell"><span class="copyable-box">${iconName}</span></div>`;
                            reportHTML += `</div>`;
                        });
                        reportHTML += `</div>`;
                    }
                }
            } else {
                reportHTML += `<p>No cached report found to show</p>`;
            }
        } else if (missingIconIds.length === 0) {
            reportHTML += "<p>All items in the database have their corresponding webp icons on the repository.</p>";
        } else {
            const { blackWhiteMissing, otherMissing } = cacheData || { blackWhiteMissing: [], otherMissing: [] };
            if (blackWhiteMissing.length > 0) {
                reportHTML += `<p>Found <strong>${blackWhiteMissing.length}</strong> missing icons with 'UI_Icon_BlackWhite_01' icon:</p><ul>`;
                blackWhiteMissing.forEach(id => {
                    reportHTML += `<li class="copyable-box">${id}</li>`;
                });
                reportHTML += `</ul>`;
            }
            if (otherMissing.length > 0) {
                reportHTML += `<p><strong>${otherMissing.length}</strong> other missing icons:</p>`;
                reportHTML += `<div class="missing-icons-grid">`;
                reportHTML += `<div class="grid-header">Item ID</div><div class="grid-header">Icon Name</div>`;
                otherMissing.forEach(id => {
                    const item = itemsById.get(String(id));
                    const iconName = item ? item.icon : 'N/A';
                    reportHTML += `<div class="grid-row">`;
                    reportHTML += `<div class="id-cell"><span class="copyable-box">${id}</span></div>`;
                    reportHTML += `<div class="name-cell"><span class="copyable-box">${iconName}</span></div>`;
                    reportHTML += `</div>`;
                });
                reportHTML += `</div>`;
            }
        }

        document.getElementById('reportTitle').textContent = "Diagnostic Report";
        document.getElementById('reportContent').innerHTML = reportHTML;
        document.getElementById('reportContent').classList.remove('whatsnew-mode', 'tutorial-mode');

        document.getElementById('reportFooter').innerHTML = `<button class="whatsnew-close-btn" onclick="closeModal('reportModal')" style="background: var(--glow); border: none; color: #fff; padding: 6px 18px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; transition: all 0.2s ease; box-shadow: 0 4px 12px rgba(168, 66, 255, 0.4);">CLOSE</button>`;

        const modal = document.getElementById('reportModal');
        if (modal) {
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            if (!activeModalStack.includes('reportModal')) {
                activeModalStack.push('reportModal');
            }
        }

    } catch (err) {
        loadingOverlay.classList.remove('active');
        showToast("An error occurred during analysis.");
        console.error(err);
    } finally {
        loadingOverlay.classList.remove('active');
    }
});
}

// --------------------------------------------------------------
//  DYNAMIC TAG FILTER POPULATION  –  exclude OB90, OB91, OB92, ... (>= 90)
// --------------------------------------------------------------
function populateTagFilter(items) {
    const tags = new Set();
    items.forEach(item => {
        if (item.tag) {
            const tagList = item.tag.split(',').map(t => t.trim());
            tagList.forEach(t => tags.add(t));
        }
    });

    const obTags = [];
    const nonObTags = [];

    tags.forEach(tag => {
        if (tag.startsWith('OB')) {
            const numPart = tag.replace('OB', '');
            const num = parseInt(numPart, 10);
            if (!isNaN(num) && num >= 90) {
                return;
            }
            obTags.push(tag);
        } else {
            nonObTags.push(tag);
        }
    });

    obTags.sort((a, b) => {
        const numA = parseInt(a.replace('OB', ''), 10);
        const numB = parseInt(b.replace('OB', ''), 10);
        return numB - numA;
    });

    nonObTags.sort();

    const sortedTags = [...obTags, ...nonObTags];

    const select = document.getElementById('tagFilter');
    const currentValue = select.value;

    select.innerHTML = '<option value="">All Tags</option>';

    sortedTags.forEach(tag => {
        const opt = document.createElement('option');
        opt.value = tag;
        opt.textContent = tag;
        select.appendChild(opt);
    });

    if (currentValue && sortedTags.includes(currentValue)) {
        select.value = currentValue;
    } else {
        select.value = '';
    }
}

// --------------------------------------------------------------
//  LOAD & SAVE SETTINGS
// --------------------------------------------------------------
function loadSettings() {
    if (localStorage.getItem('rangeName') !== null) rangeName.checked = localStorage.getItem('rangeName') === 'true';
    if (localStorage.getItem('rangeID') !== null) rangeID.checked = localStorage.getItem('rangeID') === 'true';
    if (localStorage.getItem('rangeDesc') !== null) rangeDesc.checked = localStorage.getItem('rangeDesc') === 'true';
    if (localStorage.getItem('rangeIcon') !== null) rangeIcon.checked = localStorage.getItem('rangeIcon') === 'true';
    const savedClickAction = localStorage.getItem('clickAction');
    if (savedClickAction === 'copyID') {
        localStorage.setItem('clickAction', 'details');
        clickAction.value = 'details';
    } else if (savedClickAction && ['details', 'copyIcon', 'download'].includes(savedClickAction)) {
        clickAction.value = savedClickAction;
    } else {
        clickAction.value = 'details';
    }
    if (localStorage.getItem('downloadAs')) downloadAs.value = localStorage.getItem('downloadAs');

    if (iconLimitInput) iconLimitInput.value = localStorage.getItem('iconLimitMB') || '15';

    const storedItemsPerPage = localStorage.getItem('itemsPerPage');
    if (storedItemsPerPage !== null) {
        const val = parseInt(storedItemsPerPage, 10);
        if (!isNaN(val) && val > 0) {
            ITEMS_PER_PAGE = val;
        }
    }
    itemsPerPageInput.value = ITEMS_PER_PAGE;
    itemsPerPageTick.disabled = true;

    updateSearchHint();

    const savedReduceEffects = localStorage.getItem('reduceEffects') === 'true';
    reduceEffectsToggle.checked = savedReduceEffects;
    applyReduceEffects(savedReduceEffects);

    // Storage mode (default OFF on fresh installs / upgrades)
    const savedUseStorage = localStorage.getItem('useIconStorage') === 'true';
    if (useStorageToggle) {
        useStorageToggle.checked = savedUseStorage;
        applyUseStorage(savedUseStorage);
    }
}

function saveSettings() {
    localStorage.setItem('rangeName', rangeName.checked);
    localStorage.setItem('rangeID', rangeID.checked);
    localStorage.setItem('rangeDesc', rangeDesc.checked);
    localStorage.setItem('rangeIcon', rangeIcon.checked);
    localStorage.setItem('clickAction', clickAction.value);
    localStorage.setItem('downloadAs', downloadAs.value);
    localStorage.setItem('reduceEffects', String(reduceEffectsToggle.checked));
    localStorage.setItem('itemsPerPage', String(ITEMS_PER_PAGE));
    localStorage.setItem('useIconStorage', String(useIconStorage));
}

// --------------------------------------------------------------
//  REDUCE EFFECTS – APPLY CLASS & UPDATE STATUS
// --------------------------------------------------------------
function applyReduceEffects(enabled) {
    const body = document.body;
    if (enabled) {
        body.classList.add('reduce-effects');
        reduceEffectsStatus.textContent = 'On';
        reduceEffectsStatus.className = 'toggle-status on';
    } else {
        body.classList.remove('reduce-effects');
        reduceEffectsStatus.textContent = 'Off';
        reduceEffectsStatus.className = 'toggle-status off';
    }
    updateModeIndicator();
}

// --------------------------------------------------------------
//  USE-STORAGE MODE – toggle Cache API vs. direct <img> loading
// --------------------------------------------------------------
function applyUseStorage(enabled) {
    useIconStorage = enabled;

    if (!useStorageToggle || !useStorageStatus || !iconStorageDetails) return;

    if (enabled) {
        useStorageStatus.textContent = 'On';
        useStorageStatus.className = 'toggle-status on';
        iconStorageDetails.classList.remove('disabled');
        iconLimitInput.disabled = false;
        cleanStorageBtn.disabled = false;

        // Restore tick button to its natural state (only enabled if
        // the input value differs from the currently applied limit).
        const val = parseFloat(iconLimitInput.value);
        iconLimitTick.disabled = (isNaN(val) || val === iconStorageLimitMB);
    } else {
        useStorageStatus.textContent = 'Off';
        useStorageStatus.className = 'toggle-status off';
        iconStorageDetails.classList.add('disabled');
        iconLimitInput.disabled = true;
        iconLimitTick.disabled = true;
        cleanStorageBtn.disabled = true;
    }
}

reduceEffectsToggle.addEventListener('change', function() {
    const enabled = this.checked;
    applyReduceEffects(enabled);
    localStorage.setItem('reduceEffects', String(enabled));
    saveSettings();
    updateStatusBar();

    showToast(enabled
        ? '🚀 Performance mode: ON'
        : '✨ Performance mode: OFF');
});

[rangeName, rangeID, rangeDesc, rangeIcon].forEach(cb => cb.addEventListener('change', () => {
    updateSearchHint();
    saveSettings();
}));
clickAction.addEventListener('change', saveSettings);
downloadAs.addEventListener('change', saveSettings);

// --------------------------------------------------------------
//  STORAGE/IMAGE CACHE TRACKING
// --------------------------------------------------------------
// Increment version to force a full rescan on next startup,
// correcting any stale byte counts.
const STORAGE_CACHE_VERSION = 2;
const STORAGE_DEBOUNCE_MS = 1000;
const STORAGE_KEY = 'ff_storage_info';

let currentIconStorageSize = 0;
let iconStorageLimitMB = parseFloat(localStorage.getItem('iconLimitMB')) || 15;
let pendingSizeAdd = 0;
let storageFlushTimer = null;
let isStorageDirty = false;

// Track URLs we have already counted in this session to avoid double-counting concurrent loads.
let countedUrls = new Set();

function loadStorageInfo() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (_) { return null; }
}

function saveStorageInfo(totalBytes, keyCount) {
    try {
        const info = {
            totalBytes: totalBytes,
            keyCount: keyCount,
            timestamp: Date.now(),
            cacheVersion: STORAGE_CACHE_VERSION
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
    } catch (_) { /* ignore */ }
}

function clearStorageInfo() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (_) { /* ignore */ }
}

function scheduleStorageFlush() {
    if (storageFlushTimer) {
        clearTimeout(storageFlushTimer);
        storageFlushTimer = null;
    }
    storageFlushTimer = setTimeout(() => {
        flushStorageUpdate();
        storageFlushTimer = null;
    }, STORAGE_DEBOUNCE_MS);
}

function flushStorageUpdate() {
    if (pendingSizeAdd === 0 && !isStorageDirty) return;

    if (pendingSizeAdd > 0) {
        currentIconStorageSize += pendingSizeAdd;
        pendingSizeAdd = 0;
        isStorageDirty = true;
    }

    renderStorageBar();
    updatePersistedStorageInfo();
    isStorageDirty = false;
}

async function updatePersistedStorageInfo() {
    try {
        const cache = await caches.open('ff-icons');
        const keys = await cache.keys();
        saveStorageInfo(currentIconStorageSize, keys.length);
    } catch (_) {
        saveStorageInfo(currentIconStorageSize, 0);
    }
}

async function initStorageTracking() {
    const stored = loadStorageInfo();
    const now = Date.now();
    const isRecent = stored && (now - stored.timestamp < 6 * 60 * 60 * 1000);
    const versionMatch = stored && stored.cacheVersion === STORAGE_CACHE_VERSION;

    let cache = null;
    let keyCount = 0;

    try {
        cache = await caches.open('ff-icons');
        const keys = await cache.keys();
        keyCount = keys.length;
    } catch (_) {}

    if (stored && isRecent && versionMatch && stored.keyCount === keyCount) {
        currentIconStorageSize = stored.totalBytes;
        renderStorageBar();
        return;
    }

    // Force a full scan to correct any stale totals
    await fullStorageScan();
}

async function fullStorageScan() {
    try {
        const cache = await caches.open('ff-icons');
        const requests = await cache.keys();
        let total = 0;
        for (let req of requests) {
            const res = await cache.match(req);
            if (res) {
                const blob = await res.blob();
                total += blob.size;
            }
        }
        currentIconStorageSize = total;
        saveStorageInfo(total, requests.length);
        renderStorageBar();
        // Reset the counting set after a full scan
        countedUrls.clear();
    } catch (e) {
        console.warn("Storage tracking unavailable", e);
        currentIconStorageSize = 0;
        renderStorageBar();
    }
}

function renderStorageBar() {
    if (!storageBarFill || !storageBarText) return;
    const limitBytes = iconStorageLimitMB * 1024 * 1024;
    const pct = Math.min((currentIconStorageSize / limitBytes) * 100, 100);

    storageBarFill.style.width = pct + '%';
    if (pct > 90) { storageBarFill.className = 'storage-bar-fill danger'; } else if (pct > 70) { storageBarFill
        .className = 'storage-bar-fill warning'; } else { storageBarFill.className = 'storage-bar-fill'; }

    const usedMB = (currentIconStorageSize / (1024 * 1024)).toFixed(1);
    storageBarText.textContent = `${usedMB}MB / ${iconStorageLimitMB}MB`;
}

async function checkAndCleanStorage() {
    const limitBytes = iconStorageLimitMB * 1024 * 1024;
    if (currentIconStorageSize >= limitBytes) {
        await caches.delete('ff-icons');
        currentIconStorageSize = 0;
        pendingSizeAdd = 0;
        clearStorageInfo();
        countedUrls.clear();
        renderStorageBar();
        showToast("Auto cleaned icon storage");
    }
}

if (iconLimitInput) {
    iconLimitInput.addEventListener('input', function() {
        if (this.value.length > 4) this.value = this.value.slice(0, 4);
        const val = parseFloat(this.value);
        if (!isNaN(val) && val !== iconStorageLimitMB) {
            if (iconLimitTick) iconLimitTick.disabled = false;
        } else {
            if (iconLimitTick) iconLimitTick.disabled = true;
        }
    });

    iconLimitInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && iconLimitTick && !iconLimitTick.disabled) {
            iconLimitTick.click();
        }
    });
}

if (iconLimitTick) {
    iconLimitTick.addEventListener('click', () => {
        if (!iconLimitInput) return;
        let val = parseFloat(iconLimitInput.value);
        // Fix #6: disallow zero
        if (isNaN(val) || val <= 0) val = 15;
        iconStorageLimitMB = val;
        localStorage.setItem('iconLimitMB', iconStorageLimitMB);
        iconLimitInput.value = val;
        iconLimitTick.disabled = true;
        renderStorageBar();
        checkAndCleanStorage();
        showToast(`Icon storage limit set to ${iconStorageLimitMB}MB`);
    });
}

if (cleanStorageBtn) {
    cleanStorageBtn.addEventListener('click', async () => {
        await caches.delete('ff-icons');
        currentIconStorageSize = 0;
        pendingSizeAdd = 0;
        clearStorageInfo();
        countedUrls.clear();
        renderStorageBar();
        showToast("Cleaned icon storage");
    });
}

// ===== NEW: Storage mode toggle =====
if (useStorageToggle) {
    useStorageToggle.addEventListener('change', function() {
        const enabled = this.checked;
        applyUseStorage(enabled);
        localStorage.setItem('useIconStorage', String(enabled));
        saveSettings();

        showToast(enabled
            ? '💾 Use storage: ON'
            : '⚡ Use storage: OFF');

        // Re-render the grid so visible cards switch to the new loader
        if (allItems.length > 0) {
            applyFilters();
        }
    });
}

function recordImageSize(bytes) {
    pendingSizeAdd += bytes;
    scheduleStorageFlush();
}

// --------------------------------------------------------------
//  ITEMS PER PAGE LOGIC
// --------------------------------------------------------------
itemsPerPageInput.addEventListener('input', function() {
    if (this.value.length > 4) this.value = this.value.slice(0, 4);
    const val = parseInt(this.value, 10);
    if (!isNaN(val) && val > 0 && val !== ITEMS_PER_PAGE) {
        itemsPerPageTick.disabled = false;
    } else {
        itemsPerPageTick.disabled = true;
    }
});

itemsPerPageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !itemsPerPageTick.disabled) {
        itemsPerPageTick.click();
    }
});

itemsPerPageTick.addEventListener('click', () => {
    let val = parseInt(itemsPerPageInput.value, 10);
    if (isNaN(val) || val < 1) val = 80;
    ITEMS_PER_PAGE = val;
    localStorage.setItem('itemsPerPage', String(ITEMS_PER_PAGE));
    itemsPerPageInput.value = ITEMS_PER_PAGE;
    itemsPerPageTick.disabled = true;
    currentPage = 1;
    applyFilters();
    showToast(`Items per page set to ${ITEMS_PER_PAGE}`);
});

// --------------------------------------------------------------
//  INDEXEDDB HELPER – Now stores parsed data, not raw
// --------------------------------------------------------------
const DB_NAME = 'FF_Catalog_Storage';
const DB_STORE = 'database_cache';

function openIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 2);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(DB_STORE)) {
                db.createObjectStore(DB_STORE);
            }
            const tx = e.target.transaction;
            const store = tx.objectStore(DB_STORE);
            store.clear();
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function getLocalCache() {
    try {
        const db = await openIDB();
        return new Promise((resolve) => {
            const tx = db.transaction(DB_STORE, 'readonly');
            const store = tx.objectStore(DB_STORE);
            const req = store.get('cached_db');
            req.onsuccess = () => {
                const record = req.result;
                if (!record) return resolve(null);
                if (record.items && Array.isArray(record.items) && record.updatedOn) {
                    return resolve({
                        items: record.items,
                        updatedOn: record.updatedOn,
                        timestamp: record.timestamp || 0
                    });
                }
                if (record.rawData) {
                    try {
                        const decoded = MessagePack.decode(record.rawData);
                        let items = null,
                            updatedOn = record.updatedOn || "Unknown";
                        if (Array.isArray(decoded)) {
                            if (decoded.length > 0 && typeof decoded[0] === 'object' && decoded[0] !== null && (decoded[0].updated_on || decoded[0].version || decoded[0]._metadata)) {
                                updatedOn = decoded[0].updated_on || decoded[0].version || "Unknown";
                                items = decoded.slice(1);
                            } else {
                                items = decoded;
                            }
                        } else if (typeof decoded === 'object' && decoded !== null) {
                            items = decoded.items || decoded.data || [];
                            updatedOn = decoded.updated_on || updatedOn;
                        }
                        if (items && Array.isArray(items)) {
                            const parsedRecord = { items, updatedOn, timestamp: record.timestamp || Date.now() };
                            saveLocalCache(items, updatedOn);
                            return resolve(parsedRecord);
                        }
                    } catch (e) {
                        console.warn('Failed to upgrade old raw cache:', e);
                    }
                }
                resolve(null);
            };
            req.onerror = () => resolve(null);
        });
    } catch (e) {
        return null;
    }
}

async function saveLocalCache(items, updatedOn) {
    try {
        const db = await openIDB();
        return new Promise((resolve) => {
            const tx = db.transaction(DB_STORE, 'readwrite');
            const store = tx.objectStore(DB_STORE);
            const record = {
                items: items,
                updatedOn: updatedOn,
                timestamp: Date.now()
            };
            store.put(record, 'cached_db');
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        });
    } catch (e) {
        console.error("IDB save error:", e);
        return false;
    }
}

// --------------------------------------------------------------
//  ANIMATION PAUSE OBSERVER
// --------------------------------------------------------------
let animationObserver = null;

function initAnimationObserver() {
    if (animationObserver) {
        animationObserver.disconnect();
    }
    animationObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const imgContainer = entry.target.querySelector('.img-container');
            if (!imgContainer) return;
            if (entry.isIntersecting) {
                imgContainer.classList.remove('paused');
            } else {
                imgContainer.classList.add('paused');
            }
        });
    }, { rootMargin: '500px' });
}
initAnimationObserver();

// --------------------------------------------------------------
//  WEB WORKER FOR DATABASE PARSING
// --------------------------------------------------------------
let dbWorker = null;

function initWorker() {
    // This ZIP does not ship db-worker.js. Do not enable a missing worker:
    // that would leave database parsing waiting forever. Use the safe parser.
    dbWorker = null;
    return false;
}

function parseDatabaseWithWorker(rawData) {
    return new Promise((resolve, reject) => {
        if (!dbWorker) {
            reject(new Error('Worker not available'));
            return;
        }
        const handler = (e) => {
            const { type, items, updatedOn, message } = e.data;
            if (type === 'success') {
                dbWorker.removeEventListener('message', handler);
                resolve({ items, updatedOn });
            } else if (type === 'error') {
                dbWorker.removeEventListener('message', handler);
                reject(new Error(message || 'Worker error'));
            }
        };
        dbWorker.addEventListener('message', handler);
        dbWorker.postMessage({ type: 'parse', rawData });
    });
}

// --------------------------------------------------------------
//  HELPER TO REBUILD THE ID MAP
// --------------------------------------------------------------
function rebuildItemsMap() {
    itemsById = new Map();
    for (const item of allItems) {
        if (item && item.itemID !== undefined) {
            itemsById.set(String(item.itemID), item);
        }
    }
}

// --------------------------------------------------------------
//  DATABASE STATE – unified setter
// --------------------------------------------------------------
function setDatabaseState(items, updatedOn) {
    allItems = items;
    rawDbUpdatedOnText = updatedOn || "Unknown";
    metadataObj = { updated_on: rawDbUpdatedOnText };
    dbUpdatedOnText = formatDatabaseDate(rawDbUpdatedOnText);
    const dbVersionUI = document.getElementById('dbVersionUI');
    if (dbVersionUI) dbVersionUI.textContent = rawDbUpdatedOnText;

    rebuildItemsMap();
    populateTagFilter(allItems);
    totalItemsCount = allItems.length;
    applyFilters();   // applyFilters already calls updateFavUI()
    updateStatusBar();
    // updateFavUI() is called inside applyFilters()
}

// --------------------------------------------------------------
//  DATABASE SYNC & PARSING LOGIC – Caches parsed data, not raw
// --------------------------------------------------------------
async function initDatabase(forceSync = false) {
    grid.innerHTML = '';
    paginationContainer.style.display = 'none';
    loadingOverlay.classList.add('active');

    reqDataBtns.forEach(b => b.disabled = true);
    const syncNormal = document.getElementById('syncIconNormal');
    if (syncNormal) syncNormal.style.display = 'none';
    const syncSpinner = document.getElementById('syncIconSpinner');
    if (syncSpinner) syncSpinner.style.display = 'block';
    const dlNormal = document.getElementById('dlDbNormal');
    if (dlNormal) dlNormal.style.display = 'none';
    const dlSpinner = document.getElementById('dlDbSpinner');
    if (dlSpinner) dlSpinner.style.display = 'block';

    // 1. Try to load parsed cache
    const cache = await getLocalCache();
    const now = Date.now();
    const isFresh = cache && cache.timestamp && (now - cache.timestamp < ONE_DAY_MS);
    const oldVersion = rawDbUpdatedOnText;

    // If cache exists and is fresh and not force sync, use it directly
    if (!forceSync && cache && isFresh && cache.items && Array.isArray(cache.items)) {
        loadingText.textContent = 'Loading data...';
        setDatabaseState(cache.items, cache.updatedOn || "Unknown");
        loadingOverlay.classList.remove('active');
        restoreButtons();

        if (!initialLoadDone) {
            initialLoadDone = true;
            showCreditToastIfNeeded();
            localStorage.setItem('ff_visited', 'true');
            scheduleTutorialAutoShow();
        }
        syncModalsFromUrl();
        return;
    }

    // 2. Cache is absent, expired, or force sync → fetch fresh
    const useWorker = dbWorker !== null;
    loadingText.textContent = 'Getting latest database...';

    let progressListener = null;
    if (useWorker) {
        progressListener = (e) => {
            const { type, stage } = e.data;
            if (type === 'progress') {
                switch (stage) {
                    case 'fetching': loadingText.textContent = 'Getting latest database...'; break;
                    case 'decompressing': loadingText.textContent = 'Extracting data...'; break;
                    case 'parsing': loadingText.textContent = 'Parsing data...'; break;
                    default: break;
                }
            }
        };
        dbWorker.addEventListener('message', progressListener);
    }

    try {
        let rawData = null;
        let items = null;
        let updatedOn = null;

        const response = await fetchWithFallback(
            CONFIG.DATABASE_URL,
            CONFIG.FALLBACK_DATABASE_URL,
            { timeout: 15000, cache: 'force-cache' }
        );

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        loadingText.textContent = 'Extracting data...';
        const ds = new DecompressionStream('gzip');
        const decompressed = response.body.pipeThrough(ds);
        const arrayBuffer = await new Response(decompressed).arrayBuffer();
        rawData = new Uint8Array(arrayBuffer);

        if (useWorker) {
            loadingText.textContent = 'Parsing data...';
            const result = await parseDatabaseWithWorker(rawData);
            items = result.items;
            updatedOn = result.updatedOn;
        } else {
            loadingText.textContent = 'Loading data...';
            const decoded = MessagePack.decode(rawData);
            if (Array.isArray(decoded)) {
                if (decoded.length > 0 && typeof decoded[0] === 'object' && decoded[0] !== null && (decoded[0].updated_on || decoded[0].version || decoded[0]._metadata)) {
                    updatedOn = decoded[0].updated_on || decoded[0].version || "Unknown";
                    items = decoded.slice(1);
                } else {
                    items = decoded;
                    updatedOn = "Unknown";
                }
            } else if (typeof decoded === 'object' && decoded !== null) {
                items = decoded.items || decoded.data || [];
                updatedOn = decoded.updated_on || "Unknown";
            } else {
                items = [];
                updatedOn = "Unknown";
            }
        }

        if (!items) throw new Error('Failed to parse data');

        loadingText.textContent = 'Loading data...';
        setDatabaseState(items, updatedOn || "Unknown");

        await saveLocalCache(allItems, rawDbUpdatedOnText);

        if (forceSync) {
            if (oldVersion !== "Unknown" && oldVersion === rawDbUpdatedOnText) {
                showToast("Latest database is same as before");
            } else {
                showToast(`Database updated to version: ${rawDbUpdatedOnText}`);
            }
        }

        if (!initialLoadDone && !forceSync) {
            initialLoadDone = true;
            showCreditToastIfNeeded();
            localStorage.setItem('ff_visited', 'true');
            scheduleTutorialAutoShow();
        }

    } catch (err) {
        console.warn("Failed to fetch fresh database:", err);
        if (forceSync) showToast("Database offline");

        // Fallback to cache even if expired or any error
        if (cache && cache.items && Array.isArray(cache.items)) {
            setDatabaseState(cache.items, cache.updatedOn || "Unknown");
            if (forceSync) showToast("Using cached data (offline)");
        } else {
            grid.innerHTML = '<p style="text-align:center; grid-column:1/-1; color:#ff4c4c;">⚠️ Failed to load database. Please check connection.</p>';
        }
    } finally {
        if (useWorker && progressListener) {
            dbWorker.removeEventListener('message', progressListener);
        }
        loadingOverlay.classList.remove('active');
        restoreButtons();
        syncModalsFromUrl();
    }
}

function restoreButtons() {
    reqDataBtns.forEach(b => b.disabled = false);
    const syncSpinner = document.getElementById('syncIconSpinner');
    if (syncSpinner) syncSpinner.style.display = 'none';
    const syncNormal = document.getElementById('syncIconNormal');
    if (syncNormal) syncNormal.style.display = 'block';
    const dlSpinner = document.getElementById('dlDbSpinner');
    if (dlSpinner) dlSpinner.style.display = 'none';
    const dlNormal = document.getElementById('dlDbNormal');
    if (dlNormal) dlNormal.style.display = 'block';
}

// --------------------------------------------------------------
//  FILTER & SEARCH LOGIC – resets to page 1 on any filter change
// --------------------------------------------------------------
function applyFilters() {
    const query = searchInput.value.toLowerCase().trim();
    const tag = tagFilter.value;
    const type = typeFilter.value;
    const rare = rareFilter.value;

    const rName = rangeName.checked;
    const rID = rangeID.checked;
    const rDesc = rangeDesc.checked;
    const rIcon = rangeIcon.checked;

    let sourceItems = allItems;
    if (favFilterActive) {
        sourceItems = allItems.filter(item => favoriteIds.has(String(item.itemID)));
    }

    filteredItems = sourceItems.filter(item => {
        let matchQuery = false;
        if (!query) {
            matchQuery = true;
        } else {
            if (rName && item.name && item.name.toLowerCase().includes(query)) matchQuery = true;
            if (rID && item.itemID && String(item.itemID).includes(query)) matchQuery = true;
            if (rDesc && item.description && item.description.toLowerCase().includes(query)) matchQuery = true;
            if (rIcon && item.icon && item.icon.toLowerCase().includes(query)) matchQuery = true;
        }

        // ----- FIX #1: multi‑tag matching -----
        const matchTag = !tag || (
            typeof item.tag === 'string' &&
            item.tag
                .split(',')
                .map(t => t.trim().toLowerCase())
                .includes(tag.trim().toLowerCase())
        );

        const matchType = !type || (
            item.type != null &&
            String(item.type).toLowerCase() === type.toLowerCase()
        );

        const matchRare = !rare || (
            item.rarity != null &&
            String(item.rarity).toLowerCase() === rare.toLowerCase()
        );

        return matchQuery && matchTag && matchType && matchRare;
    });

    if (favFilterActive) {
        const favs = getFavorites();
        const orderMap = {};
        favs.forEach((id, idx) => { orderMap[id] = idx; });
        filteredItems.sort((a, b) => {
            const idxA = orderMap[String(a.itemID)] ?? Infinity;
            const idxB = orderMap[String(b.itemID)] ?? Infinity;
            return idxA - idxB;
        });
    }

    totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
    if (totalPages === 0) totalPages = 1;

    currentPage = 1;

    totalPagesUI.textContent = totalPages;

    updateStatusBar();

    renderPage();

    requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'auto' });
    });

    updateFavUI();
}

function updateSearchHint() {
    const arr = [];
    if (rangeName.checked) arr.push('Name');
    if (rangeID.checked) arr.push('ID');
    if (rangeDesc.checked) arr.push('Desc');
    if (rangeIcon.checked) arr.push('Icon');
    searchInput.placeholder = arr.length > 0 ? `Search by ${arr.join(', ')}...` : 'Search disabled (check boxes)';
    applyFilters();
}

// --------------------------------------------------------------
//  RENDER ITEMS – with swipe animation support & auto-scroll pagination
// --------------------------------------------------------------
let isTransitioning = false;
let pendingPageChange = null;

function renderPage(direction) {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = Math.min(start + ITEMS_PER_PAGE, filteredItems.length);
    const pageItems = filteredItems.slice(start, end);

    const currentImgs = grid.querySelectorAll('img');
    currentImgs.forEach(img => {
        if (img.dataset.objectUrl) {
            URL.revokeObjectURL(img.dataset.objectUrl);
            delete img.dataset.objectUrl;
        }
        img.removeAttribute('src');
        img.classList.remove('loaded');
    });

    if (animationObserver) {
        animationObserver.disconnect();
    }
    grid.innerHTML = '';

    if (pageItems.length === 0) {
        if (favFilterActive && getFavorites().length === 0) {
            grid.innerHTML = `
            <div class="fav-empty-state">
            <span class="big-icon">☆</span>
            <h3>No favorites yet</h3>
            <p>Click the <strong>☆</strong> star on any item card to add it to your favorites collection.</p>
            <div style="display: flex; justify-content: center;">
            <button id="favEmptyImportBtn" class="action-btn-small">
            <svg viewBox="0 0 24 24" width="16" height="16"><path d="M19 9h-4v7H9v-7H5l7-7 7 7zM5 18v2h14v-2H5z"/></svg>
            Import Favorites
            </button>
            </div>
            </div>
            `;
            document.getElementById('favEmptyImportBtn')?.addEventListener('click', triggerFavImport);
        } else {
            grid.innerHTML = `
            <div class="empty-search-state">
            <span class="empty-icon">❓</span>
            <h3>No items found</h3>
            <p>Try adjusting your search or filters.</p>
            </div>
            `;
        }
        paginationContainer.style.display = 'none';
        updatePaginationUI();
        return;
    }

    const frag = buildItemCards(pageItems);
    grid.appendChild(frag);
    paginationContainer.style.display = 'flex';
    updatePaginationUI();

    scrollPaginationToActive();

    initAnimationObserver();
    document.querySelectorAll('.card').forEach(card => animationObserver.observe(card));

    // ----- Performance mode: skip all slide‑in animations -----
    if (!document.body.classList.contains('reduce-effects')) {
        if (direction === 'forward') {
            grid.classList.add('slide-in-right');
            setTimeout(() => {
                grid.classList.remove('slide-in-right');
            }, 350);
        } else if (direction === 'backward') {
            grid.classList.add('slide-in-left');
            setTimeout(() => {
                grid.classList.remove('slide-in-left');
            }, 350);
        }
    }
}

function scrollPaginationToActive() {
    const activeBtn = pageNumbersEl.querySelector('.page-btn.active');
    if (!activeBtn) return;

    const targetScrollLeft =
        activeBtn.offsetLeft -
        (pageNumbersEl.clientWidth - activeBtn.offsetWidth) / 2;

    pageNumbersEl.scrollTo({
        left: Math.max(0, targetScrollLeft),
        behavior: 'smooth'
    });
}

function buildItemCards(items) {
    const frag = document.createDocumentFragment();
    items.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.animationDelay = `${Math.min(index * 0.015, 0.3)}s`;

        const imgContainer = document.createElement('div');
        imgContainer.className = 'img-container';

        const img = document.createElement('img');
        const iconUrl = CONFIG.CDN_BASE_URL + item.itemID + '.webp';
        img.alt = item.name || 'Unnamed';
        img.draggable = false;
        img.setAttribute('ondragstart', 'return false');
        img.setAttribute('oncontextmenu', 'return false');
        img.dataset.originalUrl = iconUrl;

        const reloadBtn = document.createElement('button');
        reloadBtn.className = 'reload-icon-btn';
        reloadBtn.dataset.itemId = String(item.itemID);
        reloadBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>`;
        reloadBtn.title = 'Reload image';
        reloadBtn.style.display = 'none';

        reloadBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const url = img.dataset.originalUrl;
            try {
                const cache = await caches.open('ff-icons');
                await cache.delete(url);
            } catch (_) {}
            img.dataset.loaded = 'false';
            img.classList.remove('loaded', 'is-fallback');
            reloadBtn.classList.remove('visible');
            reloadBtn.style.display = 'none';
            loadImageForElement(img, item, reloadBtn);
        });

        imgContainer.appendChild(img);
        imgContainer.appendChild(reloadBtn);

        loadImageForElement(img, item, reloadBtn);

        const starBtn = document.createElement('button');
        starBtn.className = 'star-btn';
        starBtn.dataset.id = String(item.itemID);
        const favorited = isFavorited(item.itemID);
        starBtn.innerHTML = favorited ? '★' : '☆';
        starBtn.classList.toggle('favorited', favorited);
        starBtn.setAttribute('aria-label', 'Toggle favorite');
        starBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(item.itemID);
            const modalStar = document.getElementById('modalStarBtn');
            if (modalStar && modalStar.dataset.id === String(item.itemID)) {
                const fav = isFavorited(item.itemID);
                modalStar.innerHTML = fav ? '★' : '☆';
                modalStar.classList.toggle('favorited', fav);
            }
        });
        imgContainer.appendChild(starBtn);

        const copyTick = document.createElement('div');
        copyTick.className = 'copy-tick';
        copyTick.id = `tick-${item.itemID}`;
        copyTick.textContent = '✓';

        const h3 = document.createElement('h3');
        h3.textContent = item.name || 'Unnamed';

        const small = document.createElement('small');
        let displayType = item.type || '';
        if (displayType.toLowerCase().endsWith('s')) displayType = displayType.slice(0, -1);
        small.textContent = `ID: ${item.itemID}${displayType ? ' • ' + displayType : ''}`;

        card.appendChild(imgContainer);
        card.appendChild(copyTick);
        card.appendChild(h3);
        card.appendChild(small);

        card.addEventListener('click', (e) => {
            const imgSrc = img.src;
            handleItemClick(item, imgSrc, card);
        });

        frag.appendChild(card);
    });
    return frag;
}

// --------------------------------------------------------------
//  COMMON IMAGE LOADER FOR CARD & MODAL
// --------------------------------------------------------------
function loadImageForElement(imgEl, item, reloadBtn, modalToken = null) {
    const url = imgEl.dataset.originalUrl;
    const cacheName = 'ff-icons';
    const fallbackUrl = url;

    // ============================================================
    //  DIRECT MODE (Storage OFF) — native <img> loading.
    //  Browser HTTP cache handles caching transparently (jsDelivr
    //  sends max-age=31536000, immutable for @main/ paths).
    //  No Cache API, no blob → objectURL round-trip.
    //
    //  Fallback chain: primary CDN → fallback CDN → icons/error.webp
    // ============================================================
    if (!useIconStorage) {
        imgEl.loading = (modalToken !== null) ? 'eager' : 'lazy';
        imgEl.decoding = 'async';

        const markLoaded = () => {
            if (modalToken !== null && modalToken !== modalImageLoadToken) return;
            imgEl.classList.add('loaded');
            if (!imgEl.classList.contains('is-fallback')) {
                reloadBtn.classList.remove('visible');
                reloadBtn.style.display = 'none';
            }
        };

        imgEl.onload = markLoaded;
        imgEl.onerror = () => {
            if (modalToken !== null && modalToken !== modalImageLoadToken) return;
            // First failure: retry once on the fallback CDN
            if (imgEl.dataset.fbTried !== 'true') {
                imgEl.dataset.fbTried = 'true';
                imgEl.src = fallbackUrl;
                return;
            }
            // Both CDNs failed → local error.webp placeholder
            imgEl.src = CONFIG.FALLBACK_IMAGE_URL;
            imgEl.classList.add('is-fallback');
            reloadBtn.classList.add('visible');
            reloadBtn.style.display = 'flex';
            imgEl.classList.add('loaded');
        };

        delete imgEl.dataset.fbTried;
        imgEl.classList.remove('is-fallback');
        imgEl.src = url;
        return;
    }

    // ============================================================
    //  STORAGE MODE (Storage ON) — original Cache API pipeline.
    //  Unchanged. Provides offline access, storage-bar tracking,
    //  and auto-clean support.
    // ============================================================
    loadImageWithRetry(url, { fallbackUrl, cacheName })
        .then(async ({ blob, fromCache }) => {
            // ----- FIX #2: Stale modal guard -----
            if (modalToken !== null && modalToken !== modalImageLoadToken) {
                return;
            }

            const objectUrl = URL.createObjectURL(blob);
            setImageBlob(imgEl, objectUrl);

            const markLoaded = () => {
                if (imgEl.dataset.loaded === 'true') return;
                imgEl.dataset.loaded = 'true';
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        imgEl.classList.add('loaded');
                        if (!imgEl.classList.contains('is-fallback')) {
                            reloadBtn.classList.remove('visible');
                            reloadBtn.style.display = 'none';
                        }
                    });
                });
            };

            imgEl.onload = markLoaded;
            imgEl.onerror = (ev) => {
                const fallback = getFallbackUrl(ev);
                imgEl.src = fallback;
                imgEl.classList.add('is-fallback');
                reloadBtn.classList.add('visible');
                reloadBtn.style.display = 'flex';
                markLoaded();
            };

            imgEl.src = objectUrl;

            if (imgEl.complete && imgEl.naturalWidth > 0) {
                if (imgEl.decode) {
                    imgEl.decode().then(markLoaded).catch(() => markLoaded());
                } else {
                    markLoaded();
                }
            } else {
                if (imgEl.decode) {
                    imgEl.decode().then(markLoaded).catch(() => {});
                }
            }

            // ----- FIX #7: Avoid double-counting concurrent cache writes -----
            if (!fromCache) {
                // Prevent multiple simultaneous requests for the same URL from counting twice.
                if (countedUrls.has(url)) {
                    return; // already counting this URL
                }
                countedUrls.add(url);

                // Count the newly downloaded image.
                recordImageSize(blob.size);

                // If the storage limit is exceeded, flush pending updates and clean.
                if (
                    currentIconStorageSize + pendingSizeAdd >
                    iconStorageLimitMB * 1024 * 1024
                ) {
                    flushStorageUpdate();
                    await checkAndCleanStorage();
                }
            }
        })
        .catch(err => {
            // ----- FIX #2: Stale modal guard -----
            if (modalToken !== null && modalToken !== modalImageLoadToken) {
                return;
            }
            console.warn('Failed to load image:', url, err);
            const fallbackUrl = getFallbackUrl(err);
            imgEl.src = fallbackUrl;
            imgEl.classList.add('is-fallback');
            reloadBtn.classList.add('visible');
            reloadBtn.style.display = 'flex';

            const markLoaded = () => {
                if (imgEl.dataset.loaded === 'true') return;
                imgEl.dataset.loaded = 'true';
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        imgEl.classList.add('loaded');
                    });
                });
            };
            imgEl.onload = markLoaded;
            imgEl.onerror = markLoaded;
            setTimeout(markLoaded, 3000);
        });
}

// --------------------------------------------------------------
//  OBJECT URL HELPER
// --------------------------------------------------------------
function setImageBlob(img, objectUrl) {
    if (img.dataset.objectUrl) {
        URL.revokeObjectURL(img.dataset.objectUrl);
    }
    img.dataset.objectUrl = objectUrl;
    img.src = objectUrl;
}

// --------------------------------------------------------------
//  PAGINATION UI
// --------------------------------------------------------------
function updatePaginationUI() {
    pageNumbersEl.innerHTML = '';
    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.className = 'page-btn' + (i === currentPage ? ' active' : '');
        btn.textContent = i;
        btn.addEventListener('click', () => goToPage(i));
        pageNumbersEl.appendChild(btn);
    }
}

// --------------------------------------------------------------
//  GO TO PAGE – with swipe animation
// --------------------------------------------------------------
function goToPage(pageNum) {
    if (isTransitioning) {
        pendingPageChange = pageNum;
        return;
    }
    if (pageNum < 1 || pageNum > totalPages) return;
    if (pageNum === currentPage) return;

    const direction = pageNum > currentPage ? 'forward' : 'backward';
    const isReduced = document.body.classList.contains('reduce-effects');

    // ----- Performance Mode: skip animation entirely -----
    if (isReduced) {
        currentPage = pageNum;
        renderPage(direction);
        updatePaginationUI();
        scrollPaginationToActive();
        window.scrollTo({ top: 0, behavior: 'auto' });
        return;
    }

    // ----- Normal mode: animate as before -----
    currentPage = pageNum;
    const slideOutClass = direction === 'forward' ? 'slide-out-left' : 'slide-out-right';
    grid.classList.add(slideOutClass);
    isTransitioning = true;

    const onAnimationEnd = () => {
        grid.removeEventListener('animationend', onAnimationEnd);
        grid.classList.remove(slideOutClass);
        renderPage(direction);
        isTransitioning = false;
        if (pendingPageChange !== null) {
            const next = pendingPageChange;
            pendingPageChange = null;
            goToPage(next);
        }
    };

    grid.addEventListener('animationend', onAnimationEnd);

    setTimeout(() => {
        if (isTransitioning) {
            grid.removeEventListener('animationend', onAnimationEnd);
            grid.classList.remove(slideOutClass);
            renderPage(direction);
            isTransitioning = false;
            if (pendingPageChange !== null) {
                const next = pendingPageChange;
                pendingPageChange = null;
                goToPage(next);
            }
        }
    }, 400);

    updatePaginationUI();
    scrollPaginationToActive();
    window.scrollTo({ top: 0, behavior: 'auto' });
}

document.getElementById('btnPrev').addEventListener('click', () => {
    pageNumbersEl.scrollBy({ left: -pageNumbersEl.clientWidth + 20, behavior: 'smooth' });
});
document.getElementById('btnNext').addEventListener('click', () => {
    pageNumbersEl.scrollBy({ left: pageNumbersEl.clientWidth - 20, behavior: 'smooth' });
});

let isDown = false,
    startX, scrollLeft;
pageNumbersEl.addEventListener('mousedown', (e) => {
    isDown = true;
    startX = e.pageX - pageNumbersEl.offsetLeft;
    scrollLeft = pageNumbersEl.scrollLeft;
});
pageNumbersEl.addEventListener('mouseleave', () => isDown = false);
pageNumbersEl.addEventListener('mouseup', () => isDown = false);
pageNumbersEl.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - pageNumbersEl.offsetLeft;
    const walk = (x - startX) * 2;
    pageNumbersEl.scrollLeft = scrollLeft - walk;
});
pageNumbersEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    pageNumbersEl.scrollBy({ left: e.deltaY > 0 ? 60 : -60, behavior: 'auto' });
});

searchPageBtn.addEventListener('click', () => {
    searchPageBtn.style.display = 'none';
    jumpInput.style.display = 'inline-block';
    jumpInput.value = currentPage;
    jumpInput.focus();
});

jumpInput.addEventListener('blur', () => {
    jumpInput.style.display = 'none';
    searchPageBtn.style.display = 'inline-flex';
});

jumpInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        let val = parseInt(jumpInput.value, 10);
        if (!isNaN(val) && val >= 1 && val <= totalPages) {
            goToPage(val);
        }
        jumpInput.blur();
    }
});

// --------------------------------------------------------------
//  FAVORITES IMPORT / EXPORT / CLEAR
// --------------------------------------------------------------
function triggerFavImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if (Array.isArray(data)) {
                    const valid = data.filter(id => typeof id === 'string' || typeof id === 'number');
                    if (valid.length > 0 && confirm(`Import ${valid.length} favorites? This will replace your current list.`)) {
                        saveFavorites(valid);
                    } else if (valid.length === 0) {
                        saveFavorites([]);
                    } else {
                        return;
                    }
                    updateFavUI();
                    applyFilters();
                    showToast(`Imported ${valid.length} favorites!`);
                } else {
                    showToast('Invalid format: expected an array of IDs.');
                }
            } catch (err) {
                showToast('Failed to parse file.');
                console.error(err);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

document.getElementById('favImportBtn').addEventListener('click', triggerFavImport);

document.getElementById('favExportBtn').addEventListener('click', () => {
    const favs = getFavorites();
    if (favs.length === 0) {
        showToast('No favorites to export.');
        return;
    }
    const data = JSON.stringify(favs, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ff_favorites_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Favorites exported!');
});

document.getElementById('favClearBtn').addEventListener('click', () => {
    if (getFavorites().length === 0) {
        showToast('No favorites to clear.');
        return;
    }
    if (confirm('Remove all favorites?')) {
        saveFavorites([]);
        updateFavUI();
        applyFilters();
        showToast('Favorites cleared.');
    }
});

// --------------------------------------------------------------
//  FAVORITES TOGGLE IN FILTER ROW
// --------------------------------------------------------------
document.getElementById('favToggle').addEventListener('click', function() {
    favFilterActive = !favFilterActive;
    saveFavState();
    updateFavUI();
    applyFilters();
});

// --------------------------------------------------------------
//  WINDOW RESIZE – re‑adjust icon name overflow if modal open
// --------------------------------------------------------------
window.addEventListener('resize', () => {
    const modal = document.getElementById('itemModal');
    if (modal && !modal.classList.contains('hidden')) {
        const iconNameEl = document.getElementById('modalIconName');
        if (iconNameEl) adjustIconNameOverflow(iconNameEl);
    }
});

// --------------------------------------------------------------
//  🖐️ SWIPE GESTURES & ⌨️ KEYBOARD SHORTCUTS
// --------------------------------------------------------------
let touchStartX = 0;
let touchStartY = 0;
let isSwiping = false;

document.addEventListener('touchstart', (e) => {
    if (activeModalStack.length > 0) return;
    if (paginationContainer.contains(e.target)) return;

    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    isSwiping = true;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
    if (!isSwiping || activeModalStack.length > 0) return;
    if (paginationContainer.contains(e.target)) {
        isSwiping = false;
        return;
    }

    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    if (Math.abs(deltaX) > 50 && Math.abs(deltaY) < 30) {
        isSwiping = false;
        if (deltaX < 0) {
            goToPage(currentPage + 1);
        } else {
            goToPage(currentPage - 1);
        }
    }
}, { passive: true });

document.addEventListener('touchend', () => {
    isSwiping = false;
}, { passive: true });

document.addEventListener('keydown', (e) => {
    if (activeModalStack.length > 0) return;
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        return;
    }
    if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPage(currentPage - 1);
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToPage(currentPage + 1);
    } else if (e.key === 's' && e.altKey) {
        e.preventDefault();
        const btn = document.getElementById('searchPageBtn');
        if (btn) btn.click();
    }
});

// --------------------------------------------------------------
//  IMAGE PROTECTION – global context menu / drag prevention
// --------------------------------------------------------------
document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    return false;
}, { passive: false });

document.addEventListener('dragstart', function(e) {
    const target = e.target;
    if (target.tagName === 'IMG') {
        e.preventDefault();
        return false;
    }
}, { passive: false });

// ================================================================
//  🆕 TUTORIAL OVERLAY & MODAL FUNCTIONS (UPDATED)
// ================================================================

let tutorialDismissed = localStorage.getItem('ff_tutorial_dismissed') === 'true';
let tutorialAutoTimer = null;
let tutorialTouchBlocked = false;

async function showTutorialOverlay(manual = false) {
    if (!manual && tutorialDismissed) return;
    const overlay = document.getElementById('tutorialOverlay');
    if (!overlay) return;

    const loaded = await loadHayatoImage();

    overlay.style.display = 'flex';

    if (!manual) {
        tutorialTouchBlocked = true;
        setTimeout(() => {
            tutorialTouchBlocked = false;
        }, 500);
    }

    if (!loaded) {
        showToast('Hayato image unavailable. Tap to open tutorial.');
    }
}

function hideTutorialOverlay(setDismissed = false) {
    const overlay = document.getElementById('tutorialOverlay');
    if (overlay) overlay.style.display = 'none';
    if (setDismissed) {
        tutorialDismissed = true;
        localStorage.setItem('ff_tutorial_dismissed', 'true');
    }
}

async function loadHayatoImage() {
    const img = document.getElementById('hayatoImage');
    const url = CONFIG.HAYATO_IMAGE_URL;
    const fallbackUrl = CONFIG.FALLBACK_HAYATO_IMAGE_URL;
    const cacheName = 'ff-tutorial-images';
    const cacheKey = 'hayato';

    let cachedBlob = null;
    let cache = null;

    try {
        cache = await caches.open(cacheName);
        const cachedResponse = await cache.match(cacheKey);
        if (cachedResponse) {
            cachedBlob = await cachedResponse.blob();
        }
    } catch (e) { /* ignore */ }

    if (cachedBlob) {
        const objectUrl = URL.createObjectURL(cachedBlob);
        setImageBlob(img, objectUrl);
        img.style.display = 'block';
        refreshHayatoInBackground();
        return true;
    }

    try {
        const response = await fetchWithFallback(
            url + '?nocache=' + Date.now(),
            fallbackUrl + '?nocache=' + Date.now(),
            { timeout: 15000 }
        );
        const blob = await response.blob();
        if (cache) {
            await cache.put(cacheKey, new Response(blob));
        }
        const objectUrl = URL.createObjectURL(blob);
        setImageBlob(img, objectUrl);
        img.style.display = 'block';
        return true;
    } catch (err) {
        console.warn('Failed to fetch Hayato image:', err);
        img.style.display = 'none';
        return false;
    }
}

async function refreshHayatoInBackground() {
    try {
        const response = await fetchWithFallback(
            CONFIG.HAYATO_IMAGE_URL + '?nocache=' + Date.now(),
            CONFIG.FALLBACK_HAYATO_IMAGE_URL + '?nocache=' + Date.now(),
            { timeout: 15000 }
        );
        const blob = await response.blob();
        const cache = await caches.open('ff-tutorial-images');
        await cache.put('hayato', new Response(blob));
        const img = document.getElementById('hayatoImage');
        const overlay = document.getElementById('tutorialOverlay');
        if (overlay && overlay.style.display === 'flex') {
            const objectUrl = URL.createObjectURL(blob);
            if (img.dataset.objectUrl) URL.revokeObjectURL(img.dataset.objectUrl);
            setImageBlob(img, objectUrl);
        }
    } catch (_) { /* ignore */ }
}

document.addEventListener('click', function(e) {
    const overlay = document.getElementById('tutorialOverlay');
    if (!overlay || overlay.style.display === 'none') return;

    if (tutorialTouchBlocked) {
        e.preventDefault();
        e.stopPropagation();
        return;
    }

    if (e.target.closest('#tutorialDismissBtn')) {
        hideTutorialOverlay(true);
        return;
    }
    if (overlay.contains(e.target)) {
        hideTutorialOverlay(true);
        openTutorialModal();
    }
});

document.getElementById('tutorialDismissBtn')?.addEventListener('click', function(e) {
    e.stopPropagation();
    hideTutorialOverlay(true);
});

document.getElementById('playTutorialBtn')?.addEventListener('click', function() {
    closeModal('settingsModal');
    showTutorialOverlay(true);
});

function scheduleTutorialAutoShow() {
    if (tutorialDismissed) return;

    if (tutorialAutoTimer) {
        clearTimeout(tutorialAutoTimer);
        tutorialAutoTimer = null;
    }

    const isReady = !loadingOverlay.classList.contains('active') &&
        activeModalStack.length === 0 &&
        initialLoadDone &&
        allItems.length > 0;

    if (isReady) {
        tutorialAutoTimer = setTimeout(() => {
            if (!tutorialDismissed && !loadingOverlay.classList.contains('active') && activeModalStack.length === 0) {
                showTutorialOverlay(false);
            } else {
                scheduleTutorialAutoShow();
            }
        }, 2000);
    } else {
        tutorialAutoTimer = setTimeout(() => {
            scheduleTutorialAutoShow();
        }, 500);
    }
}

// ----- TUTORIAL MODAL (reuses reportModal) with footer close button -----
async function openTutorialModal() {
    const modal = document.getElementById('reportModal');
    const title = document.getElementById('reportTitle');
    const content = document.getElementById('reportContent');
    const footer = document.getElementById('reportFooter');

    if (content) {
        content.classList.remove('whatsnew-mode');
        content.classList.add('tutorial-mode');
    }

    title.textContent = "Hayato's Tutorial";
    content.innerHTML = `<div class="whatsnew-loading"><div class="spinner"></div><p>Loading tutorial...</p></div>`;
    footer.innerHTML = '';

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (!activeModalStack.includes('reportModal')) {
        activeModalStack.push('reportModal');
    }

    try {
        const markdown = await fetchTutorialMarkdown();
        const html = parseTutorialMarkdown(markdown);
        content.innerHTML = html;
        content.classList.add('tutorial-mode');
        loadTutorialImages(content);

        document.getElementById('reportFooter').innerHTML = `<button class="whatsnew-close-btn" onclick="closeModal('reportModal')" style="background: var(--glow); border: none; color: #fff; padding: 6px 18px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; transition: all 0.2s ease; box-shadow: 0 4px 12px rgba(168, 66, 255, 0.4);">CLOSE</button>`;
    } catch (err) {
        content.innerHTML = `<p class="whatsnew-error">Failed to load tutorial: ${err.message}</p>`;
        document.getElementById('reportFooter').innerHTML = `<button class="whatsnew-close-btn" onclick="closeModal('reportModal')" style="background: var(--glow); border: none; color: #fff; padding: 6px 18px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; transition: all 0.2s ease; box-shadow: 0 4px 12px rgba(168, 66, 255, 0.4);">CLOSE</button>`;
    }
}

// ----- Performance Mode Info Modal -----
async function openPerformanceModeModal() {
    const modal = document.getElementById('reportModal');
    const title = document.getElementById('reportTitle');
    const content = document.getElementById('reportContent');
    const footer = document.getElementById('reportFooter');

    content.classList.remove('whatsnew-mode', 'tutorial-mode');

    title.textContent = 'Performance Mode';
    content.innerHTML = `
        <div style="padding: 4px 0 0px 0;">
            <p style="color: #ddd; font-size: 14px; line-height: 1.6; margin-bottom: 10px;">
                Heavily reduces visual effects and animations to achieve the best possible responsiveness.
                This improves performance on lower‑end devices and reduces battery usage.
            </p>
            <div class="performance-image-wrapper" style="display: flex; justify-content: center; align-items: center; min-height: 80px;">
                <div class="tutorial-image-spinner" id="perfSpinner"></div>
                <img id="perfImage" class="tutorial-image" alt="Performance Mode illustration" style="display: none;" />
            </div>
        </div>
    `;
    footer.innerHTML = `
        <button class="whatsnew-close-btn" onclick="closeModal('reportModal')" style="background: var(--glow); border: none; color: #fff; padding: 6px 18px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; transition: all 0.2s ease; box-shadow: 0 4px 12px rgba(168, 66, 255, 0.4);">
            CLOSE
        </button>
    `;

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (!activeModalStack.includes('reportModal')) {
        activeModalStack.push('reportModal');
    }

    loadPerformanceModeImage();
}

// ----- Storage Mode Info Modal -----
async function openStorageModeModal() {
    const modal = document.getElementById('reportModal');
    const title = document.getElementById('reportTitle');
    const content = document.getElementById('reportContent');
    const footer = document.getElementById('reportFooter');

    // Use tutorial-mode styling so headings render purple and lists
    // render as proper disc-bulleted items with purple bullets.
    content.classList.remove('whatsnew-mode');
    content.classList.add('tutorial-mode');

    title.textContent = 'Use Storage';

    content.innerHTML = `
        <h3>Pros of using storage</h3>
        <ul>
            <li><strong>Guaranteed caching:</strong> previously loaded images are always served from the local cache, saving data on repeat visits.</li>
            <li><strong>Full offline support:</strong> images load from the cache even without an internet connection.</li>
            <li><strong>Reliable error placeholders:</strong> proper fallback images appear whenever a CDN fails.</li>
        </ul>

        <h3>Cons of using storage</h3>
        <ul>
            <li><strong>Slower loading:</strong> every image passes through the JavaScript cache pipeline before rendering, so loading speed can be slower than native CDN caching.</li>
        </ul>
    `;

    footer.innerHTML = `
        <button class="whatsnew-close-btn" onclick="closeModal('reportModal')" style="background: var(--glow); border: none; color: #fff; padding: 6px 18px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; transition: all 0.2s ease; box-shadow: 0 4px 12px rgba(168, 66, 255, 0.4);">
            CLOSE
        </button>
    `;

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (!activeModalStack.includes('reportModal')) {
        activeModalStack.push('reportModal');
    }
}

async function loadPerformanceModeImage() {
    const img = document.getElementById('perfImage');
    const spinner = document.getElementById('perfSpinner');
    if (!img || !spinner) return;

    const url = CONFIG.PERFORMANCE_MODE_IMAGE_URL;
    const fallbackUrl = CONFIG.FALLBACK_PERFORMANCE_MODE_IMAGE_URL;
    const cacheName = 'ff-performance-image';
    const cacheKey = 'performance-mode';

    let cachedBlob = null;
    let cache = null;

    try {
        cache = await caches.open(cacheName);
        const cachedResponse = await cache.match(cacheKey);
        if (cachedResponse) {
            cachedBlob = await cachedResponse.blob();
        }
    } catch (e) { /* ignore */ }

    if (cachedBlob) {
        const objectUrl = URL.createObjectURL(cachedBlob);
        setImageBlob(img, objectUrl);
        img.style.display = 'block';
        spinner.style.display = 'none';
        img.onload = () => img.classList.add('loaded');
        img.onerror = () => img.classList.add('loaded');
        if (img.complete && img.naturalWidth > 0) {
            img.classList.add('loaded');
        }
        refreshPerformanceImageInBackground();
        return;
    }

    try {
        const response = await fetchWithFallback(
            url + '?nocache=' + Date.now(),
            fallbackUrl + '?nocache=' + Date.now(),
            { timeout: 15000 }
        );
        const blob = await response.blob();
        if (cache) {
            await cache.put(cacheKey, new Response(blob));
        }
        const objectUrl = URL.createObjectURL(blob);
        setImageBlob(img, objectUrl);
        img.style.display = 'block';
        spinner.style.display = 'none';
        img.onload = () => img.classList.add('loaded');
        img.onerror = () => img.classList.add('loaded');
        if (img.complete && img.naturalWidth > 0) {
            img.classList.add('loaded');
        }
    } catch (err) {
        console.warn('Failed to fetch Performance Mode image:', err);
        spinner.style.display = 'none';
        img.style.display = 'block';
        img.alt = 'Performance Mode illustration (failed to load)';
        img.src = '';
        img.classList.add('loaded');
    }
}

async function refreshPerformanceImageInBackground() {
    try {
        const response = await fetchWithFallback(
            CONFIG.PERFORMANCE_MODE_IMAGE_URL + '?nocache=' + Date.now(),
            CONFIG.FALLBACK_PERFORMANCE_MODE_IMAGE_URL + '?nocache=' + Date.now(),
            { timeout: 15000 }
        );
        const blob = await response.blob();
        const cache = await caches.open('ff-performance-image');
        await cache.put('performance-mode', new Response(blob));

        const img = document.getElementById('perfImage');
        const modal = document.getElementById('reportModal');
        if (img && modal && !modal.classList.contains('hidden')) {
            const objectUrl = URL.createObjectURL(blob);
            if (img.dataset.objectUrl) URL.revokeObjectURL(img.dataset.objectUrl);
            setImageBlob(img, objectUrl);
            img.onload = () => img.classList.add('loaded');
            img.onerror = () => img.classList.add('loaded');
            if (img.complete && img.naturalWidth > 0) {
                img.classList.add('loaded');
            }
        }
    } catch (_) { /* ignore */ }
}

async function fetchTutorialMarkdown() {
    const cache = await caches.open('ff-tutorial');
    const cacheKey = CONFIG.TUTORIAL_MD_URL;
    let cached = null;
    try {
        const cachedResponse = await cache.match(cacheKey);
        if (cachedResponse) cached = await cachedResponse.text();
    } catch (_) {}

    try {
        const response = await fetchWithFallback(
            CONFIG.TUTORIAL_MD_URL + '?nocache=' + Date.now(),
            CONFIG.FALLBACK_TUTORIAL_MD_URL + '?nocache=' + Date.now(),
            { timeout: 10000 }
        );
        const text = await response.text();
        await cache.put(cacheKey, new Response(text));
        return text;
    } catch (err) {
        if (cached) {
            showToast('Failed to refresh tutorial. Showing cached data.');
            return cached;
        }
        throw err;
    }
}

// ----- Enhanced markdown parser: bullet lists, inline links (with URL safety) -----
function parseTutorialMarkdown(md) {
    const lines = md.split('\n');
    let html = '';
    let inList = false;

    for (let line of lines) {
        line = line.trim();

        if (line.toLowerCase() === '<br>') {
            if (inList) {
                html += '</ul>';
                inList = false;
            }
            html += '<br>';
            continue;
        }

        if (line === '') {
            if (inList) {
                html += '</ul>';
                inList = false;
            }
            continue;
        }

        // Headings
        if (line.startsWith('#')) {
            if (inList) {
                html += '</ul>';
                inList = false;
            }
            const level = line.match(/^#+/)[0].length;
            const text = line.replace(/^#+\s*/, '');
            html += `<h${level}>${parseInline(text)}</h${level}>`;
            continue;
        }

        // Bullet list item: starts with "- "
        if (line.startsWith('- ')) {
            const text = line.slice(2).trim();
            const parsed = parseInline(text);
            if (!inList) {
                html += '<ul>';
                inList = true;
            }
            html += `<li>${parsed}</li>`;
            continue;
        }

        // Image placeholder: <img: filename>
        const imgMatch = line.match(/^<img:\s*(.+?)\s*>$/);
        if (imgMatch) {
            if (inList) {
                html += '</ul>';
                inList = false;
            }
            const filename = imgMatch[1].trim();
            html += `<div class="tutorial-image-placeholder" data-filename="${escapeHtml(filename)}"></div>`;
            continue;
        }

        // Normal paragraph
        if (inList) {
            html += '</ul>';
            inList = false;
        }
        html += `<p>${parseInline(line)}</p>`;
    }

    if (inList) html += '</ul>';
    return html;
}

// ----- FIX #4: Safe URL scheme validation -----
function parseInline(text) {
    let escaped = escapeHtml(text);

    // Bold
    escaped = escaped.replace(
        /\*\*(.+?)\*\*/g,
        (match, p1) => `<strong>${p1}</strong>`
    );

    // Links — only allow safe URL schemes.
    escaped = escaped.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        (match, linkText, rawUrl) => {
            const url = rawUrl.trim();

            let safe = false;

            try {
                const parsed = new URL(url, window.location.href);

                safe =
                    parsed.protocol === 'https:' ||
                    parsed.protocol === 'http:' ||
                    parsed.protocol === 'mailto:';
            } catch (_) {
                safe = false;
            }

            if (!safe) {
                return linkText;
            }

            return `<a href="${escapeHtml(url)}"
                target="_blank"
                rel="noopener noreferrer"
                style="color: #2196F3; text-decoration: underline;">${linkText}</a>`;
        }
    );

    return escaped;
}

// ----- HTML escaping helper (used for badges and tutorial) -----
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
}

async function loadTutorialImages(container) {
    const placeholders = container.querySelectorAll('.tutorial-image-placeholder');
    const loadPromises = Array.from(placeholders).map(async (placeholder) => {
        const filename = placeholder.dataset.filename;
        const fullUrl = CONFIG.ONLINE_BASE_URL + filename;
        const fallbackUrl = CONFIG.FALLBACK_ONLINE_BASE_URL + filename;

        const wrapper = document.createElement('div');
        wrapper.className = 'tutorial-image-wrapper';
        placeholder.replaceWith(wrapper);

        const spinner = document.createElement('div');
        spinner.className = 'tutorial-image-spinner';
        wrapper.appendChild(spinner);

        try {
            const { blob, fromCache } = await loadImageWithRetry(fullUrl, {
                fallbackUrl,
                cacheName: 'ff-tutorial-images'
            });
            const objectUrl = URL.createObjectURL(blob);

            const img = document.createElement('img');
            img.alt = filename;
            img.className = 'tutorial-image';
            setImageBlob(img, objectUrl);
            img.onload = () => img.classList.add('loaded');

            wrapper.innerHTML = '';
            wrapper.appendChild(img);

            // loadImageWithRetry already caches the response; no need to put it again.
        } catch (err) {
            console.warn('Failed to load tutorial image:', filename, err);
            wrapper.innerHTML = '';
            const fallbackText = document.createElement('span');
            fallbackText.textContent = `<image: ${filename}>`;
            fallbackText.className = 'tutorial-image-fallback';
            wrapper.appendChild(fallbackText);
        }
    });

    await Promise.all(loadPromises);
}

// --------------------------------------------------------------
//  UPDATE SETTINGS SCROLL-DOWN INDICATOR
// --------------------------------------------------------------
function updateSettingsScrollDown() {
    const body = document.querySelector('.settings-body');
    const btn = document.getElementById('settingsScrollDownBtn');
    if (!body || !btn) return;
    const threshold = 20;
    const isScrollable = body.scrollHeight - body.clientHeight > threshold;
    const isAtBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - threshold;
    if (isScrollable && !isAtBottom) {
        btn.classList.add('visible');
    } else {
        btn.classList.remove('visible');
    }
}

document.getElementById('settingsScrollDownBtn')?.addEventListener('click', function() {
    const body = document.querySelector('.settings-body');
    if (body) {
        body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });
    }
});

// --------------------------------------------------------------
//  FILTER STATUS PILL & VISIBILITY TOGGLE
// --------------------------------------------------------------

filterVisibilityToggle.addEventListener('click', () => {
    filtersHidden = !filtersHidden;
    document.querySelector('.filters-row').style.display = filtersHidden ? 'none' : 'flex';
    // Status row is always visible
    filterVisibilityIcon.innerHTML = filtersHidden
        ? '<path d="M4 8l8 8 8-8" stroke="currentColor" stroke-width="2" fill="none"/>'
        : '<path d="M4 16l8-8 8 8" stroke="currentColor" stroke-width="2" fill="none"/>';
});

// --------------------------------------------------------------
//  STARTUP INITIALIZATION
// --------------------------------------------------------------
window.addEventListener('DOMContentLoaded', async () => {
    // Fire-and-forget: version fetch must NOT block DB loading,
    // especially when offline where the SW fetch can hang.
    fetchSWVersion().catch(err => {
        console.warn('fetchSWVersion failed:', err);
    });

    loadFavorites();
    loadFavState();

    if (sessionStorage.getItem('webapp_updated') === 'true') {
        isUpdateReload = true;
        sessionStorage.removeItem('webapp_updated');

        await versionPromise;
        const storedVersion = localStorage.getItem('new_sw_version');
        if (storedVersion) {
            localStorage.removeItem('new_sw_version');
        }
        const versionMsg = storedVersion || WEBAPP_VERSION || 'latest';

        setTimeout(() => {
            showToast(`Updated to WebApp version: ${versionMsg}`);
        }, 300);
    } else {
        isUpdateReload = false;
    }

    loadSettings();
    initStorageTracking();
    const workerSupported = initWorker();
    if (!workerSupported) {
        console.warn('Web Worker not available, falling back to main-thread parsing.');
    }
    initDatabase();

    loadAuthorImageWithCache();

    searchInput.addEventListener('input', applyFilters);
    tagFilter.addEventListener('change', applyFilters);
    typeFilter.addEventListener('change', applyFilters);
    rareFilter.addEventListener('change', applyFilters);

    document.getElementById('settingsCloseBtn')?.addEventListener('click', () => {
        closeModal('settingsModal');
    });

    document.getElementById('performanceInfoBtn')?.addEventListener('click', function(e) {
        e.stopPropagation();
        openPerformanceModeModal();
    });
    document.getElementById('storageInfoBtn')?.addEventListener('click', function(e) {
        e.stopPropagation();
        openStorageModeModal();
    });

    // Ensure catalog tab is active on load (the HTML already has it, but just in case)
    ensureCatalogTabActive();
});