<script lang="ts">
	import { loadLocal, saveLocal } from '../../client/api';

	let { code }: { code: string } = $props();

	let streamer = $state(loadLocal('oq_streamer') === '1');
	let revealed = $state(false);
	let copied = $state<'code' | 'link' | ''>('');

	const hidden = $derived(streamer && !revealed);
	const link = $derived(typeof location === 'undefined' ? `/itspikachu/${code}` : `${location.origin}/itspikachu/${code}`);

	function toggleStreamer() {
		streamer = !streamer;
		revealed = false;
		saveLocal('oq_streamer', streamer ? '1' : '0');
		window.dispatchEvent(new CustomEvent('oq-streamer', { detail: streamer }));
	}

	async function copy(what: 'code' | 'link') {
		const text = what === 'code' ? code : link;
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			const t = document.createElement('textarea');
			t.value = text;
			document.body.appendChild(t);
			t.select();
			document.execCommand('copy');
			t.remove();
		}
		copied = what;
		setTimeout(() => (copied = ''), 1600);
	}
</script>

<section class="glass p-5 text-center" aria-label="Room code">
	<p class="text-sm font-semibold uppercase tracking-widest text-oq-muted">Room code</p>
	<p
		class="display my-2 select-all text-5xl tracking-[0.25em] text-oq-yellow sm:text-7xl"
		aria-label={hidden ? 'Room code hidden' : `Room code ${code.split('').join(' ')}`}
	>
		{hidden ? '•'.repeat(6) : code}
	</p>
	<div class="flex flex-wrap justify-center gap-2">
		{#if hidden}
			<button class="btn btn-blue" onclick={() => (revealed = true)}>Reveal code</button>
		{:else}
			<button class="btn btn-primary" onclick={() => copy('code')}>{copied === 'code' ? 'Copied!' : 'Copy code'}</button>
			<button class="btn" onclick={() => copy('link')}>{copied === 'link' ? 'Copied!' : 'Copy join link'}</button>
			{#if streamer}<button class="btn" onclick={() => (revealed = false)}>Hide</button>{/if}
		{/if}
	</div>
	{#if !hidden}
		<p class="mt-3 truncate text-sm text-oq-muted">{link}</p>
	{/if}
	<label class="mt-4 inline-flex cursor-pointer items-center gap-2 text-sm text-oq-muted">
		<input type="checkbox" class="h-5 w-5 accent-[#ffcb05]" checked={streamer} onchange={toggleStreamer} />
		Streamer mode (hide code on screen)
	</label>
	<span class="sr-only-live" role="status">{copied ? 'Copied to clipboard' : ''}</span>
</section>
