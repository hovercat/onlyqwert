<script lang="ts">
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from '../../client/api';
	import type { PublicPlayer } from '../../types';

	let { player, settled, isMe, showDelta = true }: { player: PublicPlayer; settled: boolean; isMe: boolean; showDelta?: boolean } = $props();

	const rm = prefersReducedMotion();
	const score = new Tween(0, { duration: rm ? 0 : 900, easing: cubicOut });
	let first = true;

	$effect(() => {
		const target = settled ? player.score : player.score - player.lastDelta;
		score.set(target, first ? { duration: 0 } : undefined);
		first = false;
	});

	const prev = $derived(player.prevRank > 0 ? player.prevRank : player.rank);
	const move = $derived(prev - player.rank);
</script>

<div class="glass card-row" class:me={isMe}>
	<span class="rank-num">{settled ? player.rank : prev}</span>
	<span class="min-w-0 flex-1 truncate text-lg font-bold">{player.name}{isMe ? ' (you)' : ''}</span>
	{#if settled && showDelta}
		<span class="w-8 text-center text-lg font-extrabold {move > 0 ? 'up' : move < 0 ? 'down' : 'same'}" aria-label={move > 0 ? `up ${move}` : move < 0 ? `down ${-move}` : 'unchanged'}>
			{move > 0 ? '▲' : move < 0 ? '▼' : '='}
		</span>
		{#if player.lastDelta > 0}<span class="badge-delta">+{player.lastDelta}</span>{/if}
	{/if}
	<span class="display w-16 text-right text-2xl text-oq-yellow tabular-nums">{Math.round(score.current)}</span>
</div>
