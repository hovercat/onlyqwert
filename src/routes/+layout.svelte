<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import Background from '#lib/components/Background.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>onlyqwert | games for streamers and chat</title>
</svelte:head>

<Background />
{@render children()}
