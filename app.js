const style = document.createElement('style');
style.textContent = `
  * {
    user-select: none !important;
    -webkit-user-select: none !important;
    -moz-user-select: none !important;
    -ms-user-select: none !important;
  }
`;
document.head.appendChild(style);

const API_URL = "https://zuljababot.onrender.com/twitch_music/streams";
const TWITCH_CLIENT_ID = "3cyc5tkc6lih3tx28l66dsnqjmqz0w";
const TWITCH_REDIRECT_URI = "https://zuljababot.onrender.com/twitch_music/callback";
const PAGE_SIZE = 20;
const REFRESH_INTERVAL_MS = 120000;
let allStreams = [];
let followedUserIds = new Set();
let currentPage = 0;
let pianoOnly = false;
let koreanOnly = false;

// ============================================================
// DOM
// ============================================================

const followingList = document.getElementById("followingList");
const discoverList = document.getElementById("discoverList");

const pagination = document.getElementById("pagination");
const previousPage = document.getElementById("previousPage");
const nextPage = document.getElementById("nextPage");
const pageNumber = document.getElementById("pageNumber");

const pianoButton = document.getElementById("pianoButton");
const koreanButton = document.getElementById("koreanButton");
const loginButton = document.getElementById("loginButton");
const authContainer = document.getElementById("authContainer");
const profilePic = document.getElementById("profilePic");

const profileButton = document.getElementById("profileButton");
const profileDropdown = document.getElementById("profileDropdown");
const logoutButton = document.getElementById("logoutButton");

const loadingLabel = document.getElementById("loadingLabel");
const streamContent = document.getElementById("streamContent");



// ============================================================
// HELPERS
// ============================================================

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function normalize(value) {
    return String(value ?? "").trim().toLowerCase();
}

function hasPianoTag(tags) {
    if (!Array.isArray(tags)) {
        return false;
    }

    return tags.some(tag => {
        const value = normalize(tag);
        return value === "piano" || value === "pianist";
    });
}

function hasKoreanTag(tags) {
    if (!Array.isArray(tags)) {
        return false;
    }

    return tags.some(tag => {
        const value = normalize(tag);
        return value === "korean" || value === "한국어" || value === "한국";
    });
}


function isFollowed(stream) {
    return followedUserIds.has(String(stream.user_id));
}

// ============================================================
// LOAD MUSIC CACHE
// ============================================================

async function loadStreams() {
    try {
        setLoading(true);

        const response = await fetch(`${API_URL}?_=${Date.now()}`, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();

        if (!Array.isArray(result.data)) {
            console.error("❌ API data is not an array:", result.data);
            allStreams = [];
        } else {
            const uniqueStreams = new Map();

            for (const stream of result.data) {
                const userId = String(stream.user_id || "");

                if (!userId) {
                    continue;
                }

                if (!uniqueStreams.has(userId)) {
                    uniqueStreams.set(userId, stream);
                }
            }

            allStreams = Array.from(uniqueStreams.values());
        }

        currentPage = 0;
        setLoading(false);
        render();
    } catch (error) {
        console.error("❌ Failed to load Music streams:", error);
        setLoading(false);

        if (!allStreams.length) {
            if (followingList) followingList.innerHTML = `<div class="empty">Failed to load streams.</div>`;
            if (discoverList) discoverList.innerHTML = `<div class="empty">Failed to load streams.</div>`;
        }

        if (pagination) pagination.classList.add("hidden");
    }
}

// ============================================================
// FOLLOWED STREAMS
// ============================================================

function getFollowedStreams() {
    if (!followedUserIds.size) return [];
    return allStreams.filter(s => followedUserIds.has(String(s.user_id)));
}

function getDiscoverStreams() {
    return allStreams
        .filter(s => !followedUserIds.has(String(s.user_id)))
        .filter(s => !pianoOnly || hasPianoTag(s.tags))
        .filter(s => !koreanOnly || hasKoreanTag(s.tags));
}

// ============================================================
// PAGINATION
// ============================================================

function createPages(streams) {
    const pages = [];

    for (let i = 0; i < streams.length; i += PAGE_SIZE) {
        pages.push(streams.slice(i, i + PAGE_SIZE));
    }

    return pages;
}

// ============================================================
// RENDER
// ============================================================

function render() {
    renderFollowing();
    renderDiscover();
    renderPagination();
    renderFilters();
}

// ============================================================
// FOLLOWING
// ============================================================

function renderFollowing() {
    if (!followingList) return;

    if (!allStreams.length) {
        followingList.innerHTML = `<div class="empty">불러오는 중...</div>`;
        return;
    }

    const streams = getFollowedStreams();
    if (!streams.length) {
        followingList.innerHTML = `<div class="empty">현재 음악 카테고리에서 팔로우한 스트리머 중 방송 중인 스트리머가 없습니다.</div>`;
        return;
    }
    followingList.innerHTML = streams.map(renderStream).join("");
}

// ============================================================
// DISCOVER
// ============================================================

function renderDiscover() {
    if (!discoverList) {
        return;
    }

    const streams = getDiscoverStreams();
    const pages = createPages(streams);

    if (!streams.length) {
        discoverList.innerHTML = `<div class="empty">현재 다른 음악 스트리머가 없습니다.</div>`;
        return;
    }

    const pageCount = pages.length;

    currentPage = Math.max(0, Math.min(currentPage, pageCount - 1));

    const pageStreams = pages[currentPage] || [];

    discoverList.innerHTML = pageStreams.map(stream => renderStream(stream)).join("");
}

// ============================================================
// PAGINATION UI
// ============================================================

function renderPagination() {
    if (!pagination) {
        return;
    }

    const streams = getDiscoverStreams();
    const pages = createPages(streams);

    pagination.classList.remove("hidden");

    const pageCount = Math.max(1, pages.length);

    currentPage = Math.max(0, Math.min(currentPage, pageCount - 1));

    if (pageNumber) {
        pageNumber.textContent = `${currentPage + 1} / ${pageCount}`;
    }

    if (previousPage) {
        previousPage.disabled = currentPage <= 0;
    }

    if (nextPage) {
        nextPage.disabled = currentPage >= pageCount - 1;
    }
}

// ============================================================
// STREAM CARD
// ============================================================

function getBroadcasterClass(stream) {
    const type = String(stream.broadcasterType || "").toLowerCase();

    if (type === "partner") {
        return "partner";
    }

    if (type === "affiliate") {
        return "affiliate";
    }

    return "normal";
}

function normalizeTag(value) {
    return String(value ?? "").trim().toLowerCase();
}

const languageNames = new Set();
const locales = [
    ...navigator.languages,
    navigator.language,
    "en", "es", "ko", "ja", "zh", "fr", "de", "it",
    "pt", "ru", "ar", "nl", "pl", "tr", "sv", "da",
    "no", "fi", "cs", "hu", "el", "he", "th", "vi",
    "id", "ms", "uk", "ro", "sk", "bg", "hr", "sr",
    "sl", "et", "lv", "lt"
];

for (const locale of locales) {
    try {
        const languageCode = locale.split("-")[0];

        if (!languageCode) continue;

        const normalizedCode = normalizeTag(languageCode);

        if (normalizedCode.length >= 2) {
            languageNames.add(normalizedCode);
        }

        const englishName = new Intl.DisplayNames(["en"], { type: "language" }).of(languageCode);

        if (englishName) {
            const normalizedEnglish = normalizeTag(englishName);

            if (normalizedEnglish.length >= 2) {
                languageNames.add(normalizedEnglish);
            }
        }

        const localizedName = new Intl.DisplayNames([locale], { type: "language" }).of(languageCode);

        if (localizedName) {
            const normalizedLocalized = normalizeTag(localizedName);

            if (normalizedLocalized.length >= 2) {
                languageNames.add(normalizedLocalized);
            }
        }
    } catch {

    }
}

function isKoreanTag(tag) {
    const normalized = normalizeTag(tag);

    return (
        normalized === "korean" ||
        tag === "한국어" ||
        tag === "한국" ||
        normalized === "ko" ||
        normalized === "kor"
    );
}

function isPianoTag(tag) {
    const normalized = normalizeTag(tag);
    return normalized === "piano" || normalized === "pianist";
}

function isLanguageTag(tag) {
    const normalized = normalizeTag(tag);
    return isKoreanTag(tag) || languageNames.has(normalized);
}

function sortTags(tags) {
    const uniqueTags = [];
    const seen = new Set();

    for (const tag of tags) {
        const value = String(tag ?? "").trim();
        const normalized = value.toLowerCase();

        if (!normalized) {
            continue;
        }

        if (seen.has(normalized)) {
            continue;
        }

        seen.add(normalized);
        uniqueTags.push(value);
    }

    return uniqueTags.sort((a, b) => {
        const aPiano = isPianoTag(a);
        const bPiano = isPianoTag(b);

        if (aPiano !== bPiano) {
            return bPiano - aPiano;
        }

        const aKorean = isKoreanTag(a);
        const bKorean = isKoreanTag(b);

        if (aKorean !== bKorean) {
            return bKorean - aKorean;
        }

        const aLanguage = isLanguageTag(a);
        const bLanguage = isLanguageTag(b);

        if (aLanguage !== bLanguage) {
            return bLanguage - aLanguage;
        }

        return String(a).localeCompare(String(b));
    });
}

function renderStream(stream) {
    const username = stream.user_name || stream.user_login || "Unknown";
    const login = stream.user_login || "";
    const title = stream.title || "Untitled stream";
    const viewerCount = Number(stream.viewer_count || 0);
    const profileImage = stream.profileImageUrl || "";

    const tags = sortTags(
        Array.isArray(stream.tags) ? stream.tags : []
    );

    const description = stream.description || "설명 없음";
    const broadcasterClass = getBroadcasterClass(stream);

    return `
        <div
            class="stream-row ${isFollowed(stream) ? "following" : broadcasterClass}"
            data-user-id="${escapeHtml(stream.user_id)}"
            data-user-login="${escapeHtml(login)}"
        >

            <div class="stream-avatar-wrapper ${broadcasterClass}">

                ${profileImage
            ? `
                            <img
                                class="stream-avatar ${broadcasterClass}"
                                src="${escapeHtml(profileImage)}"
                                alt="${escapeHtml(username)}"
                                loading="lazy"
                                onerror="this.style.display='none'"
                            >
                        `
            : `
                            <div class="stream-avatar-placeholder ${broadcasterClass}">
                                ${escapeHtml(
                username.charAt(0).toUpperCase()
            )}
                            </div>
                        `
        }

            </div>


            <div class="stream-info">

                <!-- TITLE + WATCH -->
                <div class="stream-title-row">

                    <div
                        class="stream-title"
                    >
                        ${escapeHtml(title)}
                    </div>

                    <button
                        class="watch-button"
                        onclick="window.open(
                            'https://www.twitch.tv/${escapeHtml(login)}',
                            '_blank'
                        )"
                    >
                        시청하기
                    </button>

                </div>


                <!-- USERNAME -->
                <div class="stream-user ${isFollowed(stream) ? "following" : broadcasterClass}">

                    ${String(stream.broadcasterType || "")
            .trim()
            .toLowerCase() === "partner"
            ? `
                                <img
                                    class="partner-badge"
                                    src="https://static-cdn.jtvnw.net/badges/v1/d12a2e27-16f6-41d0-ab77-b780518f00a3/3"
                                    alt=""
                                >
                            `
            : ""
        }

                    ${escapeHtml(username)}

                    ${stream.user_login &&
            stream.user_login.toLowerCase() !==
            username.toLowerCase()
            ? `
                                <span class="stream-login">
                                    (${escapeHtml(stream.user_login)})
                                </span>
                            `
            : ""
        }

                </div>


                <!-- VIEWERS -->
                <div class="stream-meta">

                    <span class="live-indicator"></span>

                    <span>
                        ${viewerCount.toLocaleString()} Viewers
                    </span>

                </div>


                <!-- TAGS -->
                ${tags.length
            ? `
                            <div class="stream-tags">
                                ${tags
                .map(tag => renderTag(tag))
                .join("")}
                            </div>
                        `
            : ""
        }


                <!-- DESCRIPTION -->
                ${description.trim()
            ? `
            <div class="stream-description ${isFollowed(stream) ? "following" : broadcasterClass}">
                ${escapeHtml(description)}
            </div>
        `
            : ""
        }

            </div>

        </div>
    `;
}


// ============================================================
// TAG
// ============================================================

function renderTag(tag) {
    const value = String(tag ?? "");

    let className = "tag";

    if (isPianoTag(value)) {
        className += " piano";
    } else if (isKoreanTag(value)) {
        className += " korean";
    } else if (isLanguageTag(value)) {
        className += " language";
    }

    return `
        <span class="${className}">
            ${escapeHtml(value)}
        </span>
    `;
}

// ============================================================
// FILTER BUTTONS
// ============================================================

function renderFilters() {
    if (pianoButton) {
        pianoButton.classList.toggle("active", pianoOnly);
    }

    if (koreanButton) {
        koreanButton.classList.toggle("active", koreanOnly);
    }
}

if (pianoButton) {
    pianoButton.addEventListener("click", () => {
        pianoOnly = !pianoOnly;
        currentPage = 0;
        render();
    });
}

if (koreanButton) {
    koreanButton.addEventListener("click", () => {
        koreanOnly = !koreanOnly;
        currentPage = 0;
        render();
    });
}

// ============================================================
// PAGINATION BUTTONS
// ============================================================

if (previousPage) {
    previousPage.addEventListener("click", () => {
        if (currentPage <= 0) {
            return;
        }

        currentPage--;
        render();

    });
}

if (nextPage) {
    nextPage.addEventListener("click", () => {
        const streams = getDiscoverStreams();
        const pages = createPages(streams);

        if (currentPage >= pages.length - 1) {
            return;
        }

        currentPage++;
        render();

    });
}

// ============================================================
// TWITCH LOGIN / FOLLOWING
// ============================================================

function loginWithTwitch() {
    const params = new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        redirect_uri: TWITCH_REDIRECT_URI,
        response_type: "code",
        scope: "user:read:follows",
        state: "pc"
    });

    window.location.href = `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
}

function clearTwitchSession() {
    localStorage.removeItem("twitch_access_token");
    localStorage.removeItem("twitch_refresh_token");
    localStorage.removeItem("twitch_user");
    followedUserIds = new Set();
    if (profilePic) profilePic.classList.add("hidden");
    if (loginButton) loginButton.classList.remove("hidden");
    render();
}

async function handleTwitchAuth() {
    const params = new URLSearchParams(window.location.search);

    if (params.get("twitch_auth") !== "1") {
        return false;
    }

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken) {
        console.error("❌ Twitch authentication returned without access token");
        return false;
    }

    localStorage.setItem("twitch_access_token", accessToken);

    if (refreshToken) {
        localStorage.setItem("twitch_refresh_token", refreshToken);
    }

    window.history.replaceState({}, document.title, window.location.pathname);
    await loadTwitchUser(accessToken);
    return true;
}

async function loadTwitchUser(accessToken) {
    try {

        const response = await fetch(
            "https://api.twitch.tv/helix/users",
            {
                headers: {
                    "Client-ID": TWITCH_CLIENT_ID,
                    "Authorization": `Bearer ${accessToken}`
                }
            }
        );

        if (response.status === 401) {
            console.warn(
                "⚠️ Twitch access token expired. Refreshing..."
            );

            const newToken = await refreshTwitchToken();

            if (!newToken) {
                return;
            }

            return loadTwitchUser(newToken);
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        const user = result.data?.[0];

        if (!user) {
            throw new Error("Twitch user not found");
        }

        localStorage.setItem("twitch_user",JSON.stringify(user));

        updateTwitchProfile(user);

        await loadFollowedChannels(accessToken,user.id);

    } catch (error) {
        console.error(
            "❌ Failed to load Twitch user:",
            error
        );
    }
}

async function loadFollowedChannels(accessToken, userId) {
    try {
        const allFollows = [];
        let cursor = null;

        do {
            const url = new URL(
                "https://api.twitch.tv/helix/channels/followed"
            );

            url.searchParams.set("user_id", userId);
            url.searchParams.set("first", "100");

            if (cursor) {
                url.searchParams.set("after", cursor);
            }

            const response = await fetch(url.toString(), {
                headers: {
                    "Client-ID": TWITCH_CLIENT_ID,
                    "Authorization": `Bearer ${accessToken}`
                }
            });

            if (response.status === 401) {
                console.warn("⚠️ Twitch access token expired. Refreshing...");
                const newToken = await refreshTwitchToken();
                if (!newToken) {
                    console.warn("❌ Could not refresh Twitch token.");
                    return false;
                }
                return loadFollowedChannels(newToken, userId);
            }
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            const follows = result.data || [];
            allFollows.push(...follows);
            cursor = result.pagination?.cursor || null;
        } while (cursor);
        const ids = allFollows.map(
            follow => String(follow.broadcaster_id)
        );
        setFollowedUserIds(ids);
        return true;

    } catch (error) {
        console.error(
            "❌ Failed to load followed channels:",
            error
        );

        return false;
    }
}

function setFollowedUserIds(ids) {
    followedUserIds = new Set(Array.isArray(ids) ? ids.map(String) : []);
    currentPage = 0;
    render();
}

function updateTwitchProfile(user) {
    if (profilePic && user.profile_image_url) {
        profilePic.src = user.profile_image_url;
        profilePic.classList.remove("hidden");
    }

    if (loginButton) {
        loginButton.classList.add("hidden");
    }
}

async function restoreTwitchLogin() {
    const accessToken = localStorage.getItem("twitch_access_token");
    const refreshToken = localStorage.getItem("twitch_refresh_token");

    if (!accessToken && !refreshToken) {
        return;
    }

    try {
        if (accessToken) {
            await loadTwitchUser(accessToken);
            return;
        }

        if (refreshToken) {
            console.log("⚠️ No access token. Refreshing Twitch token...");
            const newToken = await refreshTwitchToken();
            if (!newToken) {
                return;
            }
            await loadTwitchUser(newToken);
        }
    } catch (error) {
        console.error("❌ Failed to restore Twitch login:", error);
    }
}

async function refreshTwitchToken() {
    const refreshToken = localStorage.getItem("twitch_refresh_token");

    if (!refreshToken) {
        console.warn("⚠️ No Twitch refresh token available.");
        return null;
    }

    try {
        const response = await fetch(
            "https://zuljababot.onrender.com/twitch_music/refresh",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    refresh_token: refreshToken
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error("❌ Twitch refresh failed:", response.status, data);
            return null;
        }

        if (!data.access_token) {
            console.error( "❌ No access token returned" );
            return null;
        }

        localStorage.setItem("twitch_access_token",data.access_token);

        if (data.refresh_token) {
            localStorage.setItem(
                "twitch_refresh_token",
                data.refresh_token
            );
        }
        return data.access_token;
    } catch (error) {
        console.error(
            "❌ Twitch refresh request failed:",
            error
        );
        return null;
    }
}


if (loginButton) {
    loginButton.addEventListener("click", loginWithTwitch);
}

// ============================================================
// INITIAL LOAD
// ============================================================

function setLoading(loading) {
    if (loadingLabel) {
        loadingLabel.classList.toggle("hidden", !loading);
    }

    if (streamContent) {
        streamContent.classList.toggle("hidden", loading);
    }
}

async function initializeApp() {
    try {
        const freshLogin = await handleTwitchAuth();

        if (!freshLogin) {
            await restoreTwitchLogin();
        }

        await loadStreams();
    } finally {
        if (authContainer) {
            authContainer.classList.remove("auth-loading");
        }
    }
}

initializeApp();

// ============================================================
// CLICK EVENTS
// ============================================================

document.addEventListener("click", (event) => {
    const row = event.target.closest(".stream-row");

    if (!row) return;

    if (event.target.closest(".watch-button")) return;

    row.classList.toggle("expanded");
});

if (profileButton && profileDropdown) {
    profileButton.addEventListener("click", (event) => {
        event.stopPropagation();

        profileDropdown.classList.toggle("hidden");
    });
}

if (logoutButton) {
    logoutButton.addEventListener("click", () => {
        clearTwitchSession();

        profileDropdown?.classList.add("hidden");
    });
}

document.addEventListener("click", (event) => {
    if (
        profileDropdown &&
        !event.target.closest(".profile-menu-container")
    ) {
        profileDropdown.classList.add("hidden");
    }
});

// ============================================================
// AUTOMATIC REFRESH
// ============================================================

setInterval(loadStreams, REFRESH_INTERVAL_MS);
