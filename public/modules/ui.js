import { appState, $ } from "./state.js";
import { SUGGESTION_TYPE_LABELS } from "./config.js";

export function showBanner(message, type = "success", duration = 2600) {
    const el = $("floatingBanner");
    if (!el) return;

    el.textContent = message;
    el.className = `floating-banner ${type}`;
    el.style.display = "block";

    void el.offsetWidth;
    el.classList.add("show");

    setTimeout(() => {
        el.classList.remove("show");
        setTimeout(() => {
            el.style.display = "none";
        }, 240);
    }, duration);
}

export function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function labelFor(type) {
    return SUGGESTION_TYPE_LABELS[type] || "Suggestion";
}

export function appendTranscriptLine(text) {
    const empty = $("transcriptEmpty");
    if (empty) empty.remove();

    const timestamp = new Date();
    appState.transcriptEntries.push({
        timestamp: timestamp.toISOString(),
        text,
    });

    const now = timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const div = document.createElement("div");
    div.className = "transcript-line new";
    div.innerHTML = `<span class="ts">${now}</span>${escapeHtml(text)}`;
    $("transcriptBody").appendChild(div);
    $("transcriptBody").scrollTop = $("transcriptBody").scrollHeight;
}

export function clearInterimLine() {
    if (!appState.interimNode) return;
    appState.interimNode.remove();
    appState.interimNode = null;
}

function exportAsJSON(startedAt, stamp) {
    const data = {
        metadata: {
            title: "MindFull Transcript",
            generated: new Date().toISOString(),
            startedAt: startedAt.toISOString(),
        },
        transcript: appState.transcriptEntries.map((entry) => ({
            timestamp: entry.timestamp,
            time: new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            text: entry.text,
        })),
        suggestions: appState.suggestionBatches.map((suggestionObj, idx) => ({
            batchNumber: idx + 1,
            timestamp: suggestionObj.timestamp,
            time: new Date(suggestionObj.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            suggestions: (suggestionObj.suggestions || []).map((suggestion) => ({
                type: suggestion.type,
                label: labelFor(suggestion.type),
                text: suggestion.text,
            })),
        })),
        chat: appState.chatHistory.map((chatHistoryObj) => ({
            timestamp: chatHistoryObj.timestamp,
            time: new Date(chatHistoryObj.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            role: chatHistoryObj.role,
            content: chatHistoryObj.content,
        })),
    };

    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
}

function exportAsTXT(startedAt, stamp) {
    const lines = [
        "MindFull Transcript",
        `Generated: ${new Date().toLocaleString()}`,
        "",
        ...appState.transcriptEntries.map((entry) => {
            const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            return `\n[${time}] ${entry.text}`;
        }),
        "\nMindFull Suggestion Batches (most recent last):",
        ...appState.suggestionBatches.map((suggestionObj, idx) => {
            const batch = suggestionObj.suggestions || [];
            const time = new Date(suggestionObj.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            const batchLines = batch.map((suggestion) => `  - (${labelFor(suggestion.type)}) ${suggestion.text}`);
            return [`\n[${time}] Batch ${idx + 1}:\n`, ...batchLines].join("\n");
        }),
        "\nMindFull Chat History (most recent last):",
        ...appState.chatHistory.map((chatHistoryObj) => {
            const time = new Date(chatHistoryObj.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            const role = chatHistoryObj.role === "user" ? "You" : "Assistant";
            return `\n [${time}] - (${role}) : ${chatHistoryObj.content}`;
        }),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
}

export function exportTranscriptFile() {
    if (!appState.transcriptEntries.length) {
        $("micStatus").textContent = "No transcript captured yet.";
        return false;
    }

    const startedAt = new Date(appState.transcriptEntries[0].timestamp);
    const stamp = `${startedAt.getFullYear()}${String(startedAt.getMonth() + 1).padStart(2, "0")}${String(startedAt.getDate()).padStart(2, "0")}-${String(startedAt.getHours()).padStart(2, "0")}${String(startedAt.getMinutes()).padStart(2, "0")}${String(startedAt.getSeconds()).padStart(2, "0")}`;
    const exportFormat = localStorage.getItem("exportFormat") || "txt";

    if (exportFormat === "json") {
        return exportAsJSON(startedAt, stamp);
    }

    return exportAsTXT(startedAt, stamp);
}

export function renderSuggestionBatch(suggestionsObj) {
    if (!suggestionsObj || !suggestionsObj.suggestions) {
        console.error("Malformed suggestions object received");
        return;
    }

    const empty = $("suggestionsEmpty");
    if (empty) empty.remove();

    document.querySelectorAll(".suggestion.fresh").forEach((element) => {
        element.classList.replace("fresh", "stale");
    });

    appState.batchIdx += 1;

    const body = $("suggestionsBody");
    const insertAfter = body.querySelector(".help-banner") || body.firstElementChild;
    const fragment = document.createDocumentFragment();
    const suggestions = suggestionsObj.suggestions || [];

    suggestions.forEach((suggestionObj) => {
        const suggestionType = suggestionObj.type || "talking-point";
        const suggestionQuery = suggestionObj.text || "";
        const card = document.createElement("div");
        card.className = "suggestion fresh";

        card.innerHTML = `
            <span class="sug-tag ${suggestionType}">${labelFor(suggestionType)}</span>
            <div class="sug-title">${escapeHtml(String(suggestionQuery))}</div>
        `;

        card.addEventListener("click", () => {
            window.dispatchEvent(new CustomEvent("mindfull:suggestion-selected", {
                detail: { text: suggestionQuery, type: suggestionType },
            }));
        });

        fragment.appendChild(card);
    });

    const divider = document.createElement("div");
    divider.className = "sug-batch-divider";
    divider.textContent = `— Batch ${appState.batchIdx} · ${new Date().toLocaleTimeString()} —`;
    fragment.appendChild(divider);

    if (insertAfter) {
        insertAfter.after(fragment);
    } else {
        body.appendChild(fragment);
    }

    $("batchCount").textContent = `${appState.batchIdx} batch${appState.batchIdx === 1 ? "" : "es"}`;
}

export function createEmptyAiBubble(id) {
    const empty = $("chatEmpty");
    if (empty) empty.remove();

    const div = document.createElement("div");
    div.className = "chat-msg ai";
    div.id = id;
    div.innerHTML = `<div class="who">Assistant</div><div class="bubble">...</div>`;
    $("chatBody").appendChild(div);
}

export function updateAiBubble(id, text) {
    const container = document.getElementById(id);
    if (!container) return;

    const bubble = container.querySelector(".bubble");
    bubble.innerHTML = marked.parse(text);
}

export function addMsgToChatBox(who, text, label) {
    const empty = $("chatEmpty");
    if (empty) empty.remove();

    const div = document.createElement("div");
    div.className = `chat-msg ${who}`;
    const formattedText = who === "ai" ? marked.parse(text) : escapeHtml(text);

    div.innerHTML = `
        <div class="who">${label ? label : who === "user" ? "You" : "Assistant"}</div>
        <div class="bubble">${formattedText}</div>
    `;

    $("chatBody").appendChild(div);
    $("chatBody").scrollTop = $("chatBody").scrollHeight;
}
