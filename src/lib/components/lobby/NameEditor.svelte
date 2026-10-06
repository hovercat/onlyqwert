<script lang="ts">
	import { api } from '../../client/api';
	import { LIMITS } from '../../types';

	let { code, name }: { code: string; name: string } = $props();

	let editing = $state(false);
	let draft = $state('');
	let error = $state('');
	let saving = $state(false);

	function edit() {
		draft = name;
		error = '';
		editing = true;
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		const next = draft.trim();
		if (!next) return (error = 'Name cannot be empty.');
		if (next === name) return (editing = false);
		saving = true;
		const res = await api('PATCH', `/api/rooms/${code}/me`, { name: next });
		saving = false;
		if (res.ok) editing = false;
		else error = res.error ?? 'Could not rename.';
	}
</script>

<section class="glass p-4" aria-label="Your name">
	{#if editing}
		<form class="flex flex-col gap-2 sm:flex-row sm:items-center" onsubmit={save}>
			<label class="text-sm font-semibold text-oq-muted" for="my-name">Your name</label>
			<input
				id="my-name"
				class="field min-w-0 flex-1"
				maxlength={LIMITS.nameMax}
				autocomplete="nickname"
				bind:value={draft}
			/>
			<div class="flex gap-2">
				<button class="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
				<button type="button" class="btn" onclick={() => (editing = false)}>Cancel</button>
			</div>
		</form>
	{:else}
		<div class="flex items-center justify-between gap-3">
			<p class="min-w-0 truncate">
				<span class="text-sm font-semibold text-oq-muted">Playing as</span>
				<span class="display ml-2 text-xl text-oq-yellow">{name}</span>
			</p>
			<button class="btn btn-blue !min-h-9 !px-3 text-sm" onclick={edit}>Rename</button>
		</div>
	{/if}
	{#if error}<p class="mt-2 font-semibold text-oq-red" role="alert">{error}</p>{/if}
</section>
