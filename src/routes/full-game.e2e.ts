import { readFileSync } from 'node:fs';
import { expect, request as pwRequest, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

const gen1: string[] = (
	JSON.parse(readFileSync('src/lib/data/pokemon.json', 'utf8')) as { name: string; generation: number }[]
)
	.filter((p) => p.generation === 1)
	.map((p) => p.name);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The answer is secret, so a third "scout" player (API only) tries every gen 1 name (below the
 * 20 guesses/s throttle) until the server says correct, and hands the name to the two UI players.
 */
async function scoutAnswer(scout: APIRequestContext, code: string, round: number): Promise<{ guess: string; shown: string }> {
	for (const name of gen1) {
		const res = await scout.post(`/api/rooms/${code}/guess`, { data: { value: name, round } });
		if (res.status() === 429) {
			await sleep(1100);
			continue;
		}
		const body = await res.json();
		// both Nidoran forms normalize to the same guess, so use the name the server shows
		if (body.status === 'correct') return { guess: name, shown: body.pokemon.name };
		await sleep(55);
	}
	throw new Error('answer not found in generation 1');
}

const noHorizontalScroll = (page: Page) =>
	page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('desktop host and mobile player play a full two round game', async ({ browser, baseURL }) => {
	const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const mobile = await browser.newContext({
		viewport: { width: 390, height: 844 },
		isMobile: true,
		hasTouch: true,
		deviceScaleFactor: 3
	});
	const host = await desktop.newPage();
	const phone = await mobile.newPage();
	const scout = await pwRequest.newContext({ baseURL });
	const errors: string[] = [];
	for (const p of [host, phone]) p.on('pageerror', (e) => errors.push(e.message));

	try {
		// Host creates a room (and plays too)
		await host.goto('/itspikachu');
		await host.waitForLoadState('networkidle');
		await host.getByLabel('Your name').fill('Streamer');
		await host.getByRole('button', { name: 'Create room' }).click();
		await host.waitForURL(/\/itspikachu\/[A-Z0-9]{6}$/);
		const code = host.url().split('/').pop()!;
		await host.waitForLoadState('networkidle');
		const set = await host.request.patch(`/api/rooms/${code}/settings`, {
			data: { generations: [1], rounds: 2, secondsPerRound: 60 }
		});
		expect(set.status()).toBe(200);

		// Mobile player joins through the entry page
		await phone.goto('/itspikachu');
		await phone.waitForLoadState('networkidle');
		await phone.getByLabel('Room code').fill(code);
		await phone.getByLabel('Nickname').fill('Misty');
		await phone.getByRole('button', { name: 'Join', exact: true }).click();
		await phone.waitForURL(`**/itspikachu/${code}`);
		expect(await noHorizontalScroll(phone)).toBe(true);

		// Scout joins by API
		expect((await scout.post(`/api/rooms/${code}/join`, { data: { name: 'Scout' } })).status()).toBe(201);

		await expect(host.getByLabel('Players').getByText('Misty')).toBeVisible();
		await expect(phone.getByText('Streamer').first()).toBeVisible();

		await host.getByRole('button', { name: 'Start game' }).click();

		for (const round of [0, 1]) {
			const guessHost = host.getByLabel('Type the Pokémon name');
			const guessPhone = phone.getByLabel('Type the Pokémon name');
			await expect(guessHost).toBeEnabled();
			await expect(guessPhone).toBeEnabled();
			await expect(host.getByRole('timer')).toBeVisible();
			await expect(phone.getByAltText('Mystery Pokémon silhouette')).toBeVisible();
			expect(await noHorizontalScroll(phone)).toBe(true);

			const snap = await (await host.request.get(`/api/rooms/${code}`)).json();
			expect(snap.round.index).toBe(round);
			expect(snap.revealed).toBeNull();

			// a wrong guess changes nothing visible
			await guessPhone.fill('definitely not a pokemon');
			await expect(guessPhone).toBeEnabled();

			const { guess: answer, shown } = await scoutAnswer(scout, code, round);
			await guessPhone.fill(answer);
			await expect(guessPhone).toBeDisabled();
			await expect(guessPhone).toHaveAttribute('placeholder', 'Nice one!');
			await guessHost.fill(answer.toUpperCase());
			await expect(guessHost).toHaveAttribute('placeholder', 'Nice one!');

			// everyone correct -> early end, the real Pokemon is revealed
			await expect(host.getByText(shown, { exact: true }).first()).toBeVisible();
			await expect(phone.getByText(shown, { exact: true }).first()).toBeVisible();

			// leaderboard on both screens, showing all three players
			await expect(host.getByRole('heading', { name: 'Leaderboard' })).toBeVisible({ timeout: 15_000 });
			await expect(phone.getByRole('heading', { name: 'Leaderboard' })).toBeVisible({ timeout: 15_000 });
			for (const p of [host, phone]) {
				const list = p.getByRole('list', { name: 'Leaderboard' });
				for (const n of ['Streamer', 'Misty', 'Scout']) await expect(list.getByText(n)).toBeVisible();
			}
			expect(await noHorizontalScroll(phone)).toBe(true);

			const after = await (await host.request.get(`/api/rooms/${code}`)).json();
			const scores = Object.fromEntries(after.players.map((p: { name: string; score: number }) => [p.name, p.score]));
			expect(scores.Scout).toBeGreaterThanOrEqual(50 * (round + 1));
			expect(scores.Misty).toBeGreaterThanOrEqual(50 * (round + 1));
			expect(scores.Streamer).toBeGreaterThanOrEqual(50 * (round + 1));

			await host.getByRole('button', { name: round === 0 ? 'Next round' : 'Final results' }).click();
		}

		// Final results with podium, then play again returns everyone to the lobby with zero scores
		for (const p of [host, phone]) {
			await expect(p.getByRole('heading', { name: 'Final results' })).toBeVisible();
			await expect(p.getByRole('group', { name: 'Podium' })).toBeVisible();
		}
		expect(await noHorizontalScroll(phone)).toBe(true);
		await host.getByRole('button', { name: 'Play again' }).click();
		await expect(host.getByRole('button', { name: 'Start game' })).toBeVisible();
		await expect(phone.getByRole('button', { name: 'Rename' })).toBeVisible();
		const lobby = await (await host.request.get(`/api/rooms/${code}`)).json();
		expect(lobby.phase).toBe('lobby');
		expect(lobby.players.every((p: { score: number }) => p.score === 0)).toBe(true);
		expect(errors).toEqual([]);
	} finally {
		await scout.dispose();
		await desktop.close();
		await mobile.close();
	}
});
