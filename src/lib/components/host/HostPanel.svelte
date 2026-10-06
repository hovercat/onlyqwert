<script lang="ts">
	import { api } from '../../client/api';
	import type { Settings } from '../../types';
	import { LIMITS } from '../../types';

	let { code, settings, playerCount }: { code: string; settings: Settings; playerCount: number } = $props();

	const regions = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar', 'Paldea'];

	// svelte-ignore state_referenced_locally
	let draft = $state<Settings>({ ...settings, generations: [...settings.generations] });
	let pending = false;
	let rev = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let inflight: Promise<boolean> | null = null;
	let error = $state('');
	let hint = $state('');
	let starting = $state(false);
	let saving = $state(false);

	$effect(() => {
		const s = settings;
		if (!pending) draft = { ...s, generations: [...s.generations] };
	});

	async function doSave(): Promise<boolean> {
		const res = await api('PATCH', `/api/rooms/${code}/settings`, $state.snapshot(draft));
		error = res.ok ? '' : `Settings not saved: ${res.error ?? 'Could not save settings.'}`;
		return res.ok;
	}

	function save() {
		pending = true;
		saving = true;
		rev++;
		clearTimeout(timer);
		timer = setTimeout(() => void flush(), 250);
	}

	/** Sends any pending edit now and waits for it (and any in-flight save). Resolves true when the server has the draft. */
	async function flush(): Promise<boolean> {
		clearTimeout(timer);
		// Serialize saves so a later PATCH can never be overtaken by an earlier one.
		while (inflight) await inflight;
		const r = rev;
		const p = doSave();
		inflight = p;
		const ok = await p;
		if (inflight === p) inflight = null;
		if (rev === r) {
			saving = false;
			// Keep the draft protected from SSE resyncs until the server actually has it.
			if (ok) pending = false;
		}
		return ok;
	}

	function clamp(v: unknown, min: number, max: number, fallback: number): number {
		const n = Math.round(Number(v));
		return Number.isFinite(n) && v !== '' && v !== null ? Math.min(max, Math.max(min, n)) : fallback;
	}

	/** Typed input: save immediately when valid; clamp on blur with a visible hint. */
	function typed(field: 'rounds' | 'secondsPerRound', min: number, max: number) {
		const v = draft[field] as unknown;
		const n = Number(v);
		if (v !== null && v !== '' && Number.isInteger(n) && n >= min && n <= max) {
			hint = '';
			save();
		}
	}
	function commit(field: 'rounds' | 'secondsPerRound', min: number, max: number, label: string) {
		const raw = draft[field] as unknown;
		const fixed = clamp(raw, min, max, settings[field]);
		if (fixed !== Number(raw)) hint = `${label} must be between ${min} and ${max}. Set to ${fixed}.`;
		else hint = '';
		if (fixed !== Number(raw) || raw === null || raw === '') {
			draft[field] = fixed;
			save();
		}
	}

	function toggleGen(g: number) {
		const has = draft.generations.includes(g);
		if (has && draft.generations.length === 1) return;
		draft.generations = has ? draft.generations.filter((x) => x !== g) : [...draft.generations, g].sort((a, b) => a - b);
		save();
	}

	async function start() {
		starting = true;
		error = '';
		draft.rounds = clamp(draft.rounds, LIMITS.roundsMin, LIMITS.roundsMax, settings.rounds);
		draft.secondsPerRound = clamp(draft.secondsPerRound, LIMITS.secondsMin, LIMITS.secondsMax, settings.secondsPerRound);
		const ok = await flush();
		if (!ok) {
			starting = false;
			return;
		}
		const res = await api('POST', `/api/rooms/${code}/start`);
		if (!res.ok) error = res.error ?? 'Could not start.';
		starting = false;
	}
</script>

<section class="glass flex flex-col gap-5 p-5" aria-label="Game settings">
	<h2 class="display text-2xl text-oq-blue">Game settings</h2>

	<fieldset>
		<legend class="mb-2 text-sm font-semibold text-oq-muted">Generations</legend>
		<div class="flex flex-wrap gap-2">
			{#each regions as r, i (r)}
				<button
					type="button"
					class="chip"
					aria-pressed={draft.generations.includes(i + 1)}
					aria-label={`Generation ${i + 1}, ${r}`}
					title={r}
					onclick={() => toggleGen(i + 1)}
				>
					{i + 1}
				</button>
			{/each}
		</div>
	</fieldset>

	<div>
		<label for="rounds" class="flex justify-between text-sm font-semibold text-oq-muted">
			<span>Rounds</span>
			<input id="rounds-num" type="number" inputmode="numeric" aria-label="Rounds (number)" class="num" min={LIMITS.roundsMin} max={LIMITS.roundsMax} bind:value={draft.rounds}
				oninput={() => typed('rounds', LIMITS.roundsMin, LIMITS.roundsMax)} onblur={() => commit('rounds', LIMITS.roundsMin, LIMITS.roundsMax, 'Rounds')} />
		</label>
		<input id="rounds" type="range" class="slider" min={LIMITS.roundsMin} max={LIMITS.roundsMax} bind:value={draft.rounds} oninput={() => { hint = ''; save(); }} />
	</div>

	<div>
		<label for="secs" class="flex justify-between text-sm font-semibold text-oq-muted">
			<span>Seconds per round</span>
			<input id="secs-num" type="number" inputmode="numeric" aria-label="Seconds per round (number)" class="num" min={LIMITS.secondsMin} max={LIMITS.secondsMax} bind:value={draft.secondsPerRound}
				oninput={() => typed('secondsPerRound', LIMITS.secondsMin, LIMITS.secondsMax)} onblur={() => commit('secondsPerRound', LIMITS.secondsMin, LIMITS.secondsMax, 'Seconds')} />
		</label>
		<input id="secs" type="range" class="slider" min={LIMITS.secondsMin} max={LIMITS.secondsMax} bind:value={draft.secondsPerRound} oninput={() => { hint = ''; save(); }} />
	</div>

	<label class="flex cursor-pointer items-center justify-between gap-3 font-semibold">
		<span>I play too <span class="block text-sm font-normal text-oq-muted">Host guesses and scores like everyone else</span></span>
		<input type="checkbox" class="h-6 w-6 accent-[#ffcb05]" bind:checked={draft.hostPlays} onchange={save} />
	</label>

	<button class="btn btn-primary text-lg" onclick={start} disabled={starting || saving || playerCount < 1}>
		{starting ? 'Starting...' : saving ? 'Saving...' : 'Start game'}
	</button>
	{#if playerCount < 1}<p class="text-sm text-oq-muted">Waiting for at least one player to join.</p>{/if}
	{#if hint}<p class="text-sm text-oq-yellow" role="status">{hint}</p>{/if}
	{#if error}<p class="rounded-xl border border-oq-red p-3 font-semibold text-oq-red" role="alert">{error}</p>{/if}
</section>

<style>
	.num {
		width: 5rem;
		text-align: right;
		border-radius: 0.5rem;
		padding: 0.15rem 0.5rem;
		background: rgb(255 255 255 / 0.08);
		color: #ffcb05;
		font-weight: 800;
	}
</style>
