/**
 * CA INDIA (ICAI) logo — inline SVG so no asset-path issues.
 * White background is preserved as required.
 * Colours: Primary Blue #145886 · Saffron #F37920 · Green #55B848
 */
export default function CaIndiaLogo({ width = 108, height = 38 }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 128 44"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      aria-label="CA India – ICAI"
      role="img"
    >
      {/* White background */}
      <rect width="128" height="44" fill="white" rx="3" />

      {/* Bold "CA" */}
      <text
        x="4" y="34"
        fontFamily="'Arial Black', 'Arial Bold', Arial, sans-serif"
        fontWeight="900"
        fontSize="32"
        fill="#145886"
      >CA</text>

      {/* Tricolour tick – saffron (left stroke) */}
      <line x1="73" y1="8"   x2="80"  y2="26"  stroke="#F37920" strokeWidth="5.5" strokeLinecap="round" />
      {/* Tricolour tick – light grey (represents white for visibility on white background) */}
      <line x1="80" y1="26"  x2="83.5" y2="32" stroke="#DDDDDD" strokeWidth="5.5" strokeLinecap="round" />
      {/* Tricolour tick – green (right stroke) */}
      <line x1="83.5" y1="32" x2="116" y2="4"  stroke="#55B848" strokeWidth="5.5" strokeLinecap="round" />

      {/* "INDIA" text */}
      <text
        x="72" y="43"
        fontFamily="Arial, sans-serif"
        fontWeight="700"
        fontSize="9"
        fill="#145886"
        letterSpacing="2.4"
      >INDIA</text>
    </svg>
  );
}
