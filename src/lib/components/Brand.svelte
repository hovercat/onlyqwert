<script lang="ts">
	import { page } from '$app/state';

	const name = $derived((page.data.branding as { brandName?: string } | undefined)?.brandName ?? 'onlyqwert');
</script>

<a href="/" class="display text-gradient inline-block text-xl sm:text-3xl" aria-label="{name} home">{name}</a>
