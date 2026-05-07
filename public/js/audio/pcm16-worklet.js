// public/js/audio/pcm16-worklet.js
// AudioWorkletProcessor: resamples mic input to 16kHz PCM16 mono frames
// for streaming upload to the voice WebSocket. Also reports per-frame
// RMS so the main thread can run a local VAD for interrupt detection.

class PCM16Processor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        // The browser's AudioContext sampleRate (typically 48000 on Chrome).
        // Provided automatically as `sampleRate` global in worklet scope.
        this.inSampleRate = sampleRate;
        this.outSampleRate = (options && options.processorOptions && options.processorOptions.outSampleRate) || 16000;
        this.frameSamples = (options && options.processorOptions && options.processorOptions.frameSamples) || 320; // 20ms @ 16kHz
        this.ratio = this.inSampleRate / this.outSampleRate;
        this.buffer = new Float32Array(0);
    }

    process(inputs) {
        const input = inputs[0];
        if (!input || input.length === 0) return true;
        const channel = input[0];
        if (!channel) return true;

        // Append to internal buffer
        const merged = new Float32Array(this.buffer.length + channel.length);
        merged.set(this.buffer, 0);
        merged.set(channel, this.buffer.length);
        this.buffer = merged;

        // Drain whole output frames worth of input
        const inputPerOutFrame = Math.floor(this.frameSamples * this.ratio);
        while (this.buffer.length >= inputPerOutFrame) {
            const slice = this.buffer.subarray(0, inputPerOutFrame);
            this.buffer = this.buffer.subarray(inputPerOutFrame);

            const out = new Int16Array(this.frameSamples);
            // Linear-interp downsample
            for (let i = 0; i < this.frameSamples; i++) {
                const srcIdx = i * this.ratio;
                const lo = Math.floor(srcIdx);
                const hi = Math.min(lo + 1, slice.length - 1);
                const frac = srcIdx - lo;
                const sample = slice[lo] * (1 - frac) + slice[hi] * frac;
                const clipped = Math.max(-1, Math.min(1, sample));
                out[i] = clipped < 0 ? clipped * 0x8000 : clipped * 0x7FFF;
            }

            // RMS for local VAD
            let sumSq = 0;
            for (let i = 0; i < out.length; i++) {
                const s = out[i] / 0x8000;
                sumSq += s * s;
            }
            const rms = Math.sqrt(sumSq / out.length);
            const dbfs = rms > 0 ? 20 * Math.log10(rms) : -120;

            this.port.postMessage(
                { pcm: out.buffer, dbfs },
                [out.buffer]
            );
        }
        return true;
    }
}

registerProcessor('pcm16-processor', PCM16Processor);
