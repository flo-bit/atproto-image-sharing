<script lang="ts">
	import { page } from '$app/state';
	import { getDetailedProfile } from '$lib/atproto';
	import { getVideoShareLink } from '$lib';
	import { resolve } from '$app/paths';

	let loading = $state(true);
	let paused = $state(false);
	let videoEl = $state<HTMLVideoElement | undefined>(undefined);
	let createdAt = $state<string | undefined>(undefined);
	let uploader = $state<{ displayName?: string; handle?: string; avatar?: string } | undefined>(
		undefined
	);
	let copied = $state(false);
	let showOverlay = $state(false);
	let hideTimeout: ReturnType<typeof setTimeout> | undefined;

	function showOverlayTemporarily() {
		showOverlay = true;
		clearTimeout(hideTimeout);
		hideTimeout = setTimeout(() => {
			showOverlay = false;
		}, 1500);
	}

	function togglePlayback() {
		if (!videoEl) return;
		if (videoEl.paused) {
			videoEl.play();
		} else {
			videoEl.pause();
		}
	}

	async function copyLink() {
		try {
			if (!page.params.repo || !page.params.rkey) return;

			await navigator.clipboard.writeText(getVideoShareLink(page.params.repo, page.params.rkey));
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Ignore errors
		}
	}

	async function downloadVideo() {
		const response = await fetch(data.videoUrl);
		const blob = await response.blob();
		const blobUrl = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = blobUrl;
		a.download = `video-${page.params.rkey}`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(blobUrl);
	}

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
</script>

<svelte:head>
	<meta
		property="og:image"
		content={resolve('/v/[repo]/[rkey]/og.png', {
			repo: page.params.repo ?? '',
			rkey: page.params.rkey ?? ''
		})}
	/>
	<meta
		name="twitter:image"
		content={resolve('/v/[repo]/[rkey]/og.png', {
			repo: page.params.repo ?? '',
			rkey: page.params.rkey ?? ''
		})}
	/>
	<meta name="twitter:card" content="summary_large_image" />

	<title>shared video</title>
	<meta property="og:title" content="shared video" />
	<meta name="twitter:title" content="shared video" />
</svelte:head>

<div
	class="fixed inset-0 flex items-center justify-center bg-black"
	role="presentation"
	onpointermove={showOverlayTemporarily}
	onkeydown={showOverlayTemporarily}
>
	<!-- svelte-ignore a11y_media_has_caption -->
	<video
		bind:this={videoEl}
		bind:paused
		autoplay
		loop
		muted
		playsinline
		class="h-full w-full object-contain"
		src={data.videoUrl}
		onclick={togglePlayback}
		oncanplay={() => (loading = false)}
	></video>

	{#if loading}
		<div class="absolute inset-0 z-10 flex items-center justify-center bg-black">
			<div class="flex flex-col items-center gap-4">
				<svg
					class="h-10 w-10 animate-spin text-white"
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
				>
					<circle
						class="opacity-25"
						cx="12"
						cy="12"
						r="10"
						stroke="currentColor"
						stroke-width="4"
					></circle>
					<path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					></path>
				</svg>
				<p class="text-sm text-white">Loading video...</p>
			</div>
		</div>
	{/if}

	{#if paused}
		<button
			type="button"
			class="absolute inset-0 flex items-center justify-center"
			aria-label="Play video"
			onclick={togglePlayback}
		>
			<div class="rounded-full bg-black/50 p-4">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-12 w-12 text-white"
					viewBox="0 0 24 24"
					fill="currentColor"
				>
					<path d="M8 5v14l11-7z" />
				</svg>
			</div>
		</button>
	{/if}

	<!-- Info overlay -->
	<div
		class="absolute right-0 bottom-0 left-0 bg-linear-to-t from-black/80 to-transparent p-4 pt-12 transition-opacity duration-300"
		class:opacity-0={!showOverlay}
		class:pointer-events-none={!showOverlay}
	>
		<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
			<!-- Uploader info -->
			<div class="flex items-center gap-3">
				{#if uploader?.avatar}
					<img src={uploader.avatar} alt="" class="h-10 w-10 rounded-full" />
				{/if}
				<div class="text-white">
					{#if uploader?.displayName || uploader?.handle}
						<div class="font-medium">{uploader.displayName || uploader.handle}</div>
					{/if}
					{#if createdAt}
						<div class="hidden text-sm text-white/70 sm:block">{formatDate(createdAt)}</div>
					{/if}
				</div>
			</div>

			<!-- Action buttons -->
			<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
				<!-- Copy link button -->
				<button
					type="button"
					class="flex cursor-pointer items-center justify-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm text-white backdrop-blur-sm transition-colors hover:bg-white/30"
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

				<!-- Download button -->
				<button
					type="button"
					class="flex cursor-pointer items-center justify-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm text-white backdrop-blur-sm transition-colors hover:bg-white/30"
					onclick={downloadVideo}
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
							d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
						/>
					</svg>
					Download
				</button>
			</div>

			{#if createdAt}
				<div class="text-sm text-white/70 sm:hidden">{formatDate(createdAt)}</div>
			{/if}
		</div>
	</div>
</div>
