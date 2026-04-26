export interface TextHunk {
  id: string;
  oldStartLine: number;
  oldLineCount: number;
  newStartLine: number;
  newLineCount: number;
  oldText: string;
  newText: string;
  summary: string;
}

const MAX_LCS_CELLS = 750_000;

export function computeLineHunks(oldText: string, newText: string): TextHunk[] {
  if (oldText === newText) {
    return [];
  }
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  if (oldLines.length * newLines.length > MAX_LCS_CELLS) {
    return [
      makeHunk("hunk_1", 0, oldLines.length, 0, newLines.length, oldLines, newLines)
    ];
  }

  const dp = buildLcsTable(oldLines, newLines);
  const hunks: TextHunk[] = [];
  let i = 0;
  let j = 0;
  let oldStart = 0;
  let newStart = 0;
  let oldChunk: string[] = [];
  let newChunk: string[] = [];

  const flush = () => {
    if (oldChunk.length === 0 && newChunk.length === 0) {
      return;
    }
    hunks.push(
      makeHunk(
        `hunk_${hunks.length + 1}`,
        oldStart,
        oldChunk.length,
        newStart,
        newChunk.length,
        oldChunk,
        newChunk
      )
    );
    oldChunk = [];
    newChunk = [];
  };

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      flush();
      i += 1;
      j += 1;
      continue;
    }
    if (oldChunk.length === 0 && newChunk.length === 0) {
      oldStart = i;
      newStart = j;
    }
    if (j < newLines.length && (i === oldLines.length || dp[i][j + 1] >= dp[i + 1][j])) {
      newChunk.push(newLines[j]);
      j += 1;
    } else if (i < oldLines.length) {
      oldChunk.push(oldLines[i]);
      i += 1;
    }
  }
  flush();
  return hunks;
}

export function detectLineEnding(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function splitLines(text: string): string[] {
  if (text.length === 0) {
    return [];
  }
  return text.split(/\r\n|\r|\n/);
}

function buildLcsTable(a: string[], b: string[]): number[][] {
  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  return dp;
}

function makeHunk(
  id: string,
  oldStartLine: number,
  oldLineCount: number,
  newStartLine: number,
  newLineCount: number,
  oldLines: string[],
  newLines: string[]
): TextHunk {
  return {
    id,
    oldStartLine,
    oldLineCount,
    newStartLine,
    newLineCount,
    oldText: oldLines.join("\n"),
    newText: newLines.join("\n"),
    summary: `-${oldLineCount} +${newLineCount} at old:${oldStartLine + 1} new:${newStartLine + 1}`
  };
}
