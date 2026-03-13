// ═══════════════════════════════════════════════════════════════
// AVATAR CONTROLLER — Simli lip-synced video avatar integration
// Handles WebRTC connection, audio piping, and avatar lifecycle.
// Premium feature: replaces the orb visualizer with a live avatar.
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  class AvatarController {
    constructor() {
      this.simliClient = null;
      this.peerConnection = null;
      this.dataChannel = null;
      this.isConnected = false;
      this.isEnabled = false;
      this.config = null;

      // DOM refs
      this.videoEl = null;
      this.audioEl = null;
      this.containerEl = null;
    }

    // ═══════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════

    /**
     * Initialize the avatar system.
     * Fetches config from server (API key stays server-side until needed for WebRTC).
     */
    async init(videoElementId, audioElementId, containerElementId) {
      this.videoEl = document.getElementById(videoElementId);
      this.audioEl = document.getElementById(audioElementId);
      this.containerEl = document.getElementById(containerElementId);

      if (!this.videoEl || !this.audioEl) {
        console.warn('[Avatar] Video/audio elements not found');
        return false;
      }

      try {
        const fetchFn = window.csrfFetch || fetch;
        const res = await fetchFn('/api/avatar/config', { credentials: 'include' });

        if (!res.ok) {
          if (res.status === 503) {
            console.log('[Avatar] Service not configured — avatar disabled');
            return false;
          }
          throw new Error('Failed to fetch avatar config');
        }

        this.config = await res.json();
        console.log('[Avatar] Config loaded for tutor:', this.config.tutorId);
        return true;

      } catch (err) {
        console.warn('[Avatar] Init failed:', err.message);
        return false;
      }
    }

    // ═══════════════════════════════════════
    // WEBRTC SESSION
    // ═══════════════════════════════════════

    /**
     * Start the avatar session — establishes WebRTC connection with Simli.
     * Call this when the user enables the avatar or starts a voice session.
     */
    async start() {
      if (!this.config) {
        console.warn('[Avatar] Not initialized');
        return false;
      }

      if (this.isConnected) {
        console.log('[Avatar] Already connected');
        return true;
      }

      try {
        console.log('[Avatar] Starting WebRTC session...');

        // Create peer connection
        this.peerConnection = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        // Handle incoming tracks (video + audio from Simli)
        this.peerConnection.ontrack = (event) => {
          console.log('[Avatar] Track received:', event.track.kind);
          if (event.track.kind === 'video' && this.videoEl) {
            this.videoEl.srcObject = event.streams[0];
            this.videoEl.play().catch(e => console.warn('[Avatar] Video autoplay blocked:', e));
          }
          if (event.track.kind === 'audio' && this.audioEl) {
            this.audioEl.srcObject = event.streams[0];
            this.audioEl.play().catch(e => console.warn('[Avatar] Audio autoplay blocked:', e));
          }
        };

        // Create data channel for sending audio
        this.dataChannel = this.peerConnection.createDataChannel('audio', {
          ordered: true
        });

        this.dataChannel.onopen = () => {
          console.log('[Avatar] Data channel open — ready to send audio');
          this.isConnected = true;
          this.isEnabled = true;
          if (this.containerEl) this.containerEl.classList.add('avatar-active');
        };

        this.dataChannel.onclose = () => {
          console.log('[Avatar] Data channel closed');
          this.isConnected = false;
        };

        // Create and send offer
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);

        // Wait for ICE gathering
        await this._waitForICEGathering();

        // Send offer to Simli's API
        const response = await fetch('https://api.simli.ai/StartWebRTCSession', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sdp: this.peerConnection.localDescription.sdp,
            type: this.peerConnection.localDescription.type,
            apiKey: this.config.apiKey,
            faceId: this.config.faceId,
            handleSilence: true,
            maxSessionLength: this.config.maxSessionLength || 1800,
            maxIdleTime: this.config.maxIdleTime || 300,
            syncAudio: true,
          })
        });

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`Simli API error: ${response.status} - ${err}`);
        }

        const answer = await response.json();
        await this.peerConnection.setRemoteDescription(
          new RTCSessionDescription(answer)
        );

        console.log('[Avatar] WebRTC session established');
        return true;

      } catch (err) {
        console.error('[Avatar] Start failed:', err);
        this.close();
        return false;
      }
    }

    /**
     * Wait for ICE gathering to complete (or timeout after 3s)
     */
    _waitForICEGathering() {
      return new Promise((resolve) => {
        if (this.peerConnection.iceGatheringState === 'complete') {
          resolve();
          return;
        }

        const timeout = setTimeout(resolve, 3000);

        this.peerConnection.addEventListener('icegatheringstatechange', () => {
          if (this.peerConnection.iceGatheringState === 'complete') {
            clearTimeout(timeout);
            resolve();
          }
        });
      });
    }

    // ═══════════════════════════════════════
    // AUDIO PIPING
    // ═══════════════════════════════════════

    /**
     * Send TTS audio data to Simli for lip sync.
     * Audio must be PCM16 at 16kHz mono.
     * @param {Uint8Array} pcmData - Raw PCM16 audio bytes
     */
    sendAudioData(pcmData) {
      if (!this.isConnected || !this.dataChannel || this.dataChannel.readyState !== 'open') {
        return;
      }

      // Send in chunks to avoid overwhelming the data channel
      const CHUNK_SIZE = 6000; // ~187ms at 16kHz mono PCM16
      for (let i = 0; i < pcmData.length; i += CHUNK_SIZE) {
        const chunk = pcmData.slice(i, i + CHUNK_SIZE);
        try {
          this.dataChannel.send(chunk);
        } catch (e) {
          console.warn('[Avatar] Send error:', e.message);
          break;
        }
      }
    }

    /**
     * Convert a WAV/MP3 audio URL to PCM16 and pipe it to the avatar.
     * This is the main integration point — call this when TTS audio is ready.
     * @param {string} audioUrl - URL of the TTS audio file
     * @returns {Promise<HTMLAudioElement>} - The audio element for playback sync
     */
    async pipeAudioFromUrl(audioUrl) {
      if (!this.isConnected) return null;

      try {
        // Fetch the audio file
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();

        // Decode to AudioBuffer
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 16000
        });

        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Convert to PCM16
        const pcmData = this._audioBufferToPCM16(audioBuffer);

        // Send to Simli
        this.sendAudioData(pcmData);

        await audioContext.close();

        return true;
      } catch (err) {
        console.error('[Avatar] Audio pipe error:', err);
        return false;
      }
    }

    /**
     * Convert an AudioBuffer to PCM16 Uint8Array (16kHz mono)
     */
    _audioBufferToPCM16(audioBuffer) {
      // Get channel data (use first channel, downmix if stereo)
      let channelData;
      if (audioBuffer.numberOfChannels > 1) {
        // Mix to mono
        const ch0 = audioBuffer.getChannelData(0);
        const ch1 = audioBuffer.getChannelData(1);
        channelData = new Float32Array(ch0.length);
        for (let i = 0; i < ch0.length; i++) {
          channelData[i] = (ch0[i] + ch1[i]) / 2;
        }
      } else {
        channelData = audioBuffer.getChannelData(0);
      }

      // Resample to 16kHz if needed
      let samples = channelData;
      if (audioBuffer.sampleRate !== 16000) {
        samples = this._resample(channelData, audioBuffer.sampleRate, 16000);
      }

      // Convert Float32 [-1, 1] to Int16
      const pcm16 = new Int16Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      return new Uint8Array(pcm16.buffer);
    }

    /**
     * Simple linear interpolation resampler
     */
    _resample(inputData, inputRate, outputRate) {
      const ratio = inputRate / outputRate;
      const outputLength = Math.ceil(inputData.length / ratio);
      const output = new Float32Array(outputLength);

      for (let i = 0; i < outputLength; i++) {
        const srcIndex = i * ratio;
        const srcFloor = Math.floor(srcIndex);
        const srcCeil = Math.min(srcFloor + 1, inputData.length - 1);
        const frac = srcIndex - srcFloor;
        output[i] = inputData[srcFloor] * (1 - frac) + inputData[srcCeil] * frac;
      }

      return output;
    }

    // ═══════════════════════════════════════
    // CONTROL
    // ═══════════════════════════════════════

    /**
     * Clear Simli's audio buffer — use when interrupting the avatar.
     */
    clearBuffer() {
      if (!this.isConnected || !this.dataChannel || this.dataChannel.readyState !== 'open') return;

      // Send a special empty frame to signal buffer clear
      // Simli handles silence via handleSilence: true in config
      try {
        this.dataChannel.send(new Uint8Array(0));
      } catch (e) {
        // Ignore
      }
    }

    /**
     * Close the avatar session and clean up resources.
     */
    close() {
      console.log('[Avatar] Closing session');

      this.isConnected = false;
      this.isEnabled = false;

      if (this.dataChannel) {
        try { this.dataChannel.close(); } catch (e) { /* ignore */ }
        this.dataChannel = null;
      }

      if (this.peerConnection) {
        try { this.peerConnection.close(); } catch (e) { /* ignore */ }
        this.peerConnection = null;
      }

      if (this.videoEl) {
        this.videoEl.srcObject = null;
      }
      if (this.audioEl) {
        this.audioEl.srcObject = null;
      }
      if (this.containerEl) {
        this.containerEl.classList.remove('avatar-active');
      }
    }

    /**
     * Toggle avatar on/off — used by the settings toggle
     */
    async toggle(enabled) {
      if (enabled && !this.isConnected) {
        return await this.start();
      } else if (!enabled && this.isConnected) {
        this.close();
        return true;
      }
      return this.isConnected;
    }
  }

  // Export
  window.AvatarController = AvatarController;
})();
