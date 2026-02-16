// utils/ttsProvider.js
// TTS Provider abstraction layer - supports ElevenLabs and Cartesia
// Controlled by TTS_PROVIDER env var: 'elevenlabs' (default) or 'cartesia'

const axios = require('axios');
const { retryWithExponentialBackoff } = require('./openaiClient');

const TTS_PROVIDER = process.env.TTS_PROVIDER || 'elevenlabs';

// --- Cartesia config ---
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY;
const CARTESIA_API_VERSION = '2025-04-16';
const CARTESIA_MODEL = process.env.CARTESIA_MODEL || 'sonic-2';
const CARTESIA_BASE_URL = 'https://api.cartesia.ai';

// --- ElevenLabs config ---
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

/**
 * Get the active TTS provider name
 */
function getProvider() {
    return TTS_PROVIDER;
}

/**
 * Check if the active provider has its API key configured
 */
function isConfigured() {
    if (TTS_PROVIDER === 'cartesia') {
        return !!CARTESIA_API_KEY;
    }
    return !!ELEVENLABS_API_KEY;
}

/**
 * Get display name for the active provider
 */
function getProviderName() {
    return TTS_PROVIDER === 'cartesia' ? 'Cartesia' : 'ElevenLabs';
}

/**
 * Get the correct voice ID for the active provider from a tutor profile.
 * Used by voice.js where the tutor profile is loaded server-side.
 */
function getVoiceId(tutorProfile) {
    if (TTS_PROVIDER === 'cartesia') {
        return tutorProfile.cartesiaVoiceId || null;
    }
    return tutorProfile.voiceId;
}

/**
 * Resolve a voice ID from a client request.
 * The client always sends ElevenLabs voice IDs (from tutorConfig.js).
 * When Cartesia is active, this maps to the corresponding Cartesia voice ID.
 * Used by speak.js where the voiceId comes from the client.
 */
function resolveVoiceId(clientVoiceId) {
    if (TTS_PROVIDER !== 'cartesia') return clientVoiceId;

    const TUTOR_CONFIG = require('./tutorConfig');
    for (const tutor of Object.values(TUTOR_CONFIG)) {
        if (tutor.voiceId === clientVoiceId && tutor.cartesiaVoiceId) {
            return tutor.cartesiaVoiceId;
        }
    }

    // No mapping found — return original (will likely fail with Cartesia)
    console.warn(`⚠️ [TTS] No Cartesia voice mapping found for ElevenLabs voice: ${clientVoiceId}`);
    return clientVoiceId;
}

/**
 * Get the audio content type for HTTP responses
 */
function getContentType() {
    return TTS_PROVIDER === 'cartesia' ? 'audio/wav' : 'audio/mpeg';
}

/**
 * Get the file extension for saved audio files
 */
function getFileExtension() {
    return TTS_PROVIDER === 'cartesia' ? '.wav' : '.mp3';
}

// ============================================
// AUDIO GENERATION
// ============================================

/**
 * Generate TTS audio as a Buffer.
 * Works for both providers.
 * @param {string} text - Cleaned text to synthesize
 * @param {string} voiceId - Provider-specific voice ID
 * @returns {Promise<Buffer>} Audio data
 */
async function generateAudio(text, voiceId) {
    if (TTS_PROVIDER === 'cartesia') {
        return generateCartesiaAudio(text, voiceId);
    }
    return generateElevenLabsAudio(text, voiceId);
}

/**
 * Generate TTS audio as a streaming response (ElevenLabs only).
 * For Cartesia, falls back to buffered response.
 * @param {string} text - Cleaned text to synthesize
 * @param {string} voiceId - Provider-specific voice ID
 * @returns {Promise<Object>} Axios response with stream or arraybuffer
 */
async function generateAudioStream(text, voiceId) {
    if (TTS_PROVIDER === 'cartesia') {
        // Cartesia bytes endpoint returns full buffer — no true HTTP streaming
        return generateCartesiaAudioResponse(text, voiceId);
    }
    return generateElevenLabsAudioStream(text, voiceId);
}

// ============================================
// ELEVENLABS IMPLEMENTATION
// ============================================

async function generateElevenLabsAudio(text, voiceId) {
    const response = await retryWithExponentialBackoff(async () => {
        return await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
            {
                text,
                model_id: "eleven_monolingual_v1",
                voice_settings: {
                    stability: 0.4,
                    similarity_boost: 0.7
                }
            },
            {
                headers: {
                    "xi-api-key": ELEVENLABS_API_KEY,
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg"
                },
                responseType: "arraybuffer"
            }
        );
    });
    return Buffer.from(response.data);
}

async function generateElevenLabsAudioStream(text, voiceId) {
    return await retryWithExponentialBackoff(async () => {
        return await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
            {
                text,
                model_id: "eleven_monolingual_v1",
                voice_settings: {
                    stability: 0.4,
                    similarity_boost: 0.7
                }
            },
            {
                headers: {
                    "xi-api-key": ELEVENLABS_API_KEY,
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg"
                },
                responseType: "stream"
            }
        );
    });
}

// ============================================
// CARTESIA IMPLEMENTATION
// ============================================

async function generateCartesiaAudio(text, voiceId) {
    const response = await generateCartesiaAudioResponse(text, voiceId);
    return Buffer.from(response.data);
}

async function generateCartesiaAudioResponse(text, voiceId) {
    return await retryWithExponentialBackoff(async () => {
        return await axios.post(
            `${CARTESIA_BASE_URL}/tts/bytes`,
            {
                model_id: CARTESIA_MODEL,
                transcript: text,
                voice: {
                    mode: "id",
                    id: voiceId
                },
                language: "en",
                output_format: {
                    container: "wav",
                    encoding: "pcm_s16le",
                    sample_rate: 44100
                }
            },
            {
                headers: {
                    "Authorization": `Bearer ${CARTESIA_API_KEY}`,
                    "Cartesia-Version": CARTESIA_API_VERSION,
                    "Content-Type": "application/json"
                },
                responseType: "arraybuffer"
            }
        );
    });
}

// ============================================
// DIAGNOSTICS
// ============================================

/**
 * Test the TTS provider API connection
 * @param {string} voiceId - A valid voice ID for the active provider
 */
async function testConnection(voiceId) {
    try {
        if (TTS_PROVIDER === 'cartesia') {
            if (!CARTESIA_API_KEY) throw new Error('CARTESIA_API_KEY not set');

            const response = await axios.post(
                `${CARTESIA_BASE_URL}/tts/bytes`,
                {
                    model_id: CARTESIA_MODEL,
                    transcript: "Test",
                    voice: {
                        mode: "id",
                        id: voiceId
                    },
                    language: "en",
                    output_format: {
                        container: "wav",
                        encoding: "pcm_s16le",
                        sample_rate: 44100
                    }
                },
                {
                    headers: {
                        "Authorization": `Bearer ${CARTESIA_API_KEY}`,
                        "Cartesia-Version": CARTESIA_API_VERSION,
                        "Content-Type": "application/json"
                    },
                    responseType: "arraybuffer",
                    timeout: 10000
                }
            );

            return {
                success: true,
                details: {
                    provider: 'cartesia',
                    model: CARTESIA_MODEL,
                    status: response.status,
                    audioSize: response.data.byteLength,
                    contentType: response.headers['content-type']
                },
                message: 'Cartesia API is working'
            };
        } else {
            if (!ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not set');

            const response = await axios.post(
                `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
                {
                    text: 'Test',
                    model_id: 'eleven_monolingual_v1',
                    voice_settings: {
                        stability: 0.4,
                        similarity_boost: 0.7
                    }
                },
                {
                    headers: {
                        'xi-api-key': ELEVENLABS_API_KEY,
                        'Content-Type': 'application/json',
                        'Accept': 'audio/mpeg'
                    },
                    responseType: 'arraybuffer',
                    timeout: 10000
                }
            );

            return {
                success: true,
                details: {
                    provider: 'elevenlabs',
                    status: response.status,
                    audioSize: response.data.byteLength,
                    contentType: response.headers['content-type']
                },
                message: 'ElevenLabs API is working'
            };
        }
    } catch (error) {
        return {
            success: false,
            details: {
                provider: TTS_PROVIDER,
                error: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data?.toString?.('utf8')
            },
            message: `${getProviderName()} API error: ${error.message}`
        };
    }
}

module.exports = {
    getProvider,
    isConfigured,
    getProviderName,
    getVoiceId,
    resolveVoiceId,
    getContentType,
    getFileExtension,
    generateAudio,
    generateAudioStream,
    testConnection
};
