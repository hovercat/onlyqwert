<script lang="ts">
	import type { PageProps } from './$types';
	import Brand from '#lib/components/Brand.svelte';

	let { data }: PageProps = $props();

	// Words wrapped in *asterisks* in the hero title flash, e.g. "*HOG* REVEAL".
	const titleParts = $derived(
		data.branding.heroTitle
			.split(/(\*[^*]+\*)/)
			.filter(Boolean)
			.map((part) =>
				part.length > 2 && part.startsWith('*') && part.endsWith('*')
					? { text: part.slice(1, -1), flash: true }
					: { text: part, flash: false }
			)
	);
</script>

<main class="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-5xl flex-col px-4 py-6 sm:px-8">
	<header class="flex items-center justify-between"><Brand /></header>

	<section class="py-12 text-center sm:py-20">
		<h1 class="display text-4xl sm:text-6xl">
			{#each titleParts as part, i (i)}{#if part.flash}<span class="text-gradient">{part.text}</span>{:else}{part.text}{/if}{/each}
		</h1>
		<p class="mx-auto mt-4 max-w-xl text-lg text-oq-muted">{data.branding.heroTagline}</p>
	</section>

	<section aria-labelledby="games" class="pb-16">
		<h2 id="games" class="display mb-5 text-center text-xl text-oq-yellow">Games</h2>
		<div class="mx-auto grid max-w-sm gap-5">
			<a
				href="/itspikachu"
				class="glass group relative block overflow-hidden p-6 transition hover:-translate-y-1 hover:border-oq-yellow"
			>
				<div
					class="mb-4 grid h-28 place-items-center rounded-2xl"
					style="background: radial-gradient(circle at 50% 40%, #fff6c2, #ffcb05 40%, #3aa8ff)"
				>
					<span class="display text-6xl text-oq-indigo" style="animation: oq-float 4s ease-in-out infinite">?</span>
				</div>
				<h3 class="display text-2xl">itspikachu</h3>
				<p class="mt-2 text-oq-muted">Who is that Pokémon? Name the silhouette before the timer runs out.</p>
				<span class="btn btn-primary mt-5 w-full">Play now</span>
			</a>

		</div>
	</section>
</main>
