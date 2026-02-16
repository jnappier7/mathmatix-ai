// modules/audio.js
// TTS audio playback system - queue-based with pause/resume/speed control

// --- Audio State ---
export const audioState = {
    context: null,
    buffer: null,
    source: null,
    startTime: 0,
    pausedAt: 0,
    isPaused: false,
    isPlaying: false,
    playbackRate: 1.0,
    currentMessageId: null,
    currentText: null,
    currentVoiceId: null
};

export let audioQueue = [];

// Legacy backward compat
let _isPlaying = false;
let _currentAudioSource = null;

/**
 * Queue audio for playback
 */
export function playAudio(text, voiceId, messageId) {
    if (!text || !window.AudioContext) return;
    audioQueue.push({ text, voiceId, messageId });
    processAudioQueue();
}

/**
 * Process the audio queue - plays items one at a time
 */
export async function processAudioQueue() {
    const stopAudioBtn = document.getElementById('stop-audio-btn');

    if (audioState.isPlaying || audioQueue.length === 0) {
        if (stopAudioBtn && !audioState.isPlaying) stopAudioBtn.style.display = 'none';
        return;
    }

    audioState.isPlaying = true;
    _isPlaying = true;

    if (stopAudioBtn) stopAudioBtn.style.display = 'inline-flex';
    updateAudioControls();

    const { text, voiceId, messageId } = audioQueue.shift();
    const messageBubble = document.getElementById(messageId);
    const playButton = messageBubble ? messageBubble.querySelector('.play-audio-btn') : null;

    audioState.currentMessageId = messageId;
    audioState.currentText = text;
    audioState.currentVoiceId = voiceId;

    try {
        const response = await csrfFetch('/api/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voiceId })
        });

        // COMPLIANCE: Under-13 users fall back to browser-native WebSpeech API
        if (response.status === 403) {
            let errorData;
            try { errorData = await response.json(); } catch (e) { errorData = {}; }
            if (errorData.useWebSpeech && window.speechSynthesis) {
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.rate = 0.95;
                utterance.onend = () => {
                    resetAudioState();
                    if (playButton) {
                        playButton.classList.remove('is-loading');
                        playButton.classList.remove('is-playing');
                    }
                    processAudioQueue();
                };
                utterance.onerror = () => {
                    resetAudioState();
                    if (playButton) {
                        playButton.classList.remove('is-loading');
                        playButton.classList.remove('is-playing');
                        playButton.disabled = false;
                    }
                    processAudioQueue();
                };
                if (playButton) playButton.classList.add('is-playing');
                window.speechSynthesis.speak(utterance);
                return;
            }
        }

        if (!response.ok) throw new Error('Failed to fetch audio stream.');

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioState.context = audioContext;

        const audioBuffer = await response.arrayBuffer();
        await audioContext.decodeAudioData(audioBuffer, (buffer) => {
            audioState.buffer = buffer;
            startAudioPlayback(0, playButton);
        });
    } catch (error) {
        console.error('Audio playback error:', error);
        resetAudioState();
        if (playButton) {
            playButton.classList.remove('is-loading');
            playButton.classList.remove('is-playing');
            playButton.disabled = false;
        }
        processAudioQueue();
    }
}

function startAudioPlayback(offset = 0, playButton = null) {
    if (!audioState.buffer || !audioState.context) return;

    const source = audioState.context.createBufferSource();
    source.buffer = audioState.buffer;
    source.playbackRate.value = audioState.playbackRate;
    source.connect(audioState.context.destination);

    audioState.source = source;
    _currentAudioSource = source;
    audioState.startTime = audioState.context.currentTime - offset;
    audioState.isPaused = false;

    if (playButton) {
        playButton.classList.remove('is-loading');
        playButton.classList.add('is-playing');
    }

    source.start(0, offset);

    source.onended = () => {
        if (audioState.isPlaying && !audioState.isPaused) {
            handleAudioEnded(playButton);
        }
    };

    updateAudioControls();
}

function handleAudioEnded(playButton) {
    resetAudioState();

    if (playButton) {
        playButton.classList.remove('is-playing');
        playButton.disabled = false;
    }

    // Dispatch event so script.js can handle hands-free auto-listen
    document.dispatchEvent(new CustomEvent('audioPlaybackEnded'));

    processAudioQueue();
}

export function pauseAudio() {
    if (!audioState.isPlaying || audioState.isPaused || !audioState.source) return;

    const elapsed = audioState.context.currentTime - audioState.startTime;
    audioState.pausedAt = elapsed;
    audioState.isPaused = true;

    audioState.source.stop();
    audioState.source = null;
    _currentAudioSource = null;

    updateAudioControls();

    const messageBubble = document.getElementById(audioState.currentMessageId);
    const playButton = messageBubble ? messageBubble.querySelector('.play-audio-btn') : null;
    if (playButton) {
        playButton.classList.remove('is-playing');
        playButton.classList.add('is-paused');
    }
}

export function resumeAudio() {
    if (!audioState.isPaused || !audioState.buffer) return;

    const messageBubble = document.getElementById(audioState.currentMessageId);
    const playButton = messageBubble ? messageBubble.querySelector('.play-audio-btn') : null;

    if (playButton) {
        playButton.classList.remove('is-paused');
    }

    startAudioPlayback(audioState.pausedAt, playButton);
}

export function restartAudio() {
    if (!audioState.isPlaying && !audioState.isPaused) return;

    if (audioState.source) {
        audioState.source.stop();
        audioState.source = null;
        _currentAudioSource = null;
    }

    const messageBubble = document.getElementById(audioState.currentMessageId);
    const playButton = messageBubble ? messageBubble.querySelector('.play-audio-btn') : null;

    audioState.pausedAt = 0;
    audioState.isPaused = false;

    startAudioPlayback(0, playButton);
}

export function stopAudio() {
    if (audioState.source) {
        audioState.source.stop();
    }

    const messageBubble = document.getElementById(audioState.currentMessageId);
    const playButton = messageBubble ? messageBubble.querySelector('.play-audio-btn') : null;
    if (playButton) {
        playButton.classList.remove('is-playing', 'is-paused');
        playButton.disabled = false;
    }

    resetAudioState();
    updateAudioControls();
    processAudioQueue();
}

export function changePlaybackSpeed(rate) {
    audioState.playbackRate = rate;

    if (audioState.source && !audioState.isPaused) {
        audioState.source.playbackRate.value = rate;
    }

    if (localStorage) {
        localStorage.setItem('ttsPlaybackRate', rate);
    }

    updateAudioControls();
}

export function resetAudioState() {
    if (audioState.context) {
        audioState.context.close();
    }

    audioState.context = null;
    audioState.buffer = null;
    audioState.source = null;
    audioState.startTime = 0;
    audioState.pausedAt = 0;
    audioState.isPaused = false;
    audioState.isPlaying = false;
    audioState.currentMessageId = null;
    audioState.currentText = null;
    audioState.currentVoiceId = null;

    _isPlaying = false;
    _currentAudioSource = null;

    updateAudioControls();
}

export function updateAudioControls() {
    const pauseBtn = document.getElementById('pause-audio-btn');
    const restartBtn = document.getElementById('restart-audio-btn');
    const speedDisplay = document.getElementById('speed-display');
    const speedControlContainer = document.getElementById('speed-control-container');
    const stopAudioBtn = document.getElementById('stop-audio-btn');

    const isActive = audioState.isPlaying || audioState.isPaused;

    if (pauseBtn) {
        if (audioState.isPlaying && !audioState.isPaused) {
            pauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
            pauseBtn.title = 'Pause';
            pauseBtn.style.display = 'inline-flex';
        } else if (audioState.isPaused) {
            pauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            pauseBtn.title = 'Resume';
            pauseBtn.style.display = 'inline-flex';
        } else {
            pauseBtn.style.display = 'none';
        }
    }

    if (restartBtn) {
        restartBtn.style.display = isActive ? 'inline-flex' : 'none';
    }

    if (speedDisplay) {
        speedDisplay.textContent = `${audioState.playbackRate}x`;
    }

    if (speedControlContainer) {
        speedControlContainer.style.display = isActive ? 'inline-block' : 'none';
    }

    if (stopAudioBtn) {
        stopAudioBtn.style.display = isActive ? 'inline-flex' : 'none';
    }
}
