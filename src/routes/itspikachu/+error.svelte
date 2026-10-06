<script lang="ts">
	import { page } from '$app/state';
	import Brand from '#lib/components/Brand.svelte';
</script>

<main class="mx-auto grid min-h-dvh max-w-xl place-items-center px-4 text-center">
	<div class="glass w-full p-8">
		<Brand />
		<h1 class="display mt-6 text-4xl text-oq-yellow">{page.status}</h1>
		<p class="mt-3 text-oq-muted">{page.error?.message ?? 'Something went wrong.'}</p>
		<a href="/itspikachu" class="btn btn-primary mt-6">Back to lobby</a>
	</div>
</main>
