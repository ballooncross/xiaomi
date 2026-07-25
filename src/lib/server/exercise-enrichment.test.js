import { describe, expect, it } from 'vitest';
import {
  chooseAutomaticMatch,
  normalizeName,
  rankCandidates,
  scoreCandidate
} from '../../../scripts/lib/exercise-matching.mjs';

/**
 * @typedef {object} ExerciseRecord
 * @property {string} id
 * @property {string} name
 * @property {string[]} aliases
 * @property {string[]} primaryMuscles
 * @property {string[]} secondaryMuscles
 * @property {string[]} equipment
 * @property {string} bodyPart
 * @property {string} description
 */

/**
 * @param {string} id
 * @param {string} name
 * @param {Partial<ExerciseRecord>} overrides
 * @returns {ExerciseRecord}
 */
const exercise = (id, name, overrides = {}) => ({
  id,
  name,
  aliases: [],
  primaryMuscles: [],
  secondaryMuscles: [],
  equipment: [],
  bodyPart: '',
  description: '',
  ...overrides
});

describe('exercise enrichment matching', () => {
  it('normalizes Garmin separators, plurals, and equipment abbreviations', () => {
    expect(normalizeName('DB Push-Ups')).toBe('dumbbell push up');
    expect(normalizeName('NINETY_NINETY_HIP_SWITCH')).toBe('90 90 hip switch');
  });

  it('matches an exact source alias', () => {
    const target = exercise('garmin:ROW:T_BAR_ROW', 'T-Bar Row', {
      aliases: ['T_BAR_ROW'],
      primaryMuscles: ['LATS'],
      equipment: ['BARBELL']
    });
    const candidates = [
      exercise('source:1', 'Bent-over Row'),
      exercise('source:2', 'T Bar Row', {
        primaryMuscles: ['lats'],
        equipment: ['barbell']
      })
    ];

    const ranked = rankCandidates(target, candidates);
    expect(ranked[0].candidate.id).toBe('source:2');
    expect(chooseAutomaticMatch(ranked)?.method).toBe('exact');
  });

  it('uses muscle and equipment agreement to separate identical names', () => {
    const target = exercise('garmin:ROW:CABLE_ROW', 'Cable Row', {
      primaryMuscles: ['LATS'],
      equipment: ['CABLE'],
      bodyPart: 'back'
    });
    const candidates = [
      exercise('source:back', 'Cable Row', {
        primaryMuscles: ['lats'],
        equipment: ['cable'],
        bodyPart: 'back'
      }),
      exercise('source:arms', 'Cable Row', {
        primaryMuscles: ['biceps'],
        equipment: ['cable'],
        bodyPart: 'upper arms'
      })
    ];

    const ranked = rankCandidates(target, candidates);
    expect(ranked[0].candidate.id).toBe('source:back');
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(chooseAutomaticMatch(ranked)?.candidate.id).toBe('source:back');
  });

  it('keeps tied candidates unresolved', () => {
    const target = exercise('garmin:WARM_UP:ARM_CIRCLES', 'Arm Circles');
    const candidates = [
      exercise('source:left', 'Arm Circles'),
      exercise('source:right', 'Arm Circles')
    ];

    expect(chooseAutomaticMatch(rankCandidates(target, candidates))).toBeNull();
  });

  it('does not accept a weak name-only candidate', () => {
    const target = exercise('garmin:SQUAT:GOBLET_SQUAT', 'Goblet Squat');
    const candidate = exercise('source:jump', 'Squat Jump');
    expect(scoreCandidate(target, candidate)).toBeLessThan(0.9);
  });
});
