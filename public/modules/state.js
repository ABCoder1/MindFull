export const appState = {
    transcriptEntries: [],
    suggestionBatches: [],
    chatHistory: [],
    activeSuggestion: null,
    recording: false,
    micStream: null,
    mediaRecorder: null,
    countdownTimer: null,
    countdown: 30,
    batchIdx: 0,
    audioChunks: [],
    interimNode: null,
};

export const $ = (id) => document.getElementById(id);
