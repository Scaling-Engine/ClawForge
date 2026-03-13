/**
 * AudioWorklet processor for voice input.
 * Converts Float32 audio samples to Int16 PCM and calculates volume level.
 * This file MUST live in public/ — AudioWorklet processors cannot be bundled.
 */
class VoiceProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;

    // Convert Float32 samples to Int16 PCM
    const pcm16 = new Int16Array(input.length);
    let maxAbs = 0;
    for (let i = 0; i < input.length; i++) {
      const sample = input[i];
      pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
      const abs = Math.abs(sample);
      if (abs > maxAbs) maxAbs = abs;
    }

    // Post PCM data and volume level to main thread
    this.port.postMessage({ pcm16, volume: maxAbs });

    return true; // Keep processor alive
  }
}

registerProcessor('voice-processor', VoiceProcessor);
