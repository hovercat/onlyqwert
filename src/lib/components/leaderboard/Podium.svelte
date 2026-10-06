<script lang="ts">
	import type { PublicPlayer } from '../../types';

	let { players }: { players: PublicPlayer[] } = $props();

	const top = $derived(players.slice().sort((a, b) => a.rank - b.rank).slice(0, 3));
	// visual order: 2nd, 1st, 3rd
	const slots = $derived(
		[top[1], top[0], top[2]]
			.map((p, i) => ({ p, place: [2, 1, 3][i] }))
			.filter((x): x is { p: PublicPlayer; place: number } => !!x.p)
	);
</script>

<div class="mx-auto flex max-w-xl items-end justify-center gap-2 pt-6" role="group" aria-label="Podium">
	{#each slots as { p, place } (p.id)}
		<div class="flex flex-1 flex-col items-center">
			<p class="mb-1 max-w-full truncate text-center text-lg font-bold">{p.name}</p>
			<p class="display mb-2 text-oq-yellow">{p.score}</p>
			<div class="podium-col p{place} w-full">
				<span class="display text-4xl">{place}</span>
			</div>
		</div>
	{/each}
</div>
