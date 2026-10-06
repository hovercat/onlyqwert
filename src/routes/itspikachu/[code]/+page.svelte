<script lang="ts">
	import { onDestroy } from 'svelte';
	import { api, loadLocal } from '#lib/client/api.ts';
	import { RoomStore } from '#lib/client/room.svelte.ts';
	import Brand from '#lib/components/Brand.svelte';
	import GameView from '#lib/components/game/GameView.svelte';
	import Leaderboard from '#lib/components/leaderboard/Leaderboard.svelte';
	import Podium from '#lib/components/leaderboard/Podium.svelte';
	import Lobby from '#lib/components/lobby/Lobby.svelte';
	import NicknameGate from '#lib/components/lobby/NicknameGate.svelte';
	import type { RoomSnapshot } from '#lib/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const store = new RoomStore();
	// svelte-ignore state_referenced_locally
	store.init(data.snapshot);

	let connected = false;
	$effect(() => {
		if (store.canConnect && !connected) {
			connected = true;
			store.connect(data.code);
		}
	});
	onDestroy(() => store.disconnect());

	async function refresh() {
		const res = await api<RoomSnapshot>('GET', `/api/rooms/${data.code}`);
		if (res.ok && res.data) store.init(res.data as RoomSnapshot);
	}

	let actionError = $state('');
	async function act(path: 'next' | 'restart') {
		actionError = '';
		const res = await api('POST', `/api/rooms/${data.code}/${path}`);
		if (!res.ok) actionError = res.error ?? 'Action failed.';
		else if (path === 'restart') await refresh();
	}

	const s = $derived(store.snapshot!);

	// Hide the code in the header too while the host has streamer mode on.
	let streamerMode = $state(false);
	$effect(() => {
		streamerMode = loadLocal('oq_streamer') === '1';
		const onToggle = (e: Event) => (streamerMode = (e as CustomEvent<boolean>).detail);
		window.addEventListener('oq-streamer', onToggle);
		return () => window.removeEventListener('oq-streamer', onToggle);
	});
	const headerCode = $derived(s.you.isHost && streamerMode ? '••••••' : s.code);
	const needsNick = $derived(!s.you.isHost && !s.you.playerId);
	const statusLabel = $derived(
		store.status === 'open' ? 'Live' : store.status === 'closed' ? 'Closed' : store.status === 'idle' ? '' : 'Reconnecting...'
	);
</script>

<svelte:head><title>Room {data.code} | itspikachu</title></svelte:head>

<main class="mx-auto min-h-dvh w-full max-w-7xl px-4 py-4 sm:px-8">
	<header class="mb-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
		<Brand />
		<div class="ml-auto flex flex-wrap items-center justify-end gap-2">
			{#if s.round && (s.phase === 'round_active' || s.phase === 'round_reveal')}
				<span class="pill">Round {s.round.index + 1}/{s.round.total}</span>
			{/if}
			{#if statusLabel}
				<span class="pill" class:text-oq-red={store.status !== 'open'}>
					<span class="h-2 w-2 rounded-full {store.status === 'open' ? 'bg-oq-green' : 'bg-oq-red'}"></span>{statusLabel}
				</span>
			{/if}
			<span class="pill display tracking-widest text-oq-yellow" aria-label="Room code">Room {headerCode}</span>
		</div>
	</header>

	{#if store.status === 'closed'}
		<div class="glass mx-auto mt-10 max-w-md p-8 text-center">
			<h1 class="display text-3xl text-oq-yellow">Room closed</h1>
			<p class="mt-2 text-oq-muted">{store.closedReason ?? 'This room is no longer available.'}</p>
			<a class="btn btn-primary mt-6" href="/itspikachu">Back</a>
		</div>
	{:else if needsNick}
		<NicknameGate code={data.code} onjoined={refresh} />
	{:else if s.phase === 'lobby'}
		<Lobby {store} code={data.code} />
	{:else if (s.phase === 'round_active' || s.phase === 'round_reveal') && s.round}
		<GameView {store} code={data.code} />
	{:else if s.phase === 'leaderboard'}
		<div class="flex flex-col items-center gap-5">
			<h1 class="display text-3xl text-oq-yellow">Leaderboard</h1>
			<Leaderboard players={s.players} meId={store.playerId} />
			{#if store.isHost}
				<button class="btn btn-primary" onclick={() => act('next')}>
					{s.round && s.round.index + 1 >= s.round.total ? 'Final results' : 'Next round'}
				</button>
			{:else}
				<p class="text-oq-muted">Next round starts soon...</p>
			{/if}
		</div>
	{:else if s.phase === 'finished'}
		<div class="flex flex-col items-center gap-6">
			<h1 class="display text-4xl"><span class="text-gradient">Final results</span></h1>
			<Podium players={s.players} />
			<Leaderboard players={s.players} meId={store.playerId} final />
			{#if store.isHost}
				<button class="btn btn-primary" onclick={() => act('restart')}>Play again</button>
			{:else}
				<a href="/itspikachu" class="btn">Leave room</a>
			{/if}
		</div>
	{/if}
	{#if actionError}<p class="mt-4 text-center font-semibold text-oq-red" role="alert">{actionError}</p>{/if}
</main>
