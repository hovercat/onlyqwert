<script lang="ts">
	import { goto } from '$app/navigation';
	import Brand from '#lib/components/Brand.svelte';
	import { api, loadLocal, normalizeCode, saveLocal } from '#lib/client/api.ts';
	import { LIMITS } from '#lib/types.ts';
	import type { CreateRoomResponse, JoinRoomResponse } from '#lib/types.ts';

	let hosting = $state(false);
	let hostName = $state(loadLocal('oq_host_name') ?? 'Host');
	let hostError = $state('');
	let code = $state('');
	let name = $state(loadLocal('oq_nick') ?? '');
	let joining = $state(false);
	let joinError = $state('');

	async function host() {
		hosting = true;
		hostError = '';
		const res = await api<CreateRoomResponse>('POST', '/api/rooms', { hostName: hostName.trim() || 'Host' });
		if (res.ok && res.data?.code) {
			saveLocal('oq_host_name', hostName.trim() || 'Host');
			await goto(`/itspikachu/${res.data.code}`);
		} else {
			hostError = res.error ?? 'Could not create room.';
			hosting = false;
		}
	}

	async function join(e: SubmitEvent) {
		e.preventDefault();
		joinError = '';
		if (code.length !== 6) return (joinError = 'Room codes have 6 characters.');
		if (!name.trim()) return (joinError = 'Pick a nickname.');
		joining = true;
		const res = await api<JoinRoomResponse>('POST', `/api/rooms/${code}/join`, { name: name.trim() });
		if (res.ok) {
			saveLocal('oq_nick', name.trim());
			await goto(`/itspikachu/${code}`);
		} else {
			joinError = res.status === 404 ? 'No room with that code.' : (res.error ?? 'Could not join.');
			joining = false;
		}
	}
</script>

<svelte:head><title>itspikachu | onlyqwert</title></svelte:head>

<main class="mx-auto min-h-dvh w-full max-w-4xl px-4 py-6 sm:px-8">
	<header class="flex items-center justify-between"><Brand /></header>

	<div class="py-10 text-center">
		<h1 class="display text-4xl sm:text-5xl"><span class="text-gradient">itspikachu</span></h1>
		<p class="mt-3 text-oq-muted">Who is that Pokémon? Fastest correct guess scores the most.</p>
	</div>

	<div class="grid gap-5 md:grid-cols-2">
		<section class="glass flex flex-col p-6" aria-labelledby="host-h">
			<h2 id="host-h" class="display text-2xl text-oq-yellow">Host a room</h2>
			<p class="mt-2 flex-1 text-oq-muted">
				You are the streamer. Pick generations, rounds and timing, then share the code.
			</p>
			<label class="mt-4 text-sm font-semibold text-oq-muted" for="host-name">Your name</label>
			<input
				id="host-name"
				class="field mt-1"
				placeholder="Host"
				maxlength={LIMITS.nameMax}
				autocomplete="nickname"
				bind:value={hostName}
			/>
			<button class="btn btn-primary mt-6" onclick={host} disabled={hosting}>
				{hosting ? 'Creating...' : 'Create room'}
			</button>
			{#if hostError}<p class="mt-3 font-semibold text-oq-red" role="alert">{hostError}</p>{/if}
		</section>

		<section class="glass p-6" aria-labelledby="join-h">
			<h2 id="join-h" class="display text-2xl text-oq-blue">Join a room</h2>
			<form class="mt-4 flex flex-col gap-3" onsubmit={join}>
				<label class="text-sm font-semibold text-oq-muted" for="code">Room code</label>
				<input
					id="code"
					class="field display text-center text-2xl uppercase tracking-[0.3em]"
					placeholder="ABC123"
					autocomplete="off"
					autocapitalize="characters"
					spellcheck="false"
					maxlength="6"
					value={code}
					oninput={(e) => (code = normalizeCode(e.currentTarget.value))}
				/>
				<label class="text-sm font-semibold text-oq-muted" for="nick">Nickname</label>
				<input id="nick" class="field" placeholder="Ash" maxlength="20" autocomplete="nickname" bind:value={name} />
				<button class="btn btn-blue mt-2" disabled={joining}>{joining ? 'Joining...' : 'Join'}</button>
				{#if joinError}<p class="font-semibold text-oq-red" role="alert">{joinError}</p>{/if}
			</form>
		</section>
	</div>
</main>
