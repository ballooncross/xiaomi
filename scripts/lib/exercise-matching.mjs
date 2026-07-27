const TOKEN_ALIASES = new Map([
  ['bb', 'barbell'],
  ['bodyweight', 'body weight'],
  ['bw', 'body weight'],
  ['db', 'dumbbell'],
  ['ezbar', 'ez bar'],
  ['kb', 'kettlebell'],
  ['ohp', 'overhead press'],
  ['rdl', 'romanian deadlift'],
  ['trx', 'suspension'],
  ['ninety', '90'],
  ['pressups', 'push up'],
  ['pushups', 'push up'],
  ['pullups', 'pull up'],
  ['situps', 'sit up']
]);

const STOP_WORDS = new Set(['exercise', 'movement', 'the']);

/**
 * @typedef {object} ExerciseRecord
 * @property {string} id
 * @property {string} name
 * @property {string[]} [aliases]
 * @property {string[]} [primaryMuscles]
 * @property {string[]} [secondaryMuscles]
 * @property {string[]} [equipment]
 * @property {string} [bodyPart]
 * @property {string} [description]
 */

/**
 * @typedef {object} RankedCandidate
 * @property {ExerciseRecord} candidate
 * @property {number} score
 */

/** @typedef {{ score: number, weight: number }} ScoreDimension */

/** @param {unknown} value */
export function normalizeName(value = '') {
  const expanded = String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/(\d+)\s*\/\s*(\d+)/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return expanded
    .split(' ')
    .flatMap((token) => (TOKEN_ALIASES.get(token) ?? token).split(' '))
    .map(singularize)
    .filter((token) => token && !STOP_WORDS.has(token))
    .join(' ')
    .replace(/\b(push|pull|sit) ups?\b/g, '$1 up');
}

/** @param {string} value */
export function nameTokens(value) {
  return new Set(normalizeName(value).split(' ').filter(Boolean));
}

/** @param {string} value */
export function exerciseAliases(value) {
  const normalized = normalizeName(value);
  if (!normalized) return [];

  const aliases = new Set();
  /** @type {Array<[RegExp, string]>} */
  const substitutions = [
    [/\bside\b/g, 'lateral'],
    [/\blateral\b/g, 'side'],
    [/\brear\b/g, 'reverse'],
    [/\breverse\b/g, 'rear'],
    [/\bdrop\b/g, 'curtsy'],
    [/\bcurtsy\b/g, 'drop']
  ];
  for (const [pattern, replacement] of substitutions) {
    const alias = normalized.replace(pattern, replacement);
    if (alias !== normalized) aliases.add(alias);
  }
  return [...aliases];
}

/**
 * @param {ExerciseRecord} target
 * @param {ExerciseRecord} candidate
 */
export function hasExactNameMatch(target, candidate) {
  const targetNames = [target.name, ...(target.aliases ?? [])]
    .map(normalizeName)
    .filter(Boolean);
  const candidateNames = new Set(
    [candidate.name, ...(candidate.aliases ?? [])].map(normalizeName).filter(Boolean)
  );
  return targetNames.some((name) => candidateNames.has(name));
}

/**
 * @param {ExerciseRecord} target
 * @param {ExerciseRecord} candidate
 */
export function hasCompatibleEquipment(target, candidate) {
  const targetEquipment = equipmentTokens(target.equipment ?? []);
  const candidateEquipment = equipmentTokens(candidate.equipment ?? []);
  if (!candidateEquipment.size) return true;

  const bodyWeightOnly = [...candidateEquipment].every((token) =>
    ['body', 'weight', 'bodyweight', 'none'].includes(token)
  );
  if (bodyWeightOnly) return targetEquipment.size === 0 || targetEquipment.has('body');

  const targetNameTokens = new Set(
    [target.name, ...(target.aliases ?? [])].flatMap((name) => [...nameTokens(name)])
  );
  if (targetEquipment.size) {
    return (
      intersectionSize(targetEquipment, candidateEquipment) > 0 ||
      intersectionSize(targetNameTokens, candidateEquipment) > 0
    );
  }

  return intersectionSize(targetNameTokens, candidateEquipment) > 0;
}

/**
 * @param {ExerciseRecord} target
 * @param {ExerciseRecord} candidate
 */
export function scoreCandidate(target, candidate) {
  const nameScore = bestNameScore(
    [target.name, ...(target.aliases ?? [])],
    [candidate.name, ...(candidate.aliases ?? [])]
  );
  const dimensions = [{ score: nameScore, weight: 0.72 }];

  addSetDimension(
    dimensions,
    [...(target.primaryMuscles ?? []), ...(target.secondaryMuscles ?? [])],
    [...(candidate.primaryMuscles ?? []), ...(candidate.secondaryMuscles ?? [])],
    0.14
  );
  addSetDimension(dimensions, target.equipment ?? [], candidate.equipment ?? [], 0.08);
  addTextDimension(dimensions, target.bodyPart, candidate.bodyPart, 0.03);
  addDescriptionDimension(dimensions, target.description, candidate.description, 0.03);

  const weighted = dimensions.reduce((sum, item) => sum + item.score * item.weight, 0);
  const weight = dimensions.reduce((sum, item) => sum + item.weight, 0);
  return roundScore(weight ? weighted / weight : 0);
}

/**
 * @param {ExerciseRecord} target
 * @param {ExerciseRecord[]} candidates
 * @param {number} limit
 */
export function rankCandidates(target, candidates, limit = 5) {
  return candidates
    .map((candidate) => ({ candidate, score: scoreCandidate(target, candidate) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.candidate.name.localeCompare(b.candidate.name) ||
        String(a.candidate.id).localeCompare(String(b.candidate.id))
    )
    .slice(0, limit);
}

/**
 * @param {RankedCandidate[]} ranked
 * @param {{ minimumScore?: number, minimumMargin?: number }} options
 */
export function chooseAutomaticMatch(
  ranked,
  { minimumScore = 0.9, minimumMargin = 0.08 } = {}
) {
  const first = ranked[0];
  if (!first) return null;
  const secondScore = ranked[1]?.score ?? 0;
  const margin = roundScore(first.score - secondScore);
  const exact = first.score >= 0.995;

  if (exact && secondScore < 0.995) {
    return { ...first, margin, method: 'exact' };
  }
  if (first.score >= minimumScore && margin >= minimumMargin) {
    return { ...first, margin, method: 'scored' };
  }
  return null;
}

/**
 * @param {string[]} leftValues
 * @param {string[]} rightValues
 */
function bestNameScore(leftValues, rightValues) {
  let best = 0;
  for (const left of leftValues.filter(Boolean)) {
    for (const right of rightValues.filter(Boolean)) {
      best = Math.max(best, pairNameScore(left, right));
    }
  }
  return best;
}

/**
 * @param {string} left
 * @param {string} right
 */
function pairNameScore(left, right) {
  const normalizedLeft = normalizeName(left);
  const normalizedRight = normalizeName(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;

  const leftTokens = nameTokens(normalizedLeft);
  const rightTokens = nameTokens(normalizedRight);
  const tokenScore = diceScore(leftTokens, rightTokens);
  const charScore = characterSimilarity(normalizedLeft, normalizedRight);
  let score = tokenScore * 0.68 + charScore * 0.32;

  const intersection = intersectionSize(leftTokens, rightTokens);
  const smallerSize = Math.min(leftTokens.size, rightTokens.size);
  if (smallerSize >= 2 && intersection === smallerSize) {
    score = Math.max(score, smallerSize === Math.max(leftTokens.size, rightTokens.size) ? 1 : 0.88);
  }
  return roundScore(score);
}

/**
 * @param {ScoreDimension[]} dimensions
 * @param {string[]} left
 * @param {string[]} right
 * @param {number} weight
 */
function addSetDimension(dimensions, left, right, weight) {
  const leftSet = new Set(left.map(normalizeName).filter(Boolean));
  const rightSet = new Set(right.map(normalizeName).filter(Boolean));
  if (!leftSet.size || !rightSet.size) return;
  dimensions.push({ score: diceScore(leftSet, rightSet), weight });
}

/**
 * @param {ScoreDimension[]} dimensions
 * @param {string | undefined} left
 * @param {string | undefined} right
 * @param {number} weight
 */
function addTextDimension(dimensions, left, right, weight) {
  if (!left || !right) return;
  dimensions.push({
    score: normalizeName(left) === normalizeName(right) ? 1 : 0,
    weight
  });
}

/**
 * @param {ScoreDimension[]} dimensions
 * @param {string | undefined} left
 * @param {string | undefined} right
 * @param {number} weight
 */
function addDescriptionDimension(dimensions, left, right, weight) {
  if (!left || !right) return;
  const leftTokens = descriptionTokens(left);
  const rightTokens = descriptionTokens(right);
  if (!leftTokens.size || !rightTokens.size) return;
  dimensions.push({ score: diceScore(leftTokens, rightTokens), weight });
}

/** @param {string} value */
function descriptionTokens(value) {
  return new Set(
    normalizeName(value)
      .split(' ')
      .filter((token) => token.length > 3 && !STOP_WORDS.has(token))
  );
}

/** @param {string[]} values */
function equipmentTokens(values) {
  return new Set(
    values
      .flatMap((value) => normalizeName(value).split(' '))
      .filter((token) => token && !['equipment', 'machine'].includes(token))
  );
}

/**
 * @param {Set<string>} left
 * @param {Set<string>} right
 */
function diceScore(left, right) {
  if (!left.size || !right.size) return 0;
  return (2 * intersectionSize(left, right)) / (left.size + right.size);
}

/**
 * @param {Set<string>} left
 * @param {Set<string>} right
 */
function intersectionSize(left, right) {
  let count = 0;
  for (const item of left) {
    if (right.has(item)) count += 1;
  }
  return count;
}

/**
 * @param {string} left
 * @param {string} right
 */
function characterSimilarity(left, right) {
  const maxLength = Math.max(left.length, right.length);
  if (!maxLength) return 1;
  return 1 - levenshtein(left, right) / maxLength;
}

/**
 * @param {string} left
 * @param {string} right
 */
function levenshtein(left, right) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  let current = new Array(right.length + 1);
  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
    }
    [previous, current] = [current, previous];
  }
  return previous[right.length];
}

/** @param {string} token */
function singularize(token) {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith('ses')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

/** @param {number} value */
function roundScore(value) {
  return Math.round(value * 10000) / 10000;
}
