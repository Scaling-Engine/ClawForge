/**
 * AssemblyAI v3 real-time transcription WebSocket client.
 * Audio data flows directly from browser to AssemblyAI — never touches the server.
 */

const WS_URL = 'wss://streaming.assemblyai.com/v3/ws';

/**
 * Create a real-time transcriber connected to AssemblyAI v3 streaming API.
 *
 * @param {object} options
 * @param {string} options.token - Temporary auth token from getVoiceToken()
 * @param {number} [options.sampleRate=16000] - Audio sample rate
 * @param {(result: { text: string, isFinal: boolean }) => void} options.onTranscript - Called with transcript updates
 * @param {(message: string) => void} [options.onError] - Called on connection error
 * @returns {{ send: (buffer: ArrayBuffer) => void, close: () => void }}
 */
export function createTranscriber({ token, sampleRate = 16000, onTranscript, onError }) {
  const url = `${WS_URL}?sample_rate=${sampleRate}&token=${token}&format_turns=true`;
  const ws = new WebSocket(url);

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'Turn') {
        onTranscript({
          text: msg.transcript,
          isFinal: msg.turn_is_formatted === true,
        });
      }
    } catch {
      // Ignore malformed messages
    }
  };

  ws.onerror = () => {
    onError?.('Voice connection failed');
  };

  return {
    /**
     * Send PCM16 audio buffer to AssemblyAI.
     * Silently drops data if WebSocket is not yet open.
     * @param {ArrayBuffer} pcm16Buffer
     */
    send(pcm16Buffer) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(pcm16Buffer);
      }
    },

    /**
     * Close the transcription session.
     */
    close() {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'Terminate' }));
        ws.close();
      }
    },
  };
}
