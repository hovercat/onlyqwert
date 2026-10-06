<script lang="ts">
	import { api } from '../../client/api';
	import type { GuessResponse } from '../../types';
	import type { CorrectGuessResult } from '../../client/room.svelte';

	let {
		code,
		round,
		locked,
		points,
		active,
		onscored
	}: {
		code: string;
		round: number;
		locked: boolean;
		points: number | null;
		active: boolean;
		onscored: (result: CorrectGuessResult) => void;
	} = $props();

	let value = $state('');
	let input: HTMLInputElement | undefined = $state();

	$effect(() => {
		round; // reset on every new round
		value = '';
		lastSent = '';
		input?.focus({ preventScroll: true });
	});

	let composing = false;
	// At most one request in flight; while it runs, newer keystrokes only update `queued`,
	// so typing never waits on the network and the server always sees the latest text.
	let inflight = false;
	let queued = false;
	let lastSent = '';

	function send() {
		if (composing || locked || !active || !value.trim()) return;
		if (inflight) {
			queued = true;
			return;
		}
		if (value === lastSent) return;
		void flush();
	}

	async function flush() {
		inflight = true;
		try {
			do {
				queued = false;
				const sent = value;
				const sentRound = round;
				lastSent = sent;
				const res = await api<GuessResponse>('POST', `/api/rooms/${code}/guess`, { value: sent, round: sentRound });
				const d = res.data;
				if (res.ok && d && d.status === 'correct') {
					onscored(d as CorrectGuessResult);
					return;
				}
				if (res.status === 429) await new Promise((r) => setTimeout(r, 150));
			} while ((queued || value !== lastSent) && !locked && active && value.trim());
		} finally {
			inflight = false;
		}
	}
</script>

<div class="guess glass relative flex items-center gap-3 p-2 {locked ? 'correct' : ''}" class:opacity-60={!active && !locked}>
	<label class="sr-only-live" for="guess">Type the Pokémon name</label>
	<input
		id="guess"
		bind:this={input}
		class="field !border-0 !bg-transparent text-lg"
		placeholder={locked ? 'Nice one!' : active ? "Who's that Pokémon?" : 'Waiting...'}
		autocomplete="off"
		autocapitalize="off"
		autocorrect="off"
		spellcheck="false"
		enterkeyhint="send"
		disabled={locked || !active}
		bind:value
		oninput={(e) => {
			if ((e as unknown as InputEvent).isComposing) return;
			send();
		}}
		oncompositionstart={() => (composing = true)}
		oncompositionend={() => {
			composing = false;
			send();
		}}
		onkeydown={(e) => e.key === 'Enter' && !e.isComposing && send()}
	/>
	{#if locked && points !== null}
		<span class="badge-delta display mr-2 text-lg" role="status">+{points}</span>
	{/if}
</div>
