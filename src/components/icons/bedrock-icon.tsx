/**
 * Bedrock AI mark — three strata, narrowing downward.
 *
 * Replaces the previous icon, which was a recreation of the Claude (Anthropic)
 * asterisk. The assistant runs on OpenAI as of 2026-09-06, so shipping
 * Anthropic's brand mark on it was wrong twice over: it named the wrong
 * provider, and it used a trademark this product has no claim to.
 *
 * Deliberately plain geometry — it has to stay legible at 14px in a sidebar and
 * at 24px in the mobile bar, in both themes, with no gradient or detail to lose.
 */
export function BedrockIcon({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="3.4" rx="1.7" />
      <rect x="5" y="10.3" width="14" height="3.4" rx="1.7" opacity="0.75" />
      <rect x="7" y="15.6" width="10" height="3.4" rx="1.7" opacity="0.5" />
    </svg>
  );
}
