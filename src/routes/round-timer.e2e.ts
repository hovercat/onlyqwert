import { expect, test } from '@playwright/test';

// Regression: with 10 rounds and 30 s per round the countdown must start at 30 s, not 30 / rounds.
test('round countdown uses secondsPerRound, independent of round count', async ({ page }) => {
	const created = await page.request.post('/api/rooms', {
		data: { settings: { generations: [1], rounds: 10, secondsPerRound: 30, hostPlays: true } }
	});
	expect(created.status()).toBe(201);
	const { code } = await created.json();

	await page.goto(`/itspikachu/${code}`);
	await page.waitForLoadState('networkidle');
	const started = await page.request.post(`/api/rooms/${code}/start`, { data: {} });
	expect(started.status(), await started.text()).toBe(200);

	const snap = await (await page.request.get(`/api/rooms/${code}`)).json();
	expect(snap.settings.rounds).toBe(10);
	expect(snap.round.endsAt - snap.round.startedAt).toBe(30_000);

	const timer = page.getByRole('timer');
	await expect(timer).toHaveAttribute('aria-label', /^(30|29) seconds left$/);
	await page.waitForTimeout(3000);
	const label = (await timer.getAttribute('aria-label')) ?? '';
	const secs = Number(label.split(' ')[0]);
	expect(secs).toBeGreaterThanOrEqual(25);
	expect(secs).toBeLessThanOrEqual(28);
});
