<script lang="ts">
	import {
		user,
		logout,
		putRecord,
		createTID,
		uploadBlob,
		listRecords,
		deleteRecord,
		parseUri
	} from '$lib/atproto';
	import { compressImage, getImageFromRecord } from '$lib/atproto/image-helper';
	import type { AllowedCollection } from '$lib/atproto/settings';
	import { generateVideoThumbnail } from '$lib/atproto/video-helper';
	import Avatar from '$lib/atproto/UI/Avatar.svelte';
	import Button from '$lib/atproto/UI/Button.svelte';
	import { loginModalState } from '$lib/atproto/UI/LoginModal.svelte';
	import { resolve } from '$app/paths';
	import { getShareLinkFromUri } from '$lib';

	type MediaRecord = {
		uri: string;
		value: Record<string, unknown>;
		type: 'image' | 'video' | 'markdown';
	};

	let fileInput: HTMLInputElement | undefined = $state();
	let isUploading = $state(false);
	let uploadingMessage = $state('');
	let feedbackMessage = $state('');
	let items = $state<MediaRecord[]>([]);
	let loadingImages = $state(false);
	let isDragging = $state(false);
	let dragCounter = 0;
	let showMarkdownEditor = $state(false);
	let markdownTitle = $state('');
	let markdownContent = $state('');
	let isPublishingMarkdown = $state(false);

	async function loadItems() {
		if (!user.did) return;
		loadingImages = true;
		try {
			const [imageRecords, videoRecords, markdownRecords] = await Promise.all([
				listRecords({ collection: 'pics.atmo.image', limit: 0 }),
				listRecords({ collection: 'pics.atmo.video', limit: 0 }),
				listRecords({ collection: 'pics.atmo.markdown', limit: 0 })
			]);
			const imageItems: MediaRecord[] = (imageRecords as any[]).map((r) => ({
				...r,
				type: 'image' as const
			}));
			const videoItems: MediaRecord[] = (videoRecords as any[]).map((r) => ({
				...r,
				type: 'video' as const
			}));
			const markdownItems: MediaRecord[] = (markdownRecords as any[]).map((r) => ({
				...r,
				type: 'markdown' as const
			}));
			const all = [...imageItems, ...videoItems, ...markdownItems];
			all.sort((a, b) => {
				const dateA = (a.value as any).createdAt || '';
				const dateB = (b.value as any).createdAt || '';
				return dateB.localeCompare(dateA);
			});
			items = all;
		} catch (error) {
			console.error('Failed to load items:', error);
		} finally {
			loadingImages = false;
		}
	}

	$effect(() => {
		if (user.isLoggedIn) {
			loadItems();
		} else {
			items = [];
		}
	});

	async function uploadVideo(file: File) {
		isUploading = true;
		uploadingMessage = 'Processing video...';
		feedbackMessage = '';

		try {
			const { blob: thumbnailBlob, aspectRatio } = await generateVideoThumbnail(file);

			uploadingMessage = 'Uploading video...';

			const [videoBlobInfo, thumbnailBlobInfo] = await Promise.all([
				uploadBlob({ blob: file }),
				uploadBlob({ blob: thumbnailBlob })
			]);

			const rkey = createTID();

			const record = {
				$type: 'pics.atmo.video',
				video: videoBlobInfo,
				thumbnail: thumbnailBlobInfo,
				aspectRatio,
				createdAt: new Date().toISOString()
			};

			await putRecord({
				collection: 'pics.atmo.video',
				rkey,
				record
			});

			const newItem: MediaRecord = {
				uri: `at://${user.did}/pics.atmo.video/${rkey}`,
				value: record,
				type: 'video'
			};
			items = [newItem, ...items];

			const shareLink = getShareLinkFromUri(newItem.uri, user.profile?.handle);
			try {
				await navigator.clipboard.writeText(shareLink);
				feedbackMessage = 'Link copied to clipboard!';
			} catch {
				feedbackMessage = 'Video uploaded!';
			}
		} catch (error) {
			console.error('Upload failed:', error);
			feedbackMessage = 'Upload failed. Please try again.';
		} finally {
			isUploading = false;
			uploadingMessage = '';
			if (fileInput) {
				fileInput.value = '';
			}
		}
	}

	async function uploadImage(file: File) {
		if (file.type.startsWith('video/')) {
			return uploadVideo(file);
		}
		if (!file.type.startsWith('image/')) {
			feedbackMessage = 'Please drop an image or video file';
			return;
		}

		isUploading = true;
		feedbackMessage = '';

		try {
			const compressedImage = await compressImage(file);
			const blobInfo = await uploadBlob({ blob: compressedImage.blob });
			const rkey = createTID();

			const record = {
				$type: 'pics.atmo.image',
				image: blobInfo,
				aspectRatio: compressedImage.aspectRatio,
				createdAt: new Date().toISOString()
			};

			await putRecord({
				collection: 'pics.atmo.image',
				rkey,
				record
			});

			// Add the new image to the list
			const newImage: MediaRecord = {
				uri: `at://${user.did}/pics.atmo.image/${rkey}`,
				value: record,
				type: 'image'
			};
			items = [newImage, ...items];

			// Copy link to clipboard
			const shareLink = getShareLinkFromUri(newImage.uri, user.profile?.handle);
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
			feedbackMessage = 'Please log in to upload';
			return;
		}

		const file = event.dataTransfer?.files[0];
		if (file) uploadImage(file);
	}

	function handlePaste(event: ClipboardEvent) {
		const pasteItems = event.clipboardData?.items;
		if (!pasteItems) return;

		for (const item of pasteItems) {
			if (item.type.startsWith('image/') || item.type.startsWith('video/')) {
				const file = item.getAsFile();
				if (!file) return;

				if (!user.isLoggedIn) {
					feedbackMessage = 'Please log in to upload';
					return;
				}

				uploadImage(file);
				return;
			}
		}
	}

	async function publishMarkdown() {
		if (!markdownContent.trim()) {
			feedbackMessage = 'Please write some content';
			return;
		}
		isPublishingMarkdown = true;
		feedbackMessage = '';
		try {
			const rkey = createTID();
			const record = {
				$type: 'pics.atmo.markdown',
				title: markdownTitle.trim() || undefined,
				content: markdownContent,
				createdAt: new Date().toISOString()
			};
			await putRecord({
				collection: 'pics.atmo.markdown',
				rkey,
				record
			});
			const newItem: MediaRecord = {
				uri: `at://${user.did}/pics.atmo.markdown/${rkey}`,
				value: record,
				type: 'markdown'
			};
			items = [newItem, ...items];
			const shareLink = getShareLinkFromUri(newItem.uri, user.profile?.handle);
			try {
				await navigator.clipboard.writeText(shareLink);
				feedbackMessage = 'Link copied to clipboard!';
			} catch {
				feedbackMessage = 'Markdown published!';
			}
			markdownTitle = '';
			markdownContent = '';
			showMarkdownEditor = false;
		} catch (error) {
			console.error('Publish failed:', error);
			feedbackMessage = 'Publish failed. Please try again.';
		} finally {
			isPublishingMarkdown = false;
		}
	}

	function getThumbnailUrl(record: MediaRecord): string | undefined {
		if (!user.did) return;
		if (record.type === 'video') {
			return getImageFromRecord(record.value, user.did, 'thumbnail');
		}
		return getImageFromRecord(record.value, user.did);
	}

	function getItemLink(item: MediaRecord): string {
		const rkey = parseUri(item.uri)?.rkey ?? '';
		const handle = user.profile?.handle ?? user.did ?? '';
		if (item.type === 'video') {
			return resolve('/v/[repo]/[rkey]', { repo: handle, rkey });
		}
		if (item.type === 'markdown') {
			return resolve('/m/[repo]/[rkey]', { repo: handle, rkey });
		}
		return resolve('/i/[repo]/[rkey]', { repo: handle, rkey });
	}

	async function copyLink(event: Event, uri: string) {
		event.stopPropagation();
		event.preventDefault();
		try {
			await navigator.clipboard.writeText(getShareLinkFromUri(uri, user.profile?.handle));
			feedbackMessage = 'Link copied!';
			setTimeout(() => {
				if (feedbackMessage === 'Link copied!') feedbackMessage = '';
			}, 2000);
		} catch {
			feedbackMessage = 'Failed to copy link';
		}
	}

	function getItemLabel(item: MediaRecord): string {
		if (item.type === 'video') return 'video';
		if (item.type === 'markdown') return 'post';
		return 'image';
	}

	function getItemCollection(item: MediaRecord): AllowedCollection {
		if (item.type === 'video') return 'pics.atmo.video';
		if (item.type === 'markdown') return 'pics.atmo.markdown';
		return 'pics.atmo.image';
	}

	async function deleteItem(event: Event, item: MediaRecord) {
		event.stopPropagation();
		event.preventDefault();

		const label = getItemLabel(item);
		if (!confirm(`Delete this ${label}?`)) return;

		const parsed = parseUri(item.uri);
		if (!parsed?.rkey) {
			feedbackMessage = `Failed to delete ${label}`;
			return;
		}

		try {
			await deleteRecord({
				collection: getItemCollection(item),
				rkey: parsed.rkey
			});
			items = items.filter((i) => i.uri !== item.uri);
			feedbackMessage = `${label.charAt(0).toUpperCase() + label.slice(1)} deleted`;
			setTimeout(() => {
				if (feedbackMessage.includes('deleted')) feedbackMessage = '';
			}, 2000);
		} catch (error) {
			console.error('Failed to delete:', error);
			feedbackMessage = `Failed to delete ${label}`;
		}
	}
</script>

<svelte:window onpaste={handlePaste} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="min-h-screen"
	ondragenter={handleDragEnter}
	ondragleave={handleDragLeave}
	ondragover={handleDragOver}
	ondrop={handleDrop}
>
	<!-- Upload overlay -->
	{#if isUploading}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
			<div class="flex flex-col items-center gap-4 text-white">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-16 w-16 animate-pulse"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
					/>
				</svg>
				<span class="text-2xl font-medium">{uploadingMessage || 'Uploading...'}</span>
			</div>
		</div>
	{/if}

	<!-- Drag overlay -->
	{#if isDragging && user.isLoggedIn}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
			<div class="flex flex-col items-center gap-4 text-white">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-16 w-16"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
					/>
				</svg>
				<span class="text-2xl font-medium">Drop file here to upload</span>
			</div>
		</div>
	{/if}

	<div class="mx-auto my-4 max-w-3xl px-4 md:my-32">
		<h1 class="text-3xl font-bold">atmo.pics</h1>
		<h1 class="my-2">atproto image and video sharing</h1>

		<a
			href="https://github.com/flo-bit/atproto-image-sharing"
			target="_blank"
			class="dark:text-accent-500 mt-2 text-sm text-rose-600">source code</a
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
				accept="image/*,video/*"
				class="hidden"
				bind:this={fileInput}
				onchange={handleFileInput}
			/>

			<Button class="mt-8" disabled={isUploading} onclick={() => fileInput?.click()}>
				{isUploading ? 'Uploading...' : 'Upload image or video'}
			</Button>

			<Button class="mt-2" onclick={() => (showMarkdownEditor = !showMarkdownEditor)}>
				{showMarkdownEditor ? 'Cancel writing' : 'Write markdown'}
			</Button>

			{#if showMarkdownEditor}
				<div class="mt-4 flex flex-col gap-3">
					<input
						type="text"
						placeholder="Title (optional)"
						bind:value={markdownTitle}
						class="dark:bg-base-800 bg-base-100 border-base-300 dark:border-base-700 rounded-lg border px-3 py-2 text-sm"
					/>
					<textarea
						placeholder="Write your markdown here..."
						bind:value={markdownContent}
						rows="8"
						class="dark:bg-base-800 bg-base-100 border-base-300 dark:border-base-700 rounded-lg border px-3 py-2 text-sm font-mono"
					></textarea>
					<Button disabled={isPublishingMarkdown} onclick={publishMarkdown}>
						{isPublishingMarkdown ? 'Publishing...' : 'Publish'}
					</Button>
				</div>
			{/if}

			<div
				class="mt-4 h-5 text-sm"
				class:text-green-600={feedbackMessage.includes('copied') ||
					feedbackMessage.includes('uploaded') ||
					feedbackMessage.includes('deleted') ||
					feedbackMessage.includes('published')}
				class:text-red-600={feedbackMessage.includes('Failed')}
			>
				{feedbackMessage}
			</div>

			{#if loadingImages}
				<div class="mt-8 text-sm">Loading images...</div>
			{:else if items.length > 0}
				<div class="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
					{#each items as item (item.uri)}
						{#if item.type === 'markdown'}
							<a
								href={getItemLink(item)}
								class="group bg-base-200 dark:bg-base-800 relative aspect-square overflow-hidden rounded-xl p-4 flex flex-col"
							>
								{#if (item.value as any).title}
									<div class="font-semibold text-sm mb-1 truncate">{(item.value as any).title}</div>
								{/if}
								<div class="text-xs text-base-500 line-clamp-[8] flex-1 overflow-hidden whitespace-pre-wrap break-words">
									{((item.value as any).content ?? '').slice(0, 200)}
								</div>
								<div
									class="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100"
								>
									<button
										type="button"
										class="rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
										onclick={(e) => copyLink(e, item.uri)}
										title="Copy link"
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
									</button>
									<button
										type="button"
										class="rounded-full bg-black/50 p-2 text-white hover:bg-red-600"
										onclick={(e) => deleteItem(e, item)}
										title="Delete"
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
												d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
											/>
										</svg>
									</button>
								</div>
							</a>
						{:else}
							{@const thumbnailUrl = getThumbnailUrl(item)}
							{#if thumbnailUrl}
								<a
									href={getItemLink(item)}
									class="group bg-base-200 dark:bg-base-800 relative aspect-square overflow-hidden rounded-xl"
								>
									<img
										src={thumbnailUrl}
										alt=""
										class="h-full w-full object-cover transition-transform group-hover:scale-105"
									/>
									{#if item.type === 'video'}
										<div
											class="pointer-events-none absolute inset-0 flex items-center justify-center"
										>
											<div class="rounded-full bg-black/50 p-3">
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-8 w-8 text-white"
													viewBox="0 0 24 24"
													fill="currentColor"
												>
													<path d="M8 5v14l11-7z" />
												</svg>
											</div>
										</div>
									{/if}
									<div
										class="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100"
									>
										<button
											type="button"
											class="rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
											onclick={(e) => copyLink(e, item.uri)}
											title="Copy link"
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
										</button>
										<button
											type="button"
											class="rounded-full bg-black/50 p-2 text-white hover:bg-red-600"
											onclick={(e) => deleteItem(e, item)}
											title="Delete"
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
													d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
												/>
											</svg>
										</button>
									</div>
								</a>
							{/if}
						{/if}
					{/each}
				</div>
			{:else}
				<div class="text-base-500 mt-8 text-sm">No content uploaded yet</div>
			{/if}
		{/if}
	</div>
</div>
