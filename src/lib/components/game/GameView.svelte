<script lang="ts">
	import type { CorrectGuessResult, RoomStore } from '../../client/room.svelte';
	import PlayerList from '../lobby/PlayerList.svelte';
	import CorrectFeed from './CorrectFeed.svelte';
	import GuessInput from './GuessInput.svelte';
	import Ring from './Ring.svelte';

	let { store, code }: { store: RoomStore; code: string } = $props();

	const s = $derived(store.snapshot!);
	const round = $derived(s.round!);
	const active = $derived(s.phase === 'round_active');
	const myCorrect = $derived(store.correct.find((c) => c.playerId === store.playerId));
	let localPoints = $state<{ round: number; points: number } | null>(null);
	// Personal early reveal after the local player guessed correctly (others still see the silhouette).
	let mine = $state<{ round: number; name: string; generation: number; spriteUrl: string } | null>(null);
	const personal = $derived(mine && mine.round === round.index ? mine : null);
	function scored(r: CorrectGuessResult) {
		localPoints = { round: round.index, points: r.points };
		if (r.spriteUrl && r.pokemon) mine = { round: round.index, name: r.pokemon.name, generation: r.pokemon.generation, spriteUrl: r.spriteUrl };
	}
	const revealed = $derived((s.phase !== 'round_active' && s.revealed !== null) || (s.phase === 'round_active' && personal !== null));
	// The server provided spriteUrl is always used as is; ids are never handled client side.
	const shownSprite = $derived(s.revealed ? { url: s.revealed.spriteUrl, name: s.revealed.pokemon.name, generation: s.revealed.pokemon.generation } : personal ? { url: personal.spriteUrl, name: personal.name, generation: personal.generation } : null);
	const points = $derived(myCorrect?.points ?? (localPoints?.round === round.index ? localPoints.points : null));
	const locked = $derived(points !== null);
	const canPlay = $derived(!!store.playerId);
	const correctIds = $derived(store.correct.map((c) => c.playerId));
</script>

<div class="grid gap-5 pb-28 lg:grid-cols-[260px_minmax(0,1fr)_300px] lg:pb-0">
	<aside class="hidden lg:block" aria-label="Players">
		<h2 class="display mb-3 text-lg text-oq-blue">Players</h2>
		<PlayerList players={store.players} meId={store.playerId} {correctIds} />
	</aside>

	<section class="mx-auto flex w-full max-w-md flex-col gap-4 lg:max-w-lg">
		<Ring startedAt={round.startedAt} endsAt={round.endsAt} now={store.now} running={active}>
			<div class="stage" class:revealed>
				<img class="mask pixelated" src={round.maskUrl} alt={revealed ? '' : 'Mystery Pokémon silhouette'} draggable="false" />
				{#if shownSprite}
					<img class="sprite pixelated" src={shownSprite.url} alt={revealed ? shownSprite.name : ''} draggable="false" />
				{/if}
				<div class="flash"></div>
			</div>
		</Ring>

		<div class="min-h-16 text-center" aria-live="polite">
			{#if revealed && shownSprite}
				<p class="display text-3xl text-oq-yellow sm:text-4xl">{shownSprite.name}</p>
				<p class="text-sm text-oq-muted">
					Gen {shownSprite.generation}{s.phase !== 'round_active' && store.correct.length === 0 ? ' - nobody got it' : ''}
				</p>
			{:else}
				<p class="display text-xl text-oq-muted">Round {round.index + 1} / {round.total}</p>
			{/if}
		</div>

		<div class="lg:hidden"><CorrectFeed items={store.feed} meId={store.playerId} /></div>

		{#if canPlay}
			<div class="guess-bar">
				<GuessInput
					{code}
					round={round.index}
					{locked}
					{points}
					{active}
					onscored={scored}
				/>
			</div>
		{:else}
			<p class="glass p-3 text-center text-oq-muted">You are hosting. Watch the chat go wild!</p>
		{/if}
	</section>

	<aside class="hidden lg:block" aria-label="Live feed">
		<h2 class="display mb-3 text-lg text-oq-green">Got it!</h2>
		<CorrectFeed items={store.feed} meId={store.playerId} />
	</aside>
</div>
