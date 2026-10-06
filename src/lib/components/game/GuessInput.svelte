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
		input?.focus({ preventScroll: true });
	});

	let composing = false;

	async function send() {
		if (composing || locked || !active || !value.trim()) return;
		const res = await api<GuessResponse>('POST', `/api/rooms/${code}/guess`, { value, round });
		const d = res.data;
		if (res.ok && d && d.status === 'correct') onscored(d as CorrectGuessResult);
	}
</script>

<div class="guess glass relative flex items-center gap-3 p-2 {locked ? 'correct' : ''}" class:opacity-60={!active && !locked}>
	<label class="sr-only-live" for="guess">Type the Pokémon name</label>
	<input
		id="guess"
		bind:this={input}
		class="field !border-0 !bg-transparent text-lg"
		placeholder={locked ? 'Nice one!' : active ? "Who's that Pokémon? Any language works" : 'Waiting...'}
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
