import { appState, $ } from "./state.js";
import { promptAssets, combinePrompt, getSuggestionCorePrompt } from "./prompts.js";
import { appendTranscriptLine, clearInterimLine, renderSuggestionBatch, showBanner } from "./ui.js";
import { requestSuggestions, transcribeAudio } from "./api.js";

function setRecordingUi(isRecording) {
    $("micBtn").classList.toggle("recording", isRecording);
    $("recState").textContent = isRecording ? "● recording" : "idle";
    $("micStatus").textContent = isRecording ? "Listening... live transcript in progress." : "Stopped. Click to resume.";
}

export async function startRecording() {
    if (appState.recording) {
        return;
    }

    const apiKey = localStorage.getItem("groqAPIKey") || "";
    if (!apiKey) {
        showBanner("Insert a valid Groq API key in Settings to start recording.", "info", 3800);
        return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
        $("micStatus").textContent = "This browser does not support microphone capture.";
        return;
    }

    try {
        appState.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
        $("micStatus").textContent = "Microphone permission denied. Allow access and try again.";
        return;
    }

    if (!window.MediaRecorder) {
        $("micStatus").textContent = "This browser does not support MediaRecorder.";
        appState.micStream.getTracks().forEach((track) => track.stop());
        appState.micStream = null;
        return;
    }

    const mimeType = MediaRecorder.isTypeSupported("audio/webm; codecs=opus") ? "audio/webm; codecs=opus" : "audio/webm";

    appState.mediaRecorder = new MediaRecorder(appState.micStream, {
        mimeType,
        audioBitsPerSecond: 128000,
    });

    appState.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
            appState.audioChunks.push(event.data);
        }
    };

    appState.mediaRecorder.onstop = async () => {
        if (appState.audioChunks.length > 0) {
            await processAudioAndFetchSuggestions();
        }
    };

    appState.mediaRecorder.start();
    setRecordingUi(true);
    appState.recording = true;
    appState.audioChunks = [];

    appState.countdown = 30;
    $("countdown").textContent = `auto-refresh in ${appState.countdown}s`;
    clearInterval(appState.countdownTimer);
    appState.countdownTimer = setInterval(tickCountdown, 1000);
}

export function stopRecording() {
    appState.recording = false;
    setRecordingUi(false);

    clearInterval(appState.countdownTimer);
    clearInterimLine();

    if (appState.mediaRecorder && appState.mediaRecorder.state !== "inactive") {
        appState.mediaRecorder.stop();
    }

    if (appState.micStream) {
        appState.micStream.getTracks().forEach((track) => track.stop());
        appState.micStream = null;
    }

    const autoExport = localStorage.getItem("autoExport") || "disabled";
    if (autoExport === "enabled") {
        const exported = window.exportTranscriptFile?.();
        if (exported) {
            $("micStatus").textContent = "Stopped. Transcript downloaded locally.";
        }
    }
}

export function tickCountdown() {
    appState.countdown -= 1;

    if (appState.countdown <= 0) {
        if (appState.mediaRecorder && appState.mediaRecorder.state === "recording") {
            appState.mediaRecorder.stop();
            appState.mediaRecorder.start();
        }
        appState.countdown = 30;
    }

    $("countdown").textContent = `auto-refresh in ${appState.countdown}s`;
}

export async function processAudioAndFetchSuggestions() {
    if (appState.audioChunks.length === 0) {
        return;
    }

    const audioBlob = new Blob(appState.audioChunks, { type: "audio/webm" });
    appState.audioChunks = [];

    const apiKey = localStorage.getItem("groqAPIKey") || "";
    if (!apiKey) {
        $("micStatus").textContent = "Error: No Groq API Key found in settings.";
        return;
    }

    try {
        const transcriptionData = await transcribeAudio({ audioBlob, apiKey });

        if (transcriptionData.text) {
            appendTranscriptLine(transcriptionData.text);

            const fullContext = appState.transcriptEntries.map((entry) => entry.text).join(" ");
            const suggestionPrompt = combinePrompt(getSuggestionCorePrompt(), promptAssets.suggestionsContext);
            const contextLimit = Number.parseInt(localStorage.getItem("contextWindowSuggestion") || "5000", 10) || 5000;

            const suggestData = await requestSuggestions({
                apiKey,
                transcript: fullContext,
                systemPrompt: suggestionPrompt,
                contextLimit,
            });

            if (suggestData.suggestions) {
                const timestamp = new Date();
                const suggestionsEntry = {
                    timestamp: timestamp.toISOString(),
                    suggestions: suggestData.suggestions,
                };
                appState.suggestionBatches.push(suggestionsEntry);
                renderSuggestionBatch(suggestionsEntry);
            }
        }
    } catch (error) {
        console.error("Error in processAudioAndFetchSuggestions:", error);
        $("micStatus").textContent = "Connection error. Check backend status.";
    }
}
