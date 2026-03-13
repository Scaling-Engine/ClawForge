/**
 * Voice feature detection.
 * Used to conditionally render the mic button only in supported browsers.
 */

/**
 * Check if the browser supports voice input (AudioWorklet + getUserMedia).
 * @returns {boolean}
 */
export function isVoiceSupported() {
  if (typeof window === 'undefined') return false;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  if (typeof AudioWorkletNode === 'undefined') return false;
  return true;
}
