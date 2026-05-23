const SEARCH_URL = import.meta.env.VITE_N8N_SEARCH_URL || "";
const LIBRARY_WEBHOOK_URL = import.meta.env.VITE_N8N_LIBRARY_WEBHOOK_URL || "";

const EXACT_AUTO_FILES = {
  trade_license: ["TRADE LICENSE.pdf"],
  iso_cert: ["ISO certificate.pdf"],
  msds: ["10. PROJECT REFERENCE LIST.pdf"],
};

const normalizeDriveName = (name) => String(name || "")
  .toLowerCase()
  .replace(/\.[a-z0-9]+$/i, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const libraryFilesFromResponse = (data) => {
  if (!data) return [];
  if (Array.isArray(data.files)) return data.files;
  if (Array.isArray(data.data?.files)) return data.data.files;
  if (Array.isArray(data.items)) return data.items.filter(item => item && item.id && item.name && item.mimeType !== "application/vnd.google-apps.folder");
  if (Array.isArray(data)) return data.filter(item => item && item.id && item.name && item.mimeType !== "application/vnd.google-apps.folder");
  return [];
};

const scoreFile = (file, key, terms = []) => {
  const fileName = normalizeDriveName(file?.name);
  if (!fileName) return 0;

  for (const exactName of EXACT_AUTO_FILES[key] || []) {
    const wanted = normalizeDriveName(exactName);
    if (fileName === wanted) return 1000;
    if (fileName.includes(wanted) || wanted.includes(fileName)) return 900;
  }

  return terms.reduce((best, term) => {
    const wanted = normalizeDriveName(term);
    if (!wanted) return best;
    if (fileName === wanted) return Math.max(best, 500);
    if (fileName.includes(wanted)) return Math.max(best, 200 + wanted.length);
    return best;
  }, 0);
};

const findBestMatches = (files, queries) => {
  const matches = {};
  Object.entries(queries || {}).forEach(([key, terms]) => {
    const best = files.reduce((winner, file) => {
      const score = scoreFile(file, key, terms);
      return score > winner.score ? { file, score } : winner;
    }, { file:null, score:0 });
    if (best.file && best.score > 0) matches[key] = best.file;
  });
  return matches;
};

const parseSearchBody = async (input, init) => {
  const body = init?.body || (input instanceof Request ? await input.clone().text() : "");
  if (!body) return null;
  try { return JSON.parse(body); } catch { return null; }
};

const searchRequestUrl = (input) => typeof input === "string" ? input : input?.url || "";

if (typeof window !== "undefined" && typeof window.fetch === "function" && !window.__submittalDriveAutoMatchPatch) {
  window.__submittalDriveAutoMatchPatch = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const url = searchRequestUrl(input);
    const isSearchRequest = SEARCH_URL ? url === SEARCH_URL : url.includes("/submittal-search");
    if (!isSearchRequest) return originalFetch(input, init);

    const searchBody = await parseSearchBody(input, init);
    const queries = searchBody?.queries || {};
    const rootMatches = {};

    if (LIBRARY_WEBHOOK_URL) {
      try {
        const libraryResponse = await originalFetch(LIBRARY_WEBHOOK_URL);
        if (libraryResponse.ok) {
          const libraryData = await libraryResponse.json();
          Object.assign(rootMatches, findBestMatches(libraryFilesFromResponse(libraryData), queries));
        }
      } catch {
        // The original search remains the fallback when the root library cannot be read.
      }
    }

    const exactQueries = Object.fromEntries(
      Object.entries(queries).map(([key, terms]) => [key, EXACT_AUTO_FILES[key] || terms])
    );
    const searchInit = {
      ...(init || {}),
      body: JSON.stringify({ ...(searchBody || {}), queries: exactQueries }),
    };
    const searchInput = typeof input === "string" ? input : url;

    try {
      const searchResponse = await originalFetch(searchInput, searchInit);
      const searchData = await searchResponse.clone().json();
      return new Response(JSON.stringify({
        ...searchData,
        success: searchData.success !== false,
        matches: { ...(searchData.matches || {}), ...rootMatches },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify({
        success: true,
        matches: rootMatches,
        fileCount: Object.keys(rootMatches).length,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  };
}
