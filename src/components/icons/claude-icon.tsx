/**
 * Recreation of the Claude (Anthropic) brand mark —
 * the distinctive asterisk/spark icon used in Claude products.
 * 6 rounded rays radiating from center, 3 bars at 0°/60°/120°.
 */
export function ClaudeIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* 3 bars at 0°, 60°, 120° — creates the 6-ray Claude asterisk */}
      <rect x="10.8" y="1.5" width="2.4" height="21" rx="1.2" transform="rotate(0 12 12)" />
      <rect x="10.8" y="1.5" width="2.4" height="21" rx="1.2" transform="rotate(60 12 12)" />
      <rect x="10.8" y="1.5" width="2.4" height="21" rx="1.2" transform="rotate(120 12 12)" />
    </svg>
  );
}
