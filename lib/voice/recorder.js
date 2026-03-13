/**
 * AudioWorklet-based microphone capture.
 * Streams PCM16 audio data and volume levels via callbacks.
 * Audio flows browser-to-AssemblyAI only — never touches the server.
 */

/**
 * Start capturing microphone audio via AudioWorklet.
 *
 * @param {object} options
 * @param {(buffer: ArrayBuffer) => void} options.onAudioData - Called with PCM16 audio buffer
 * @param {(volume: number) => void} [options.onVolume] - Called with volume level (0-1)
 * @param {(message: string) => void} [options.onError] - Called on error with friendly message
 * @returns {Promise<{ stop: () => void } | null>} Recorder handle, or null on error
 */
export async function startMicCapture({ onAudioData, onVolume, onError }) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
      },
    });

    const audioContext = new AudioContext({ sampleRate: 16000 });
    await audioContext.resume();
    await audioContext.audioWorklet.addModule('/voice-processor.js');

    const source = audioContext.createMediaStreamSource(stream);
    const processor = new AudioWorkletNode(audioContext, 'voice-processor');

    processor.port.onmessage = (event) => {
      onAudioData(event.data.pcm16.buffer);
      onVolume?.(event.data.volume);
    };

    // Connect source to processor but NOT to destination (prevents echo)
    source.connect(processor);

    return {
      stop() {
        processor.disconnect();
        source.disconnect();
        stream.getTracks().forEach((track) => track.stop());
        audioContext.close();
      },
    };
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      onError?.('Microphone permission denied');
    } else if (err.name === 'NotFoundError') {
      onError?.('No microphone found');
    } else {
      onError?.('Failed to start microphone');
    }
    return null;
  }
}
