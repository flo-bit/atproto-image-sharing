<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { parseUri, getRecord, getDetailedProfile, getBlobURL, getCDNImageBlobUrl } from '$lib/atproto';
	import type { Did } from '@atcute/lexicons';

	let imageUrl = $state<string | undefined>(undefined);
	let fullQualityUrl = $state<string | undefined>(undefined);
	let loading = $state(true);
	let error = $state<string | undefined>(undefined);
	let createdAt = $state<string | undefined>(undefined);
	let uploader = $state<{ displayName?: string; handle?: string; avatar?: string } | undefined>(undefined);
	let copied = $state(false);
	let showOverlay = $state(false);
	let hideTimeout: ReturnType<typeof setTimeout> | undefined;

	function showOverlayTemporarily() {
		showOverlay = true;
		clearTimeout(hideTimeout);
		hideTimeout = setTimeout(() => {
			showOverlay = false;
		}, 3000);
	}

	// Preload full quality image and swap when ready
	function preloadFullQuality(url: string) {
		const img = new Image();
		img.onload = () => {
			fullQualityUrl = url;
		};
		img.src = url;
	}

	function getShareLink(): string {
		const uri = page.url.searchParams.get('uri');
		return `${window.location.origin}${resolve('/image')}?uri=${encodeURIComponent(uri || '')}`;
	}

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(getShareLink());
			copied = true;
			setTimeout(() => copied = false, 2000);
		} catch {
			// Ignore errors
		}
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
		const uri = page.url.searchParams.get('uri');

		if (!uri) {
			loading = false;
			error = 'Missing uri parameter';
			return;
		}

		const parsed = parseUri(uri);
		if (!parsed) {
			loading = false;
			error = 'Invalid AT URI';
			return;
		}

		const { repo, collection, rkey } = parsed;

		if (!collection || !rkey) {
			loading = false;
			error = 'Invalid AT URI';
			return;
		}

		loading = true;
		error = undefined;
		imageUrl = undefined;
		fullQualityUrl = undefined;
		createdAt = undefined;
		uploader = undefined;

		const did = repo as `did:${string}:${string}`;

		Promise.all([
			getRecord({ did, collection, rkey }),
			getDetailedProfile({ did })
		])
			.then(async ([record, profile]) => {
				if (!record?.value) {
					error = 'Image not found';
					return;
				}

				const blob = record.value.image as { $type: 'blob'; ref: { $link: string } } | undefined;
				if (!blob || blob.$type !== 'blob') {
					error = 'Image not found';
					return;
				}

				// Show CDN thumbnail immediately
				imageUrl = getCDNImageBlobUrl({ did, blob, size: 'thumbnail' });

				// Load full quality from PDS in background
				const pdsUrl = await getBlobURL({ did: did as Did, blob });
				preloadFullQuality(pdsUrl);

				createdAt = record.value.createdAt as string | undefined;
				uploader = profile ? {
					displayName: profile.displayName,
					handle: profile.handle,
					avatar: profile.avatar
				} : undefined;
			})
			.catch((e: Error) => {
				const msg = e?.message?.toLowerCase() || '';
				if (msg.includes('not found') || msg.includes('could not find') || msg.includes('record')) {
					error = 'Image not found';
				} else {
					error = e?.message || 'Failed to load image';
				}
			})
			.finally(() => {
				loading = false;
			});
	});
</script>

<div
	class="fixed inset-0 flex items-center justify-center bg-black"
	role="presentation"
	onpointermove={showOverlayTemporarily}
	onclick={showOverlayTemporarily}
	onkeydown={showOverlayTemporarily}
>
	{#if loading}
		<div class="text-white">Loading...</div>
	{:else if error}
		<div class="text-red-500">{error}</div>
	{:else if imageUrl}
		<img src={fullQualityUrl || imageUrl} alt="" class="h-full w-full object-contain" />

		<!-- Info overlay -->
		<div
			class="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/80 to-transparent p-4 pt-12 transition-opacity duration-300"
			class:opacity-0={!showOverlay}
			class:pointer-events-none={!showOverlay}
		>
			<div class="flex items-end justify-between gap-4">
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
							<div class="text-sm text-white/70">{formatDate(createdAt)}</div>
						{/if}
					</div>
				</div>

				<!-- Copy link button -->
				<button
					type="button"
					class="flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm text-white backdrop-blur-sm transition-colors hover:bg-white/30"
					onclick={copyLink}
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
					</svg>
					{copied ? 'Copied!' : 'Copy link'}
				</button>
			</div>
		</div>
	{/if}
</div>
