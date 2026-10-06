import { expect, test } from '@playwright/test';

// Regression: typing 90 seconds and pressing Start right away must start a 90 s round.
test('typed seconds are saved before Start and used for the round', async ({ page, browser }) => {
	await page.goto('/itspikachu');
	await page.getByRole('button', { name: /create room/i }).first().click();
	await page.waitForURL(/\/itspikachu\/[A-Z0-9]{6}$/);
	const code = page.url().split('/').pop()!;

	const ctx = await browser.newContext();
	const guest = await ctx.newPage();
	const join = await guest.request.post(`${new URL(page.url()).origin}/api/rooms/${code}/join`, { data: { name: 'Ann' } });
	expect(join.ok()).toBe(true);

	const secs = page.getByLabel('Seconds per round (number)');
	await secs.fill('90');
	await page.getByRole('button', { name: /start game|saving/i }).click();

	await expect(page.getByRole('timer')).toHaveAttribute('aria-label', /^(90|89) seconds left$/);
	const snap = await (await page.request.get(`/api/rooms/${code}`)).json();
	expect(snap.round.endsAt - snap.round.startedAt).toBe(90_000);
	await ctx.close();
});

test('typed seconds above the limit are clamped with a visible hint', async ({ page }) => {
	await page.goto('/itspikachu');
	await page.getByRole('button', { name: /create room/i }).click();
	await page.waitForURL(/\/itspikachu\/[A-Z0-9]{6}$/);
	const secs = page.getByLabel('Seconds per round (number)');
	await secs.fill('204');
	await secs.blur();
	await expect(secs).toHaveValue('120');
	await expect(page.getByText(/Seconds must be between/)).toContainText('between 5 and 120');
});
