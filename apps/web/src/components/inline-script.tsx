/**
 * Script that runs while the HTML is parsed, before the first paint (theme, no flash).
 * On the client React would render it as an inert script and warn: the type is
 * "text/plain" there, as recommended by the Next.js guide on preventing flash before hydration.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
