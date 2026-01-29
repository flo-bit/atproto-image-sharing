<script lang="ts">
	import { user, logout, putRecord, createTID, uploadBlob, listRecords } from '$lib/atproto';
	import { compressImage, getImageFromRecord } from '$lib/atproto/image-helper';
	import Avatar from '$lib/atproto/UI/Avatar.svelte';
	import Button from '$lib/atproto/UI/Button.svelte';
	import { loginModalState } from '$lib/atproto/UI/LoginModal.svelte';
	import { resolve } from '$app/paths';
	type ImageRecord = {
		uri: string;
		value: Record<string, unknown>;
	};

	let fileInput: HTMLInputElement | undefined = $state();
	let isUploading = $state(false);
	let feedbackMessage = $state('');
	let images = $state<ImageRecord[]>([]);
	let loadingImages = $state(false);

	async function loadImages() {
		if (!user.did) return;
		loadingImages = true;
		try {
			const records = await listRecords({
				collection: 'dev.flo-bit.image',
				limit: 0
			});
			images = records as ImageRecord[];
		} catch (error) {
			console.error('Failed to load images:', error);
		} finally {
			loadingImages = false;
		}
	}

	$effect(() => {
		if (user.isLoggedIn) {
			loadImages();
		} else {
			images = [];
		}
	});

	async function handleImageUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		isUploading = true;
		feedbackMessage = '';

		try {
			const compressedImage = await compressImage(file);
			const blobInfo = await uploadBlob({ blob: compressedImage.blob });
			const rkey = createTID();

			const record = {
				$type: 'dev.flo-bit.image',
				image: blobInfo,
				aspectRatio: compressedImage.aspectRatio,
				createdAt: new Date().toISOString()
			};

			await putRecord({
				collection: 'dev.flo-bit.image',
				rkey,
				record
			});

			// Add the new image to the list
			const newImage: ImageRecord = {
				uri: `at://${user.did}/dev.flo-bit.image/${rkey}`,
				value: record
			};
			images = [newImage, ...images];

			// Copy link to clipboard
			const shareLink = getShareLink(newImage.uri);
			try {
				await navigator.clipboard.writeText(shareLink);
				feedbackMessage = 'Link copied to clipboard!';
			} catch {
				feedbackMessage = 'Image uploaded!';
			}
		} catch (error) {
			console.error('Upload failed:', error);
			feedbackMessage = 'Upload failed. Please try again.';
		} finally {
			isUploading = false;
			if (fileInput) {
				fileInput.value = '';
			}
		}
	}

	function getImageUrl(record: ImageRecord): string | undefined {
		if (!user.did) return;
		return getImageFromRecord(record.value, user.did);
	}

	function getShareLink(uri: string): string {
		return `${window.location.origin}${resolve('/image')}?uri=${encodeURIComponent(uri)}`;
	}

	async function copyLink(event: Event, uri: string) {
		event.stopPropagation();
		event.preventDefault();
		try {
			await navigator.clipboard.writeText(getShareLink(uri));
			feedbackMessage = 'Link copied!';
			setTimeout(() => {
				if (feedbackMessage === 'Link copied!') feedbackMessage = '';
			}, 2000);
		} catch {
			feedbackMessage = 'Failed to copy link';
		}
	}
</script>

<div class="mx-auto my-4 max-w-3xl px-4 md:my-32">
	<h1 class="text-3xl font-bold">atproto image sharing</h1>

	<a
		href="https://github.com/flo-bit/atproto-image-sharing"
		target="_blank"
		class="mt-2 text-sm text-rose-600 dark:text-accent-500">source code</a
	>

	{#if user.isInitializing}
		<div class="mt-8 text-sm">loading...</div>
	{/if}

	{#if !user.isInitializing && !user.agent}
		<div class="mt-8 text-sm">login to share an image</div>
		<Button class="mt-4" onclick={() => loginModalState.show()}>Login</Button>
	{/if}

	{#if user.isLoggedIn}
		<div class="mt-8 text-sm">logged in as</div>

		<div class="mt-2 flex gap-1 font-semibold">
			<Avatar src={user.profile?.avatar} />
			<span>{user.profile?.displayName || user.profile?.handle}</span>
		</div>

		<Button class="mt-4" onclick={() => logout()}>Sign Out</Button>

		<input
			type="file"
			accept="image/*"
			class="hidden"
			bind:this={fileInput}
			onchange={handleImageUpload}
		/>

		<Button class="mt-8" disabled={isUploading} onclick={() => fileInput?.click()}>
			{isUploading ? 'Uploading...' : 'Upload image'}
		</Button>

		<div class="mt-4 h-5 text-sm" class:text-green-600={feedbackMessage.includes('copied') || feedbackMessage.includes('uploaded')} class:text-red-600={feedbackMessage.includes('failed')}>
			{feedbackMessage}
		</div>

		{#if loadingImages}
			<div class="mt-8 text-sm">Loading images...</div>
		{:else if images.length > 0}
			<div class="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
				{#each images as image (image.uri)}
					{@const imageUrl = getImageUrl(image)}
					{#if imageUrl}
						<a
							href="{resolve('/image')}?uri={encodeURIComponent(image.uri)}"
							class="group relative aspect-square overflow-hidden rounded-xl bg-base-200 dark:bg-base-800"
						>
							<img
								src={imageUrl}
								alt=""
								class="h-full w-full object-cover transition-transform group-hover:scale-105"
							/>
							<button
								type="button"
								class="absolute right-2 top-2 rounded-full bg-black/50 p-2 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
								onclick={(e) => copyLink(e, image.uri)}
								title="Copy link"
							>
								<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
								</svg>
							</button>
						</a>
					{/if}
				{/each}
			</div>
		{:else}
			<div class="mt-8 text-sm text-base-500">No images uploaded yet</div>
		{/if}
	{/if}
</div>
