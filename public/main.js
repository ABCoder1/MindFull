import { DEFAULT_SETTINGS, setBackendUrlOverride } from "./modules/config.js";
import { appState, $ } from "./modules/state.js";
import { combinePrompt, getChatCorePrompt, getSuggestionCorePrompt, promptAssets, promptDefaults, promptsReady, setChatCorePrompt, stripPromptContext } from "./modules/prompts.js";
import { addMsgToChatBox, createEmptyAiBubble, exportTranscriptFile, showBanner, updateAiBubble, labelFor } from "./modules/ui.js";
import { requestChatStream } from "./modules/api.js";
import { startRecording, stopRecording } from "./modules/recording.js";

function ensureDefaultSettings() {
    Object.keys(DEFAULT_SETTINGS).forEach((key) => {
        if (!localStorage.getItem(key)) {
            localStorage.setItem(key, String(DEFAULT_SETTINGS[key]));
        }
    });
}

async function loadSettings() {
    ensureDefaultSettings();
    await promptsReady;

    $("groqKeyInput").value = localStorage.getItem("groqAPIKey") || "";
    $("backendUrlInput").value = localStorage.getItem("backendUrl") || "";
    $("suggestionContextBlock").textContent = promptAssets.suggestionsContext || "";
    $("chatContextBlock").textContent = promptAssets.chatContext || "";

    const storedSuggestionPrompt = localStorage.getItem("suggestionPromptCore") || stripPromptContext(localStorage.getItem("suggestionPrompt"), promptAssets.suggestionsContext) || promptDefaults.suggestionCore;
    const suggestionCore = storedSuggestionPrompt.trim();
    localStorage.setItem("suggestionPromptCore", suggestionCore);

    const mode = localStorage.getItem("chatPromptMode") || "detailed";
    const detailedCore = localStorage.getItem("chatPromptDetailedCore") || (mode === "detailed" ? stripPromptContext(localStorage.getItem("chatPrompt"), promptAssets.chatContext) : promptDefaults.chatDetailedCore) || promptDefaults.chatDetailedCore;
    const conciseCore = localStorage.getItem("chatPromptConciseCore") || (mode === "concise" ? stripPromptContext(localStorage.getItem("chatPrompt"), promptAssets.chatContext) : promptDefaults.chatConciseCore) || promptDefaults.chatConciseCore;

    localStorage.setItem("chatPromptDetailedCore", detailedCore.trim());
    localStorage.setItem("chatPromptConciseCore", conciseCore.trim());

    $("contextWindowSuggestion").value = localStorage.getItem("contextWindowSuggestion") || String(DEFAULT_SETTINGS.contextWindowSuggestion);
    $("contextWindowChat").value = localStorage.getItem("contextWindowChat") || String(DEFAULT_SETTINGS.contextWindowChat);
    $("autoExportSelect").value = localStorage.getItem("autoExport") || DEFAULT_SETTINGS.autoExport;
    $("exportFormatSelect").value = localStorage.getItem("exportFormat") || DEFAULT_SETTINGS.exportFormat;
    $("chatPromptModeSelect").value = mode;
    $("suggestionPromptInput").value = suggestionCore;
    $("chatPromptInput").value = mode === "concise" ? conciseCore.trim() : detailedCore.trim();
}

function saveSettings() {
    localStorage.setItem("groqAPIKey", $("groqKeyInput").value);
    setBackendUrlOverride($("backendUrlInput").value);
    localStorage.setItem("contextWindowSuggestion", $("contextWindowSuggestion").value);
    localStorage.setItem("contextWindowChat", $("contextWindowChat").value);

    const suggestionCore = $("suggestionPromptInput").value.trim();
    const chatMode = $("chatPromptModeSelect").value;
    const chatCore = $("chatPromptInput").value.trim();

    localStorage.setItem("suggestionPromptCore", suggestionCore);
    setChatCorePrompt(chatMode, chatCore);
    localStorage.setItem("chatPromptMode", chatMode);
    localStorage.setItem("autoExport", $("autoExportSelect").value);
    localStorage.setItem("exportFormat", $("exportFormatSelect").value);

    localStorage.setItem("suggestionPrompt", combinePrompt(suggestionCore, promptAssets.suggestionsContext));
    localStorage.setItem("chatPrompt", combinePrompt(chatCore, promptAssets.chatContext));

    $("settingsModal").style.display = "none";
    showBanner("Settings saved", "success", 2200);
}

async function sendToChat(queryText, queryType = null) {
    const apiKey = localStorage.getItem("groqAPIKey") || "";
    if (!apiKey) {
        showBanner("Insert a valid Groq API key in Settings to use chat.", "info", 3800);
        return;
    }

    appState.activeSuggestion = queryType ? { text: queryText, type: queryType } : null;
    addMsgToChatBox("user", queryText, queryType ? labelFor(queryType) : null);
    appState.chatHistory.push({
        timestamp: new Date().toISOString(),
        role: "user",
        content: queryText,
    });

    const fullContext = appState.transcriptEntries.map((entry) => entry.text).join(" ");
    const chatLimit = Number.parseInt(localStorage.getItem("contextWindowChat") || "8000", 10) || 8000;
    const promptMode = localStorage.getItem("chatPromptMode") || "detailed";
    const systemPrompt = combinePrompt(getChatCorePrompt(promptMode), promptAssets.chatContext);

    try {
        const response = await requestChatStream({
            apiKey,
            transcript: fullContext,
            chatHistory: appState.chatHistory.slice(-chatLimit),
            activeSuggestion: appState.activeSuggestion ? appState.activeSuggestion.text : "none",
            userQuery: queryText,
            systemPrompt,
            contextLimit: localStorage.getItem("contextWindowSuggestion") || String(DEFAULT_SETTINGS.contextWindowSuggestion),
        });

        if (!response.body) {
            throw new Error("Stream response was empty");
        }

        const aiBubbleId = `ai-${Date.now()}`;
        createEmptyAiBubble(aiBubbleId);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullAIText = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            fullAIText += chunk;
            updateAiBubble(aiBubbleId, fullAIText);
            $("chatBody").scrollTop = $("chatBody").scrollHeight;
        }

        appState.chatHistory.push({
            timestamp: new Date().toISOString(),
            role: "assistant",
            content: fullAIText,
        });
    } catch (error) {
        console.error(error);
        addMsgToChatBox("ai", "Error connecting to the chat model.");
    }
}

function bindUI() {
    $("settingsBtn").onclick = () => {
        void loadSettings();
        $("settingsModal").style.display = "flex";
    };

    $("closeSettings").onclick = () => {
        $("settingsModal").style.display = "none";
    };

    $("saveSettings").onclick = saveSettings;

    $("chatPromptModeSelect").addEventListener("change", () => {
        const previousMode = localStorage.getItem("chatPromptMode") || "detailed";
        setChatCorePrompt(previousMode, $("chatPromptInput").value);

        const nextMode = $("chatPromptModeSelect").value;
        localStorage.setItem("chatPromptMode", nextMode);
        $("chatPromptInput").value = getChatCorePrompt(nextMode).trim();
    });

    $("reloadBtn").addEventListener("click", () => {
        if (appState.mediaRecorder && appState.mediaRecorder.state === "recording") {
            appState.mediaRecorder.stop();
            appState.mediaRecorder.start();
        }
        appState.countdown = 30;
        $("countdown").textContent = `auto-refresh in ${appState.countdown}s`;
    });

    $("chatSend").addEventListener("click", () => {
        const userQuery = $("chatInput").value.trim();
        if (!userQuery) return;
        void sendToChat(userQuery);
        $("chatInput").value = "";
    });

    $("chatInput").addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            $("chatSend").click();
        }
    });

    $("micBtn").addEventListener("click", async () => {
        if (appState.recording) {
            stopRecording();
            return;
        }
        await startRecording();
    });

    $("exportTranscriptBtn").addEventListener("click", () => {
        const exported = exportTranscriptFile();
        if (exported) {
            $("micStatus").textContent = "Stopped. Transcript downloaded locally.";
        }
    });

    window.addEventListener("mindfull:suggestion-selected", (event) => {
        const detail = event.detail || {};
        void sendToChat(detail.text || "", detail.type || null);
    });
}

window.exportTranscriptFile = exportTranscriptFile;
window.addEventListener("load", () => {
    bindUI();
    void loadSettings();
});
