'use client';

/**
 * Animated volume level visualization for voice recording.
 * Renders 5 vertical bars with staggered heights driven by real-time volume.
 */
const SCALES = [0.4, 0.7, 1.0, 0.7, 0.4];

export function VoiceBars({ volume = 0 }) {
  return (
    <span className="flex items-center gap-0.5 h-4">
      {SCALES.map((scale, i) => (
        <span
          key={i}
          className="w-0.5 rounded-full bg-red-500 transition-all duration-75"
          style={{ height: `${Math.max(2, volume * scale * 16)}px` }}
        />
      ))}
    </span>
  );
}
