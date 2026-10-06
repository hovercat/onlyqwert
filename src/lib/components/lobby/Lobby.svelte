<script lang="ts">
	import { api } from '../../client/api';
	import type { RoomStore } from '../../client/room.svelte';
	import CodeShare from '../host/CodeShare.svelte';
	import HostPanel from '../host/HostPanel.svelte';
	import PlayerList from './PlayerList.svelte';

	let { store, code }: { store: RoomStore; code: string } = $props();
	const s = $derived(store.snapshot!);

	function kick(playerId: string) {
		api('POST', `/api/rooms/${code}/kick`, { playerId });
	}
</script>

<div class="grid gap-5 lg:grid-cols-[1fr_380px]">
	<div class="flex flex-col gap-5">
		{#if store.isHost}
			<CodeShare {code} />
		{:else}
			<section class="glass p-5 text-center">
				<p class="text-sm font-semibold uppercase tracking-widest text-oq-muted">You are in room</p>
				<p class="display text-4xl tracking-[0.2em] text-oq-yellow">{code}</p>
				<p class="mt-2 text-oq-muted">Waiting for the host to start...</p>
			</section>
		{/if}

		<section>
			<h2 class="display mb-3 text-xl">Players <span class="text-oq-blue">{s.players.length}</span></h2>
			<PlayerList players={store.players} meId={store.playerId} onkick={store.isHost ? kick : undefined} />
		</section>
	</div>

	{#if store.isHost}
		<HostPanel {code} settings={s.settings} playerCount={s.players.length} />
	{:else}
		<section class="glass h-fit p-5">
			<h2 class="display text-2xl text-oq-blue">Game</h2>
			<dl class="mt-3 grid grid-cols-2 gap-2 text-oq-muted">
				<dt>Generations</dt><dd class="font-bold text-oq-ink">{s.settings.generations.join(', ')}</dd>
				<dt>Rounds</dt><dd class="font-bold text-oq-ink">{s.settings.rounds}</dd>
				<dt>Seconds</dt><dd class="font-bold text-oq-ink">{s.settings.secondsPerRound}s</dd>
			</dl>
		</section>
	{/if}
</div>
