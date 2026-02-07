<script lang="ts">
	import { page } from '$app/state';
	import { getDetailedProfile } from '$lib/atproto';
	import { getCodeShareLink } from '$lib';
	import { resolve } from '$app/paths';
	import hljs from 'highlight.js';
	import 'highlight.js/styles/github-dark.min.css';
	import { onMount } from 'svelte';

	let createdAt = $state<string | undefined>(undefined);
	let uploader = $state<{ displayName?: string; handle?: string; avatar?: string } | undefined>(
		undefined
	);
	let copied = $state(false);

	function formatDate(isoString: string): string {
		const date = new Date(isoString);
		return date.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	async function copyLink() {
		try {
			if (!page.params.repo || !page.params.rkey) return;
			await navigator.clipboard.writeText(getCodeShareLink(page.params.repo, page.params.rkey));
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Ignore errors
		}
	}

	async function copyCode() {
		try {
			await navigator.clipboard.writeText(code);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Ignore errors
		}
	}

	$effect(() => {
		getDetailedProfile({ did: data.did }).then((profile) => {
			if (profile) {
				uploader = {
					displayName: profile.displayName,
					handle: profile.handle,
					avatar: profile.avatar
				};
			}
		});
		if (data.record?.value?.createdAt) {
			createdAt = data.record.value.createdAt as string;
		}
	});

	let { data } = $props();

	const title = $derived((data.record?.value?.title as string) || '');
	const code = $derived((data.record?.value?.content as string) || '');

	let mounted = $state(false);
	onMount(() => (mounted = true));

	const highlighted = $derived.by(() => {
		if (!mounted || !code) return { html: '', language: '' };
		const result = hljs.highlightAuto(code);
		return { html: result.value, language: result.language || '' };
	});
	const highlightedHtml = $derived(highlighted.html);
	const detectedLanguage = $derived(highlighted.language);
</script>

<svelte:head>
	<meta
		property="og:image"
		content={resolve('/c/[repo]/[rkey]/og.png', {
			repo: page.params.repo ?? '',
			rkey: page.params.rkey ?? ''
		})}
	/>
	<meta
		name="twitter:image"
		content={resolve('/c/[repo]/[rkey]/og.png', {
			repo: page.params.repo ?? '',
			rkey: page.params.rkey ?? ''
		})}
	/>
	<meta name="twitter:card" content="summary_large_image" />

	<title>{title || 'Code snippet'}</title>
	<meta property="og:title" content={title || 'Code snippet'} />
	<meta name="twitter:title" content={title || 'Code snippet'} />
</svelte:head>

<div class="dark:bg-base-900 min-h-screen bg-white">
	<div class="mx-auto max-w-4xl px-4 py-8 md:py-16">
		{#if title}
			<h1 class="mb-4 text-2xl font-bold font-mono">{title}</h1>
		{/if}

		<!-- Uploader info + actions -->
		<div class="mb-6 flex items-center gap-3">
			{#if uploader?.avatar}
				<img src={uploader.avatar} alt="" class="h-10 w-10 rounded-full" />
			{/if}
			<div>
				{#if uploader?.displayName || uploader?.handle}
					<div class="font-medium">{uploader.displayName || uploader.handle}</div>
				{/if}
				{#if createdAt}
					<div class="text-base-500 text-sm">{formatDate(createdAt)}</div>
				{/if}
			</div>
			<div class="ml-auto flex items-center gap-2">
				{#if detectedLanguage}
					<span class="text-base-500 text-xs font-mono">{detectedLanguage}</span>
				{/if}
				<button
					type="button"
					class="bg-base-200 dark:bg-base-800 hover:bg-base-300 dark:hover:bg-base-700 flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors"
					onclick={copyCode}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
						/>
					</svg>
					{copied ? 'Copied!' : 'Copy code'}
				</button>
				<button
					type="button"
					class="bg-base-200 dark:bg-base-800 hover:bg-base-300 dark:hover:bg-base-700 flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors"
					onclick={copyLink}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101"
						/>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101"
						/>
					</svg>
					Copy link
				</button>
			</div>
		</div>

		<!-- Code block -->
		<div class="overflow-hidden rounded-xl">
			<pre
				class="hljs overflow-x-auto p-6 text-sm leading-relaxed"><code>{#if mounted}{@html highlightedHtml}{:else}{code}{/if}</code></pre>
		</div>
	</div>
</div>
