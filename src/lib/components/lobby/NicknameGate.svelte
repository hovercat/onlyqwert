<script lang="ts">
	import { api, loadLocal, saveLocal } from '../../client/api';
	import type { JoinRoomResponse } from '../../types';

	let { code, onjoined }: { code: string; onjoined: () => void | Promise<void> } = $props();

	let name = $state(loadLocal('oq_nick') ?? '');
	let busy = $state(false);
	let error = $state('');

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!name.trim()) return (error = 'Pick a nickname.');
		busy = true;
		error = '';
		const res = await api<JoinRoomResponse>('POST', `/api/rooms/${code}/join`, { name: name.trim() });
		if (res.ok) {
			saveLocal('oq_nick', name.trim());
			await onjoined();
		} else {
			error = res.error ?? 'Could not join.';
		}
		busy = false;
	}
</script>

<div class="grid min-h-[70dvh] place-items-center">
	<form class="glass flex w-full max-w-md flex-col gap-3 p-6" onsubmit={submit}>
		<h2 class="display text-3xl text-oq-yellow">Join room {code}</h2>
		<label for="gate-nick" class="text-sm font-semibold text-oq-muted">Your nickname</label>
		<!-- svelte-ignore a11y_autofocus -->
		<input id="gate-nick" class="field" maxlength="20" placeholder="Ash" autofocus bind:value={name} />
		<button class="btn btn-blue" disabled={busy}>{busy ? 'Joining...' : 'Jump in'}</button>
		{#if error}<p class="font-semibold text-oq-red" role="alert">{error}</p>{/if}
	</form>
</div>
