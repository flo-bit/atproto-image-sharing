<script lang="ts">
	import { user, logout, putRecord, createTID, uploadBlob, listRecords, deleteRecord, parseUri } from '$lib/atproto';
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
	let isDragging = $state(false);
	let dragCounter = 0;

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

	async function uploadImage(file: File) {
		if (!file.type.startsWith('image/')) {
			feedbackMessage = 'Please drop an image file';
			return;
		}

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

	function handleFileInput(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) uploadImage(file);
	}

	function handleDragEnter(event: DragEvent) {
		event.preventDefault();
		dragCounter++;
		if (event.dataTransfer?.types.includes('Files')) {
			isDragging = true;
		}
	}

	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		dragCounter--;
		if (dragCounter === 0) {
			isDragging = false;
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		dragCounter = 0;
		isDragging = false;

		if (!user.isLoggedIn) {
			feedbackMessage = 'Please log in to upload images';
			return;
		}

		const file = event.dataTransfer?.files[0];
		if (file) uploadImage(file);
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

	async function deleteImage(event: Event, uri: string) {
		event.stopPropagation();
		event.preventDefault();

		if (!confirm('Delete this image?')) return;

		const parsed = parseUri(uri);
		if (!parsed?.rkey) {
			feedbackMessage = 'Failed to delete image';
			return;
		}

		try {
			await deleteRecord({
				collection: 'dev.flo-bit.image',
				rkey: parsed.rkey
			});
			images = images.filter((img) => img.uri !== uri);
			feedbackMessage = 'Image deleted';
			setTimeout(() => {
				if (feedbackMessage === 'Image deleted') feedbackMessage = '';
			}, 2000);
		} catch (error) {
			console.error('Failed to delete image:', error);
			feedbackMessage = 'Failed to delete image';
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="min-h-screen"
	ondragenter={handleDragEnter}
	ondragleave={handleDragLeave}
	ondragover={handleDragOver}
	ondrop={handleDrop}
>
	<!-- Drag overlay -->
	{#if isDragging && user.isLoggedIn}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
			<div class="flex flex-col items-center gap-4 text-white">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
				</svg>
				<span class="text-2xl font-medium">Drop image here to upload</span>
			</div>
		</div>
	{/if}

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
			onchange={handleFileInput}
		/>

		<Button class="mt-8" disabled={isUploading} onclick={() => fileInput?.click()}>
			{isUploading ? 'Uploading...' : 'Upload image'}
		</Button>

		<div class="mt-4 h-5 text-sm" class:text-green-600={feedbackMessage.includes('copied') || feedbackMessage.includes('uploaded') || feedbackMessage.includes('deleted')} class:text-red-600={feedbackMessage.includes('Failed')}>
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
							<div class="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100">
								<button
									type="button"
									class="rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
									onclick={(e) => copyLink(e, image.uri)}
									title="Copy link"
								>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
									</svg>
								</button>
								<button
									type="button"
									class="rounded-full bg-black/50 p-2 text-white hover:bg-red-600"
									onclick={(e) => deleteImage(e, image.uri)}
									title="Delete image"
								>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
									</svg>
								</button>
							</div>
						</a>
					{/if}
				{/each}
			</div>
		{:else}
			<div class="mt-8 text-sm text-base-500">No images uploaded yet</div>
		{/if}
	{/if}
	</div>
</div>
