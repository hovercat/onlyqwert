<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import Background from '#lib/components/Background.svelte';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>onlyqwert</title>
</svelte:head>

<Background />
{@render children()}

{#if data.branding.footerLinks.length}
	<footer class="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 pb-8 pt-4 text-sm text-oq-muted">
		{#each data.branding.footerLinks as link (link.url)}
			<a href={link.url} target="_blank" rel="noopener noreferrer" class="transition hover:text-oq-yellow">{link.label}</a>
		{/each}
	</footer>
{/if}
