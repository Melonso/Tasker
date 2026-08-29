const COMMAND_WORDS = new Set([
  "oznacz",
  "oznaczyc",
  "zakoncz",
  "zakonczyc",
  "skoncz",
  "skonczyc",
  "wykonane",
  "zrobione",
  "zadanie",
  "zadania",
  "task",
  "jako",
  "prosze",
  "mi",
  "moje",
  "to",
  "te",
  "tego",
  "termin",
  "przesun",
  "przesunac",
]);

export interface TaskMatchCandidate {
  id: string;
  title: string;
}

export interface RankedTaskMatch<T extends TaskMatchCandidate> {
  task: T;
  score: number;
  exact: boolean;
}

export interface TaskMatchResult<T extends TaskMatchCandidate> {
  task: T | null;
  ambiguous: boolean;
  ranked: RankedTaskMatch<T>[];
}

export function normalizeTaskText(value: string) {
  return value
    .toLocaleLowerCase("pl-PL")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/https?:\/\//g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokens(value: string, removeCommands: boolean) {
  const result = normalizeTaskText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !["www", "com", "org", "net", "pl"].includes(token));
  return removeCommands ? result.filter((token) => !COMMAND_WORDS.has(token)) : result;
}

function levenshtein(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? Math.max(left.length, right.length);
}

function tokenSimilarity(left: string, right: string) {
  if (left === right) return 1;
  if (Math.min(left.length, right.length) >= 4 && (left.startsWith(right) || right.startsWith(left))) return 0.92;

  let commonPrefix = 0;
  while (commonPrefix < Math.min(left.length, right.length) && left[commonPrefix] === right[commonPrefix]) {
    commonPrefix += 1;
  }
  if (commonPrefix >= 4 && commonPrefix / Math.min(left.length, right.length) >= 0.65) return 0.82;

  const similarity = 1 - levenshtein(left, right) / Math.max(left.length, right.length);
  return similarity >= 0.72 ? similarity * 0.9 : 0;
}

export function scoreTaskTitle(title: string, query: string) {
  const normalizedTitle = normalizeTaskText(title);
  const normalizedQuery = normalizeTaskText(query);
  if (!normalizedQuery) return { score: 0, exact: false };
  if (normalizedTitle === normalizedQuery) return { score: 1, exact: true };

  const queryTokens = tokens(query, true);
  const titleTokens = tokens(title, false);
  const effectiveQueryTokens = queryTokens.length ? queryTokens : tokens(query, false);
  if (!effectiveQueryTokens.length || !titleTokens.length) return { score: 0, exact: false };

  const coverage = effectiveQueryTokens.reduce((sum, queryToken) => {
    const best = titleTokens.reduce(
      (bestScore, titleToken) => Math.max(bestScore, tokenSimilarity(queryToken, titleToken)),
      0,
    );
    return sum + best;
  }, 0) / effectiveQueryTokens.length;

  const phraseBonus = normalizedTitle.includes(normalizedQuery) ? 0.08 : 0;
  return { score: Math.min(1, coverage + phraseBonus), exact: false };
}

export function matchTaskByQuery<T extends TaskMatchCandidate>(candidates: T[], query: string): TaskMatchResult<T> {
  const ranked = candidates
    .map((task) => ({ task, ...scoreTaskTitle(task.title, query) }))
    .filter((match) => match.score >= 0.45)
    .sort((left, right) => right.score - left.score || left.task.title.localeCompare(right.task.title, "pl"));
  const top = ranked[0];
  if (!top || top.score < 0.64) return { task: null, ambiguous: false, ranked: ranked.slice(0, 3) };

  const equallyExact = top.exact && ranked.filter((match) => match.exact).length > 1;
  const second = ranked[1];
  const tooClose = Boolean(second && second.score >= 0.62 && top.score - second.score < 0.1);
  const ambiguous = equallyExact || tooClose;
  return { task: ambiguous ? null : top.task, ambiguous, ranked: ranked.slice(0, 3) };
}
