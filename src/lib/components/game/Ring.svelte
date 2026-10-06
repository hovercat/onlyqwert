<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		startedAt,
		endsAt,
		now,
		running,
		children
	}: { startedAt: number; endsAt: number; now: () => number; running: boolean; children: Snippet } = $props();

	const R = 46;
	const C = 2 * Math.PI * R;

	let frac = $state(1);
	let secs = $state(0);

	$effect(() => {
		if (!running) {
			frac = 0;
			secs = 0;
			return;
		}
		const total = Math.max(1, endsAt - startedAt);
		let raf = 0;
		const tick = () => {
			const left = Math.max(0, endsAt - now());
			frac = Math.min(1, left / total);
			secs = Math.ceil(left / 1000);
			raf = requestAnimationFrame(tick);
		};
		tick();
		return () => cancelAnimationFrame(raf);
	});

	const urgent = $derived(running && secs <= 5);
	const warn = $derived(running && !urgent && frac < 0.4);
</script>

<div class="ring" class:urgent class:warn role="timer" aria-label={running ? `${secs} seconds left` : 'Time is up'}>
	<svg viewBox="0 0 100 100" aria-hidden="true">
		<circle class="track" cx="50" cy="50" r={R} fill="none" stroke-width="4" />
		<circle
			class="bar"
			cx="50"
			cy="50"
			r={R}
			fill="none"
			stroke-width="4"
			stroke-linecap="round"
			stroke-dasharray={C}
			stroke-dashoffset={C * (1 - frac)}
		/>
	</svg>
	{#if running}<span class="secs" aria-hidden="true">{secs}</span>{/if}
	{@render children()}
</div>
