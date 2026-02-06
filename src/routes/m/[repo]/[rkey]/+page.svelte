<script lang="ts">
	import { page } from '$app/state';
	import { getDetailedProfile } from '$lib/atproto';
	import { getMarkdownShareLink } from '$lib';
	import { resolve } from '$app/paths';
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';
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

			await navigator.clipboard.writeText(getMarkdownShareLink(page.params.repo, page.params.rkey));
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

	const title = $derived((data.record?.value?.title as string) || 'Markdown post');
	function linkifyMentions(text: string): string {
		return text.replace(
			/(?<![\\/@\w])@((?:[\w-]+\.)+[\w-]+)/g,
			'[@$1](https://bsky.app/profile/$1)'
		);
	}

	let mounted = $state(false);
	onMount(() => {
		DOMPurify.addHook('afterSanitizeAttributes', (node) => {
			if (node.tagName === 'A') {
				node.setAttribute('target', '_blank');
				node.setAttribute('rel', 'noopener noreferrer');
			}
		});
		mounted = true;
	});

	const rawHtml = $derived(
		marked.parse(linkifyMentions((data.record?.value?.content as string) || '')) as string
	);
	const sanitizedHtml = $derived(mounted ? DOMPurify.sanitize(rawHtml) : '');
</script>

<svelte:head>
	<meta
		property="og:image"
		content={resolve('/m/[repo]/[rkey]/og.png', {
			repo: page.params.repo ?? '',
			rkey: page.params.rkey ?? ''
		})}
	/>
	<meta
		name="twitter:image"
		content={resolve('/m/[repo]/[rkey]/og.png', {
			repo: page.params.repo ?? '',
			rkey: page.params.rkey ?? ''
		})}
	/>
	<meta name="twitter:card" content="summary_large_image" />

	<title>{title}</title>
	<meta property="og:title" content={title} />
	<meta name="twitter:title" content={title} />
</svelte:head>

<div class="dark:bg-base-900 min-h-screen bg-white">
	<div class="mx-auto max-w-3xl px-4 py-8 md:py-16">
		{#if title !== 'Markdown post'}
			<h1 class="mb-6 text-3xl font-bold">{title}</h1>
		{/if}

		<!-- Uploader info -->
		<div class="mb-8 flex items-center gap-3">
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
			<button
				type="button"
				class="bg-base-200 dark:bg-base-800 hover:bg-base-300 dark:hover:bg-base-700 ml-auto flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors"
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
						d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
					/>
				</svg>
				{copied ? 'Copied!' : 'Copy link'}
			</button>
		</div>

		<!-- Rendered markdown -->
		<div
			class="prose dark:prose-invert prose-zinc prose-a:no-underline prose-a:text-accent-600 dark:prose-a:text-accent-400 max-w-none"
		>
			{@html sanitizedHtml}
		</div>
	</div>
</div>
