import { describe, expect, it } from 'vitest';
import { calculateScore } from '#lib/game/scoring.ts';

const S = 1000;
const D = 10000;
const E = S + D;

describe('calculateScore (50 point floor)', () => {
	it('awards 100 at full time', () => expect(calculateScore(S, E, S)).toBe(100));
	it('awards 75 at half time', () => expect(calculateScore(S, E, S + D / 2)).toBe(75));
	it('awards 50 at the last ms', () => expect(calculateScore(S, E, E - 1)).toBe(50));
	it('rounds a quarter left to 63', () => expect(calculateScore(S, E, S + 0.75 * D)).toBe(63));
	it('clamps clock skew (now before start) to 100', () => expect(calculateScore(S, E, S - 500)).toBe(100));
	it('stays within 50..100 across the whole round and beyond', () => {
		for (let now = S - 100; now <= E + 100; now += 7) {
			const p = calculateScore(S, E, now);
			expect(p).toBeGreaterThanOrEqual(50);
			expect(p).toBeLessThanOrEqual(100);
		}
	});
	it('is monotonically non increasing in time', () => {
		let prev = 100;
		for (let now = S; now < E; now += 13) {
			const p = calculateScore(S, E, now);
			expect(p).toBeLessThanOrEqual(prev);
			prev = p;
		}
	});
	it('returns the floor for a degenerate duration', () => expect(calculateScore(S, S, S)).toBe(50));
});
