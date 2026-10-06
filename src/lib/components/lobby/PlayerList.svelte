<script lang="ts">
	import type { PublicPlayer } from '../../types';

	let {
		players,
		meId,
		correctIds = [],
		onkick
	}: { players: PublicPlayer[]; meId?: string; correctIds?: string[]; onkick?: (id: string) => void } = $props();
</script>

<ul class="flex flex-col gap-2" aria-label="Players">
	{#each players as p (p.id)}
		<li
			class="glass flex items-center gap-3 px-3 py-2 {p.connected ? '' : 'opacity-50'} {p.id === meId ? 'border-oq-yellow' : ''}"
		>
			<span class="rank-num !w-8 !text-lg">{p.rank}</span>
			<span class="min-w-0 flex-1 truncate font-semibold">
				{p.name}{#if p.id === meId}<span class="ml-1 text-xs text-oq-yellow">(you)</span>{/if}
			</span>
			{#if correctIds.includes(p.id)}
				<span class="badge-delta" aria-label="guessed correctly">OK</span>
			{/if}
			<span class="display text-sm text-oq-blue">{p.score}</span>
			{#if onkick && p.id !== meId}
				<button class="btn btn-danger !min-h-8 !px-2 !py-0 text-xs" onclick={() => onkick(p.id)} aria-label={`Kick ${p.name}`}>Kick</button>
			{/if}
		</li>
	{:else}
		<li class="glass px-4 py-6 text-center text-oq-muted">Nobody here yet. Share the code!</li>
	{/each}
</ul>
