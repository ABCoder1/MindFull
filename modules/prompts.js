export const promptAssets = {
    suggestionsContext: "",
    chatContext: "",
};

export const promptDefaults = {
    suggestionCore: "",
    chatDetailedCore: "",
    chatConciseCore: "",
};

function asMultilineText(value) {
    return Array.isArray(value) ? value.join("\n") : String(value || "");
}

export async function loadPrompts() {
    const response = await fetch("/prompts.json");
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    return {
        suggestionsPrompt: asMultilineText(data.suggestionsPrompt),
        suggestionsContext: asMultilineText(data.suggestionsContext),
        chatPromptDetailed: asMultilineText(data.chatPromptDetailed),
        chatPromptConcise: asMultilineText(data.chatPromptConcise),
        chatContext: asMultilineText(data.chatContext),
    };
}

export const promptsReady = loadPrompts().then((loadedPrompts) => {
    promptAssets.suggestionsContext = loadedPrompts.suggestionsContext;
    promptAssets.chatContext = loadedPrompts.chatContext;

    promptDefaults.suggestionCore = loadedPrompts.suggestionsPrompt;
    promptDefaults.chatDetailedCore = loadedPrompts.chatPromptDetailed;
    promptDefaults.chatConciseCore = loadedPrompts.chatPromptConcise;

    return loadedPrompts;
});

export function stripPromptContext(promptText, contextText) {
    const value = (promptText || "").trim();
    const context = (contextText || "").trim();

    if (!value) return "";
    if (!context) return value;

    if (value.endsWith(context)) {
        return value.slice(0, value.length - context.length).trimEnd();
    }

    return value;
}

export function combinePrompt(coreText, contextText) {
    const core = (coreText || "").trim();
    const context = (contextText || "").trim();

    if (!core) return context;
    if (!context) return core;
    return `${core}\n\n${context}`;
}

export function getSuggestionCorePrompt() {
    return localStorage.getItem("suggestionPromptCore") || promptDefaults.suggestionCore || "";
}

export function getChatCorePrompt(mode) {
    const key = mode === "concise" ? "chatPromptConciseCore" : "chatPromptDetailedCore";
    const fallback = mode === "concise" ? promptDefaults.chatConciseCore : promptDefaults.chatDetailedCore;
    return localStorage.getItem(key) || fallback || "";
}

export function setChatCorePrompt(mode, value) {
    const key = mode === "concise" ? "chatPromptConciseCore" : "chatPromptDetailedCore";
    localStorage.setItem(key, value.trim());
}
