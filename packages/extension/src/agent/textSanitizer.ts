export function stripMaybeFences(text: string): string {
  const trimmedStart = text.trimStart();
  if (!trimmedStart.startsWith("```")) {
    return text;
  }

  const firstNewline = trimmedStart.search(/\r\n|\n|\r/);
  if (firstNewline < 0) {
    return text;
  }

  const body = trimmedStart.slice(firstNewline).replace(/^\r\n|^\n|^\r/, "");
  const closingFence = body.match(/(\r\n|\n|\r)```[ \t]*\s*$/);
  if (!closingFence || closingFence.index === undefined) {
    return text;
  }

  return body.slice(0, closingFence.index);
}
