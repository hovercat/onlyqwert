<script lang="ts">
	import { flip } from 'svelte/animate';
	import { elasticOut } from 'svelte/easing';
	import { prefersReducedMotion } from '../../client/api';
	import type { PublicPlayer } from '../../types';
	import ScoreCard from './ScoreCard.svelte';

	let { players, meId, final = false }: { players: PublicPlayer[]; meId?: string; final?: boolean } = $props();

	const rm = prefersReducedMotion();
	let settled = $state(false);

	$effect(() => {
		if (final) {
			settled = true;
			return;
		}
		const t = setTimeout(() => (settled = true), rm ? 0 : 900);
		return () => clearTimeout(t);
	});

	const start = (p: PublicPlayer) => (p.prevRank > 0 ? p.prevRank : p.rank);
	const order = $derived(
		[...players].sort((a, b) => (settled ? a.rank - b.rank : start(a) - start(b) || a.rank - b.rank))
	);
</script>

<ol class="mx-auto flex w-full max-w-2xl flex-col gap-2" aria-label="Leaderboard">
	{#each order as p (p.id)}
		<li animate:flip={{ duration: rm ? 0 : 700, easing: elasticOut }}>
			<ScoreCard player={p} {settled} isMe={p.id === meId} showDelta={!final} />
		</li>
	{/each}
</ol>
