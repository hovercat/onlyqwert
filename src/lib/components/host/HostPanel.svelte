<script lang="ts">
	import { api } from '../../client/api';
	import type { Settings } from '../../types';
	import { LIMITS } from '../../types';

	let { code, settings, playerCount }: { code: string; settings: Settings; playerCount: number } = $props();

	const regions = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar', 'Paldea'];

	// svelte-ignore state_referenced_locally
	let draft = $state<Settings>({ ...settings, generations: [...settings.generations] });
	let pending = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let error = $state('');
	let starting = $state(false);

	$effect(() => {
		const s = settings;
		if (!pending) draft = { ...s, generations: [...s.generations] };
	});

	function save() {
		pending = true;
		clearTimeout(timer);
		timer = setTimeout(async () => {
			const res = await api('PATCH', `/api/rooms/${code}/settings`, draft);
			pending = false;
			error = res.ok ? '' : (res.error ?? 'Could not save settings.');
		}, 250);
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
			<span>Rounds</span><span class="display text-oq-yellow">{draft.rounds}</span>
		</label>
		<input id="rounds" type="range" class="slider" min={LIMITS.roundsMin} max={LIMITS.roundsMax} bind:value={draft.rounds} oninput={save} />
	</div>

	<div>
		<label for="secs" class="flex justify-between text-sm font-semibold text-oq-muted">
			<span>Seconds per round</span><span class="display text-oq-yellow">{draft.secondsPerRound}s</span>
		</label>
		<input id="secs" type="range" class="slider" min={LIMITS.secondsMin} max={LIMITS.secondsMax} bind:value={draft.secondsPerRound} oninput={save} />
	</div>

	<label class="flex cursor-pointer items-center justify-between gap-3 font-semibold">
		<span>I play too <span class="block text-sm font-normal text-oq-muted">Host guesses and scores like everyone else</span></span>
		<input type="checkbox" class="h-6 w-6 accent-[#ffcb05]" bind:checked={draft.hostPlays} onchange={save} />
	</label>

	<button class="btn btn-primary text-lg" onclick={start} disabled={starting || playerCount < 1}>
		{starting ? 'Starting...' : 'Start game'}
	</button>
	{#if playerCount < 1}<p class="text-sm text-oq-muted">Waiting for at least one player to join.</p>{/if}
	{#if error}<p class="font-semibold text-oq-red" role="alert">{error}</p>{/if}
</section>
