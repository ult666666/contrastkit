# Download palette tokens

Add **Download tokens JSON** beside the existing palette actions. The download is
`contrastkit-tokens.json`, containing all actual palette hex colors and one declared
pair for the currently selected foreground, background, WCAG level and use. CVD
simulation changes only the preview; it must never change exported colors.

Reuse the current editor, reducer, validation and live announcements. Disable export
while names are empty or duplicated, using the editor's trimmed/case-insensitive
name rules. Explain the reason in a visible polite live hint associated with the
button. Also reject names beginning with `$`, because the existing CLI treats them
as metadata. Trim surrounding name whitespace in the exported keys and references;
preserve dots and unusual ordinary keys such as `__proto__` without data loss.

Approaches: a pure serializer and a small browser-download helper called by App
(chosen: keeps the CLI schema testable and React event handling simple); embedding
everything in JSX (harder to verify); a shared generic import/export framework
(unnecessary scope). No new production dependencies, import workflow or redesign.
The parent task explicitly authorized inline execution without another approval loop.

The OS download boundary can be captured in jsdom, but Blob content and CLI work are
real. The app test command builds the CLI first. Test default failing pair → download
→ CLI exit 1, apply the real suggested fix → download → CLI exit 0. Cover every
target, each CVD simulation, invalid-name recovery, unusual keys and download failure.
