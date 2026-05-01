import { buildApiUrl } from "./config.js";

async function postForm(endpoint, formData) {
    const response = await fetch(buildApiUrl(endpoint), {
        method: "POST",
        body: formData,
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail || `Request failed with status ${response.status}`);
    }

    return response;
}

export async function transcribeAudio({ audioBlob, apiKey }) {
    const formData = new FormData();
    formData.append("file", audioBlob, "audio.webm");
    formData.append("api_key", apiKey);

    const response = await postForm("/api/transcribe", formData);
    return response.json();
}

export async function requestSuggestions({ apiKey, transcript, systemPrompt, contextLimit }) {
    const formData = new FormData();
    formData.append("api_key", apiKey);
    formData.append("transcript", transcript);
    formData.append("system_prompt", systemPrompt);
    formData.append("context_limit", String(contextLimit));

    const response = await postForm("/api/suggest", formData);
    return response.json();
}

export async function requestChatStream({ apiKey, transcript, chatHistory, activeSuggestion, userQuery, systemPrompt, contextLimit }) {
    const formData = new FormData();
    formData.append("api_key", apiKey);
    formData.append("transcript", transcript);
    formData.append("chat_history", JSON.stringify(chatHistory));
    formData.append("active_suggestion", activeSuggestion || "none");
    formData.append("user_query", userQuery);
    formData.append("system_prompt", systemPrompt);
    formData.append("context_limit", String(contextLimit));

    return postForm("/api/chat", formData);
}
