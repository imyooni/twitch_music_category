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


const TWITCH_CLIENT_ID = "3cyc5tkc6lih3tx28l66dsnqjmqz0w";
const TWITCH_REDIRECT_URI = "https://imyooni.github.io/twitch_music_category/";
const API_URL = "https://api.twitch.tv/helix";
const defaul_api_url = "https://zuljanim.onrender.com"
const PAGE_SIZE = 20;
const REFRESH_INTERVAL_MS = 60000 * 5;
let allStreams = [];
let followedUserIds = new Set();
let currentPage = 0;
let pianoOnly = false;
let koreanOnly = false;
let twitchAccessToken = localStorage.getItem("twitch_access_token");

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
const profilePic = document.getElementById("profilePic");

const profileButton = document.getElementById("profileButton");
const profileDropdown = document.getElementById("profileDropdown");
const logoutButton = document.getElementById("logoutButton");

const loadingLabel = document.getElementById("loadingLabel");
const streamContent = document.getElementById("streamContent");
const loginRequired = document.getElementById("loginRequired");

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

        const streams = [];
        let cursor = null;

        do {
            const url = new URL(`${API_URL}/streams`);
            url.searchParams.set("first", "100");
            url.searchParams.set("game_id", "26936");

            if (cursor) url.searchParams.set("after", cursor);

            const response = await fetch(url, {
                headers: {
                    "Client-ID": TWITCH_CLIENT_ID,
                    ...(twitchAccessToken
                        ? { Authorization: `Bearer ${twitchAccessToken}` }
                        : {})
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            streams.push(...(result.data || []));
            cursor = result.pagination?.cursor || null;
        } while (cursor && streams.length < 500);

        const uniqueStreams = new Map();

        for (const stream of streams) {
            if (!stream.user_id || uniqueStreams.has(stream.user_id)) {
                continue;
            }

            uniqueStreams.set(stream.user_id, {
                ...stream,
                profileImageUrl: "",
                description: "",
                broadcasterType: "",
                tags: stream.tags || []
            });
        }

        allStreams = Array.from(uniqueStreams.values());

        // Load profile images, descriptions, and broadcaster types.
        const headers = {
            "Client-ID": TWITCH_CLIENT_ID,
            ...(twitchAccessToken
                ? { Authorization: `Bearer ${twitchAccessToken}` }
                : {})
        };

        for (let i = 0; i < allStreams.length; i += 100) {
            const batch = allStreams.slice(i, i + 100);
            const url = new URL(`${API_URL}/users`);

            batch.forEach(stream => {
                url.searchParams.append("id", stream.user_id);
            });

            const response = await fetch(url, { headers });

            if (!response.ok) continue;

            const result = await response.json();
            const users = new Map(
                (result.data || []).map(user => [user.id, user])
            );

            batch.forEach(stream => {
                const user = users.get(stream.user_id);
                if (!user) return;

                stream.profileImageUrl = user.profile_image_url || "";
                stream.description = user.description || "";
                stream.broadcasterType = user.broadcaster_type || "";
            });
        }

        currentPage = 0;
        render();
    } catch (error) {
        console.error("❌ Failed to load Music streams:", error);

        if (!allStreams.length) {
            if (followingList) {
                followingList.innerHTML =
                    `<div class="empty">Failed to load streams.</div>`;
            }

            if (discoverList) {
                discoverList.innerHTML =
                    `<div class="empty">Failed to load streams.</div>`;
            }
        }

        if (pagination) pagination.classList.add("hidden");
    } finally {
        setLoading(false);
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
    const state = crypto.randomUUID();
    sessionStorage.setItem("twitch_oauth_state", state);

    const params = new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        redirect_uri: TWITCH_REDIRECT_URI,
        response_type: "token",
        scope: "user:read:follows",
        state
    });

    window.location.href =
        `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
}

function clearTwitchSession() {
    localStorage.removeItem("twitch_access_token");
    localStorage.removeItem("twitch_refresh_token");
    localStorage.removeItem("twitch_user");

    twitchAccessToken = null;
    followedUserIds = new Set();

    if (profilePic) {
        profilePic.classList.add("hidden");
        profilePic.removeAttribute("src");
    }

    if (loginButton) loginButton.classList.remove("hidden");
    if (loginRequired) {
        loginRequired.classList.remove("hidden");
    }

    if (streamContent) {
        streamContent.classList.add("hidden");
    }

    if (loadingLabel) {
        loadingLabel.classList.add("hidden");
    }

    if (pagination) {
        pagination.classList.add("hidden");
    }

    render();
}

async function handleTwitchAuth() {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("access_token");

    if (!accessToken) return false;

    const returnedState = params.get("state");
    const expectedState = sessionStorage.getItem("twitch_oauth_state");

    if (!expectedState || returnedState !== expectedState) {
        console.error("❌ Invalid Twitch OAuth state.");
        return false;
    }

    sessionStorage.removeItem("twitch_oauth_state");

    window.history.replaceState(
        {},
        document.title,
        window.location.pathname + window.location.search
    );

    localStorage.setItem("twitch_access_token", accessToken);
    twitchAccessToken = accessToken;

    await loadTwitchUser(accessToken);
    return true;
}

async function loadTwitchUser(accessToken) {
    try {
        const validation = await fetch(
            "https://id.twitch.tv/oauth2/validate",
            {
                headers: { Authorization: `OAuth ${accessToken}` }
            }
        );

        if (!validation.ok) {
            clearTwitchSession();
            return;
        }

        const tokenInfo = await validation.json();

        if (tokenInfo.client_id !== TWITCH_CLIENT_ID) {
            clearTwitchSession();
            return;
        }

        const response = await fetch(`${API_URL}/users`, {
            headers: {
                "Client-ID": TWITCH_CLIENT_ID,
                Authorization: `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        const user = result.data?.[0];

        if (!user) throw new Error("Twitch user not found.");

        localStorage.setItem("twitch_user", JSON.stringify(user));
        updateTwitchProfile(user);

        await loadFollowedChannels(accessToken, user.id);
    } catch (error) {
        console.error("❌ Failed to load Twitch user:", error);
    }
}

async function loadFollowedChannels(accessToken, userId) {
    try {
        const allFollows = [];
        let cursor = null;

        do {
            const url = new URL(`${API_URL}/channels/followed`);
            url.searchParams.set("user_id", userId);
            url.searchParams.set("first", "100");

            if (cursor) url.searchParams.set("after", cursor);

            const response = await fetch(url, {
                headers: {
                    "Client-ID": TWITCH_CLIENT_ID,
                    Authorization: `Bearer ${accessToken}`
                }
            });

            if (response.status === 401) {
                clearTwitchSession();
                return false;
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            allFollows.push(...(result.data || []));
            cursor = result.pagination?.cursor || null;
        } while (cursor);

        setFollowedUserIds(
            allFollows.map(follow => String(follow.broadcaster_id))
        );

        return true;
    } catch (error) {
        console.error("❌ Failed to load followed channels:", error);
        return false;
    }
}

function setFollowedUserIds(ids) {
    followedUserIds = new Set(Array.isArray(ids) ? ids.map(String) : []);
    currentPage = 0;
    render();
}

function updateTwitchProfile(user) {
    if (profilePic && user?.profile_image_url) {
        profilePic.src = user.profile_image_url;
        profilePic.classList.remove("hidden");
    }

    if (loginButton) {
        loginButton.classList.add("hidden");
    }
}

async function restoreTwitchLogin() {
    const accessToken = localStorage.getItem("twitch_access_token");

    if (!accessToken) return;

    twitchAccessToken = accessToken;

    // Display the saved profile immediately.
    try {
        const savedUser = JSON.parse(
            localStorage.getItem("twitch_user") || "null"
        );

        if (savedUser) {
            updateTwitchProfile(savedUser);
        }
    } catch (error) {
        console.error("Failed to restore saved Twitch profile:", error);
    }

    // Refresh the profile from Twitch.
    await loadTwitchUser(accessToken);
}

async function refreshTwitchToken() {
    const refreshToken = localStorage.getItem("twitch_refresh_token");

    if (!refreshToken) {
        console.warn("⚠️ No Twitch refresh token available.");
        return null;
    }

    try {
        const response = await fetch(
            `${defaul_api_url}/twitch_music/refresh`,
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
            console.error("❌ Twitch refresh failed:",
                response.status,
                data
            );

            clearTwitchSession();
            return null;
        }

        if (!data.access_token) {
            console.error(
                "❌ No access token returned"
            );

            clearTwitchSession();
            return null;
        }

        localStorage.setItem("twitch_access_token", data.access_token);

        if (data.refresh_token) {
            localStorage.setItem("twitch_refresh_token", data.refresh_token);
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
    const freshLogin = await handleTwitchAuth();

    if (!freshLogin) {
        await restoreTwitchLogin();
    }

    if (!twitchAccessToken) {
        if (loginRequired) {
            loginRequired.classList.remove("hidden");
        }

        if (loadingLabel) {
            loadingLabel.classList.add("hidden");
        }

        if (streamContent) {
            streamContent.classList.add("hidden");
        }

        if (pagination) {
            pagination.classList.add("hidden");
        }

        return;
    }

    if (loginRequired) {
        loginRequired.classList.add("hidden");
    }

    await loadStreams();
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
