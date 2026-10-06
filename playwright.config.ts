import { defineConfig } from '@playwright/test';

// Dedicated port (not 4173) so the suite never collides with a developer's preview server.
const PORT = Number(process.env.E2E_PORT ?? 5511);

export default defineConfig({
	webServer: {
		command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
		port: PORT,
		timeout: 180_000,
		reuseExistingServer: false
	},
	use: { baseURL: `http://localhost:${PORT}` },
	testMatch: '**/*.e2e.{ts,js}',
	// The preview server keeps all rooms in one process; tests use their own rooms, but stay serial for stable timing.
	workers: 1,
	timeout: 120_000
});
