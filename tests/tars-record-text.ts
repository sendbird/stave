/**
 * A rendered record's text in reading order: tags become spaces and runs of
 * space collapse, so a test reads a row as "Pause Verified result click Applied"
 * however its parts are split into elements. Entities stay encoded.
 */
export function tarsRecordText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
