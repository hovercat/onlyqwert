<script lang="ts">
	import { fly, scale } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { prefersReducedMotion } from '../../client/api';
	import type { FeedItem } from '../../client/room.svelte';

	let { items, meId }: { items: FeedItem[]; meId?: string } = $props();

	const shown = $derived([...items].reverse());
	const rm = prefersReducedMotion();
</script>

<div class="feed flex flex-row flex-wrap content-start gap-2 overflow-hidden max-lg:max-h-[5.5rem] lg:flex-col lg:flex-nowrap" aria-label="Correct guesses" role="log" aria-live="polite">
	{#each shown as f (f.key)}
		<div
			class="feed-item max-lg:!px-2 max-lg:!py-1 max-lg:text-sm"
			in:fly={{ x: rm ? 0 : 60, duration: rm ? 0 : 450 }}
			out:scale={{ duration: rm ? 0 : 150 }}
			animate:flip={{ duration: rm ? 0 : 300 }}
		>
			<span class="medal" class:m1={f.order === 1} class:m2={f.order === 2} class:m3={f.order === 3}>{f.order}</span>
			<span class="min-w-0 flex-1 truncate font-semibold">{f.name}{f.playerId === meId ? ' (you)' : ''}</span>
			<span class="display text-oq-green">+{f.points}</span>
		</div>
	{/each}
	{#if shown.length === 0}
		<p class="px-2 text-sm text-oq-muted">Be the first to name it!</p>
	{/if}
</div>
