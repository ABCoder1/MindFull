export const DEFAULT_SETTINGS = {
    groqAPIKey: "",
    backendUrl: "",
    autoExport: "disabled",
    exportFormat: "txt",
    chatPromptMode: "detailed",
    contextWindowChat: 8000,
    contextWindowSuggestion: 5000,
    suggestionPromptCore: "",
    chatPromptDetailedCore: "",
    chatPromptConciseCore: "",
};

export const SUGGESTION_TYPE_LABELS = {
    question: "Question To Ask",
    "talking-point": "Talking Point",
    answer: "Answer",
    fact: "Fact-Check",
};

export function normalizeBackendUrl(value) {
    return (value || "").trim().replace(/\/+$/, "");
}

export function getBackendUrlOverride() {
    if (typeof localStorage === "undefined") {
        return "";
    }

    return normalizeBackendUrl(localStorage.getItem("backendUrl") || "");
}

export function setBackendUrlOverride(value) {
    const normalized = normalizeBackendUrl(value);

    if (normalized) {
        localStorage.setItem("backendUrl", normalized);
        return;
    }

    localStorage.removeItem("backendUrl");
}

export function buildApiUrl(endpoint) {
    const baseUrl = getBackendUrlOverride();
    const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    return `${baseUrl}${path}`;
}
