<script lang="ts">
	import Brand from '#lib/components/Brand.svelte';

	const soon = [
		{ title: 'Higher or Lower', blurb: 'Stats duel, chat votes live.' },
		{ title: 'Type Rush', blurb: 'Fastest typer wins the room.' }
	];
</script>

<main class="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-6 sm:px-8">
	<header class="flex items-center justify-between"><Brand /></header>

	<section class="py-12 text-center sm:py-20">
		<h1 class="display text-4xl sm:text-6xl">
			Play with your <span class="text-gradient">chat</span>,<br />live.
		</h1>
		<p class="mx-auto mt-4 max-w-xl text-lg text-oq-muted">
			Open a room, share the code, and let your community compete on your stream. No accounts, no installs.
		</p>
	</section>

	<section aria-labelledby="games" class="pb-16">
		<h2 id="games" class="display mb-5 text-xl text-oq-yellow">Games</h2>
		<div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
				<p class="mt-2 text-oq-muted">Who is that Pokémon? Race your chat to name the silhouette.</p>
				<span class="btn btn-primary mt-5 w-full">Play now</span>
			</a>

			{#each soon as g (g.title)}
				<div class="glass relative p-6 opacity-70" aria-disabled="true">
					<div class="mb-4 grid h-28 place-items-center rounded-2xl bg-white/5">
						<span class="display text-4xl text-oq-muted">...</span>
					</div>
					<h3 class="display text-2xl">{g.title}</h3>
					<p class="mt-2 text-oq-muted">{g.blurb}</p>
					<span class="pill mt-5">Coming soon</span>
				</div>
			{/each}
		</div>
	</section>
</main>
