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
	import { tick } from 'svelte';
	import { getShareLinkFromUri } from '$lib';

	type MediaRecord = {
		uri: string;
		value: Record<string, unknown>;
		type: 'image' | 'video' | 'markdown' | 'code';
	};

	let fileInput: HTMLInputElement | undefined = $state();
	let isUploading = $state(false);
	let uploadingMessage = $state('');
	let feedbackMessage = $state('');
	let items = $state<MediaRecord[]>([]);
	let loadingImages = $state(false);
	let isDragging = $state(false);
	let dragCounter = 0;
	let showCreateModal = $state(false);
	let createMode = $state<'pick' | 'pick-text' | 'markdown' | 'code'>('pick');
	let markdownTitle = $state('');
	let markdownContent = $state('');
	let isPublishingMarkdown = $state(false);
	let codeTitle = $state('');
	let codeContent = $state('');
	let isPublishingCode = $state(false);

	let pastedText = $state('');
	let modalEl = $state<HTMLDivElement | undefined>();

	$effect(() => {
		if ((createMode === 'markdown' || createMode === 'code') && modalEl) {
			tick().then(() => {
				const input = modalEl?.querySelector<HTMLElement>('input, textarea');
				input?.focus();
			});
		}
	});

	function detectTextType(text: string): 'code' | 'markdown' | null {
		const lines = text.split('\n');
		let codeScore = 0;
		let markdownScore = 0;

		for (const line of lines) {
			const trimmed = line.trimEnd();
			// Code signals
			if (/[;{}]\s*$/.test(trimmed)) codeScore += 2;
			if (/^\s*(import|export|const|let|var|function|class|def|return|if|for|while|switch|try|catch)\b/.test(trimmed)) codeScore += 2;
			if (/[=!<>]=|=>|->|\|\||&&/.test(trimmed)) codeScore++;
			if (/^\s{2,}\S/.test(line) || /^\t+\S/.test(line)) codeScore++;

			// Markdown signals
			if (/^#{1,6}\s/.test(trimmed)) markdownScore += 3;
			if (/\[.+\]\(.+\)/.test(trimmed)) markdownScore += 2;
			if (/^(\*\*|__).+(\*\*|__)/.test(trimmed) || /(\*|_)\S.*\1/.test(trimmed)) markdownScore++;
			if (/^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) markdownScore += 2;
			if (/^>\s/.test(trimmed)) markdownScore += 2;
		}

		// Code fences count as markdown (it's markdown containing code)
		if (/^```/m.test(text)) markdownScore += 5;

		const threshold = 3;
		if (codeScore >= threshold && codeScore > markdownScore * 1.5) return 'code';
		if (markdownScore >= threshold && markdownScore > codeScore * 1.5) return 'markdown';
		return null;
	}

	function handleTextPaste(text: string) {
		const detected = detectTextType(text);
		if (detected === 'code') {
			publishCodeDirect(text);
		} else if (detected === 'markdown') {
			publishMarkdownDirect(text);
		} else {
			pastedText = text;
			createMode = 'pick-text';
			showCreateModal = true;
		}
	}

	function openCreateModal() {
		createMode = 'pick';
		showCreateModal = true;
	}

	function closeCreateModal() {
		showCreateModal = false;
	}

	function isInputFocused(): boolean {
		const el = document.activeElement;
		return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!user.isLoggedIn) return;

		// When modal is open in pick mode, handle type shortcuts
		if (showCreateModal && (createMode === 'pick' || createMode === 'pick-text')) {
			switch (event.key.toLowerCase()) {
				case 'i':
					event.preventDefault();
					closeCreateModal();
					fileInput?.click();
					return;
				case 'v':
					event.preventDefault();
					closeCreateModal();
					fileInput?.click();
					return;
				case 'm':
					event.preventDefault();
					if (createMode === 'pick-text') {
						markdownContent = pastedText;
						pastedText = '';
					}
					createMode = 'markdown';
					return;
				case 'c':
					event.preventDefault();
					if (createMode === 'pick-text') {
						codeContent = pastedText;
						pastedText = '';
					}
					createMode = 'code';
					return;
				case 'escape':
					closeCreateModal();
					return;
			}
			return;
		}

		if (isInputFocused()) return;
		if (showCreateModal) return;

		if (event.key === '+' || event.key === '=') {
			openCreateModal();
		}
	}

	async function loadItems() {
		if (!user.did) return;
		loadingImages = true;
		try {
			const [imageRecords, videoRecords, markdownRecords, codeRecords] = await Promise.all([
				listRecords({ collection: 'pics.atmo.image', limit: 0 }),
				listRecords({ collection: 'pics.atmo.video', limit: 0 }),
				listRecords({ collection: 'pics.atmo.markdown', limit: 0 }),
				listRecords({ collection: 'pics.atmo.code', limit: 0 })
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
			const codeItems: MediaRecord[] = (codeRecords as any[]).map((r) => ({
				...r,
				type: 'code' as const
			}));
			const all = [...imageItems, ...videoItems, ...markdownItems, ...codeItems];
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
			const handled = await uploadFile(file);
			if (!handled) feedbackMessage = 'Unsupported file type';
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
		if (!user.isLoggedIn) return;
		const pasteItems = event.clipboardData?.items;
		if (!pasteItems) return;

		// Check for files first (images/videos)
		for (const item of pasteItems) {
			if (item.type.startsWith('image/') || item.type.startsWith('video/')) {
				const file = item.getAsFile();
				if (!file) return;
				uploadImage(file);
				return;
			}
		}

		// Check for text — only if no input/textarea is focused
		const active = document.activeElement;
		if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;

		const text = event.clipboardData?.getData('text/plain');
		if (text && text.trim().length > 0) {
			handleTextPaste(text);
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
			showCreateModal = false;
		} catch (error) {
			console.error('Publish failed:', error);
			feedbackMessage = 'Publish failed. Please try again.';
		} finally {
			isPublishingMarkdown = false;
		}
	}

	async function publishCode() {
		if (!codeContent.trim()) {
			feedbackMessage = 'Please write some code';
			return;
		}
		isPublishingCode = true;
		feedbackMessage = '';
		try {
			const rkey = createTID();
			const record = {
				$type: 'pics.atmo.code',
				title: codeTitle.trim() || undefined,
				content: codeContent,
				createdAt: new Date().toISOString()
			};
			await putRecord({
				collection: 'pics.atmo.code',
				rkey,
				record
			});
			const newItem: MediaRecord = {
				uri: `at://${user.did}/pics.atmo.code/${rkey}`,
				value: record,
				type: 'code'
			};
			items = [newItem, ...items];
			const shareLink = getShareLinkFromUri(newItem.uri, user.profile?.handle);
			try {
				await navigator.clipboard.writeText(shareLink);
				feedbackMessage = 'Link copied to clipboard!';
			} catch {
				feedbackMessage = 'Code published!';
			}
			codeTitle = '';
			codeContent = '';
			showCreateModal = false;
		} catch (error) {
			console.error('Publish failed:', error);
			feedbackMessage = 'Publish failed. Please try again.';
		} finally {
			isPublishingCode = false;
		}
	}

	async function publishMarkdownDirect(content: string, title?: string) {
		feedbackMessage = '';
		try {
			const rkey = createTID();
			const record = {
				$type: 'pics.atmo.markdown',
				title: title || undefined,
				content,
				createdAt: new Date().toISOString()
			};
			await putRecord({ collection: 'pics.atmo.markdown', rkey, record });
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
		} catch (error) {
			console.error('Publish failed:', error);
			feedbackMessage = 'Publish failed. Please try again.';
		}
	}

	async function publishCodeDirect(content: string, title?: string) {
		feedbackMessage = '';
		try {
			const rkey = createTID();
			const record = {
				$type: 'pics.atmo.code',
				title: title || undefined,
				content,
				createdAt: new Date().toISOString()
			};
			await putRecord({ collection: 'pics.atmo.code', rkey, record });
			const newItem: MediaRecord = {
				uri: `at://${user.did}/pics.atmo.code/${rkey}`,
				value: record,
				type: 'code'
			};
			items = [newItem, ...items];
			const shareLink = getShareLinkFromUri(newItem.uri, user.profile?.handle);
			try {
				await navigator.clipboard.writeText(shareLink);
				feedbackMessage = 'Link copied to clipboard!';
			} catch {
				feedbackMessage = 'Code published!';
			}
		} catch (error) {
			console.error('Publish failed:', error);
			feedbackMessage = 'Publish failed. Please try again.';
		}
	}

	const CODE_EXTENSIONS = new Set([
		'js', 'ts', 'jsx', 'tsx', 'mjs', 'mts', 'cjs', 'cts',
		'py', 'rb', 'go', 'rs', 'c', 'cpp', 'h', 'hpp', 'cc',
		'java', 'kt', 'kts', 'swift', 'cs', 'fs',
		'sh', 'bash', 'zsh', 'fish',
		'css', 'scss', 'sass', 'less',
		'html', 'xml', 'svg',
		'json', 'yaml', 'yml', 'toml', 'ini', 'cfg',
		'sql', 'lua', 'php', 'pl', 'r', 'scala',
		'zig', 'hs', 'elm', 'ex', 'exs', 'clj', 'cljs',
		'dart', 'vue', 'svelte', 'astro',
		'dockerfile', 'makefile', 'cmake',
		'tf', 'hcl', 'nix', 'dhall',
		'graphql', 'gql', 'proto', 'wasm', 'wat'
	]);

	const MARKDOWN_EXTENSIONS = new Set(['md', 'mdx', 'markdown', 'mdown', 'mkd']);

	function getFileExtension(name: string): string {
		const lower = name.toLowerCase();
		// Handle extensionless known filenames
		if (['dockerfile', 'makefile', 'rakefile', 'gemfile', 'cmakelists.txt'].includes(lower)) {
			return 'dockerfile';
		}
		const dot = lower.lastIndexOf('.');
		return dot >= 0 ? lower.slice(dot + 1) : '';
	}

	async function uploadFile(file: File) {
		const ext = getFileExtension(file.name);

		if (MARKDOWN_EXTENSIONS.has(ext)) {
			const text = await file.text();
			await publishMarkdownDirect(text, file.name);
			return true;
		}

		if (CODE_EXTENSIONS.has(ext)) {
			const text = await file.text();
			await publishCodeDirect(text, file.name);
			return true;
		}

		return false;
	}

	function getBadgeColor(type: MediaRecord['type']): string {
		switch (type) {
			case 'image': return 'bg-cyan-600';
			case 'video': return 'bg-rose-600';
			case 'markdown': return 'bg-amber-600';
			case 'code': return 'bg-purple-600';
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
		if (item.type === 'code') {
			return resolve('/c/[repo]/[rkey]', { repo: handle, rkey });
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
		if (item.type === 'code') return 'snippet';
		return 'image';
	}

	function getItemCollection(item: MediaRecord): AllowedCollection {
		if (item.type === 'video') return 'pics.atmo.video';
		if (item.type === 'markdown') return 'pics.atmo.markdown';
		if (item.type === 'code') return 'pics.atmo.code';
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

<svelte:window onpaste={handlePaste} onkeydown={handleKeydown} />

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

	<!-- Create modal -->
	{#if showCreateModal}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
			onclick={(e) => { if (e.target === e.currentTarget) closeCreateModal(); }}
			onkeydown={(e) => { if (e.key === 'Escape') closeCreateModal(); }}
		>
			<div bind:this={modalEl} class="bg-base-50 dark:bg-base-900 border-base-200 dark:border-base-800 mx-4 w-full max-w-lg rounded-2xl border p-6 shadow-xl">
				{#if createMode === 'pick'}
					<h2 class="mb-4 text-lg font-semibold">What do you want to share?</h2>
					<div class="grid grid-cols-2 gap-3">
						<button
							type="button"
							class="bg-base-100 dark:bg-base-800 hover:bg-base-200 dark:hover:bg-base-700 relative flex flex-col items-center gap-2 rounded-xl p-4 transition-colors"
							onclick={() => { closeCreateModal(); fileInput?.click(); }}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
							</svg>
							<span class="text-sm font-medium">Image</span>
							<kbd class="text-base-400 absolute top-2 right-2 text-[10px] font-mono">I</kbd>
						</button>
						<button
							type="button"
							class="bg-base-100 dark:bg-base-800 hover:bg-base-200 dark:hover:bg-base-700 relative flex flex-col items-center gap-2 rounded-xl p-4 transition-colors"
							onclick={() => { closeCreateModal(); fileInput?.click(); }}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
							</svg>
							<span class="text-sm font-medium">Video</span>
							<kbd class="text-base-400 absolute top-2 right-2 text-[10px] font-mono">V</kbd>
						</button>
						<button
							type="button"
							class="bg-base-100 dark:bg-base-800 hover:bg-base-200 dark:hover:bg-base-700 relative flex flex-col items-center gap-2 rounded-xl p-4 transition-colors"
							onclick={() => (createMode = 'markdown')}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
							</svg>
							<span class="text-sm font-medium">Markdown</span>
							<kbd class="text-base-400 absolute top-2 right-2 text-[10px] font-mono">M</kbd>
						</button>
						<button
							type="button"
							class="bg-base-100 dark:bg-base-800 hover:bg-base-200 dark:hover:bg-base-700 relative flex flex-col items-center gap-2 rounded-xl p-4 transition-colors"
							onclick={() => (createMode = 'code')}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
							</svg>
							<span class="text-sm font-medium">Code</span>
							<kbd class="text-base-400 absolute top-2 right-2 text-[10px] font-mono">C</kbd>
						</button>
					</div>
				{:else if createMode === 'pick-text'}
					<h2 class="mb-2 text-lg font-semibold">What type of text is this?</h2>
					<p class="text-base-500 mb-4 text-sm">We couldn't auto-detect the format. Please choose:</p>
					<pre class="bg-base-100 dark:bg-base-800 text-base-500 mb-4 max-h-32 overflow-hidden rounded-lg p-3 text-xs font-mono">{pastedText.slice(0, 300)}{pastedText.length > 300 ? '...' : ''}</pre>
					<div class="grid grid-cols-2 gap-3">
						<button
							type="button"
							class="bg-base-100 dark:bg-base-800 hover:bg-base-200 dark:hover:bg-base-700 relative flex flex-col items-center gap-2 rounded-xl p-4 transition-colors"
							onclick={() => { markdownContent = pastedText; pastedText = ''; createMode = 'markdown'; }}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
							</svg>
							<span class="text-sm font-medium">Markdown</span>
							<kbd class="text-base-400 absolute top-2 right-2 text-[10px] font-mono">M</kbd>
						</button>
						<button
							type="button"
							class="bg-base-100 dark:bg-base-800 hover:bg-base-200 dark:hover:bg-base-700 relative flex flex-col items-center gap-2 rounded-xl p-4 transition-colors"
							onclick={() => { codeContent = pastedText; pastedText = ''; createMode = 'code'; }}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
							</svg>
							<span class="text-sm font-medium">Code</span>
							<kbd class="text-base-400 absolute top-2 right-2 text-[10px] font-mono">C</kbd>
						</button>
					</div>
				{:else if createMode === 'markdown'}
					<div class="mb-4 flex items-center gap-2">
						<button type="button" aria-label="Back" class="text-base-500 hover:text-base-700 dark:hover:text-base-300" onclick={() => (createMode = 'pick')}>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
							</svg>
						</button>
						<h2 class="text-lg font-semibold">Write markdown</h2>
					</div>
					<div class="flex flex-col gap-3">
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
				{:else if createMode === 'code'}
					<div class="mb-4 flex items-center gap-2">
						<button type="button" aria-label="Back" class="text-base-500 hover:text-base-700 dark:hover:text-base-300" onclick={() => (createMode = 'pick')}>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
							</svg>
						</button>
						<h2 class="text-lg font-semibold">Share code</h2>
					</div>
					<div class="flex flex-col gap-3">
						<input
							type="text"
							placeholder="Title / filename (optional)"
							bind:value={codeTitle}
							class="dark:bg-base-800 bg-base-100 border-base-300 dark:border-base-700 rounded-lg border px-3 py-2 text-sm font-mono"
						/>
						<textarea
							placeholder="Paste your code here..."
							bind:value={codeContent}
							rows="10"
							class="dark:bg-base-800 bg-base-100 border-base-300 dark:border-base-700 rounded-lg border px-3 py-2 text-sm font-mono"
						></textarea>
						<Button disabled={isPublishingCode} onclick={publishCode}>
							{isPublishingCode ? 'Publishing...' : 'Publish'}
						</Button>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<div class="mx-auto my-4 max-w-3xl px-4 md:my-32">
		<h1 class="text-3xl font-bold">atmo.pics</h1>
		<h1 class="my-2">quick atproto image, video and markdown sharing</h1>

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

			<Button class="mt-8" onclick={openCreateModal}>Create new</Button>

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
						{#if item.type === 'markdown' || item.type === 'code'}
							<a
								href={getItemLink(item)}
								class="group bg-base-200 dark:bg-base-800 relative aspect-square overflow-hidden rounded-xl p-4 flex flex-col"
							>
								{#if (item.value as any).title}
									<div class="font-semibold text-sm mb-1 truncate {item.type === 'code' ? 'font-mono' : ''}">{(item.value as any).title}</div>
								{/if}
								<div class="text-xs text-base-500 line-clamp-[8] flex-1 overflow-hidden whitespace-pre-wrap break-words {item.type === 'code' ? 'font-mono' : ''}">
									{((item.value as any).content ?? '').slice(0, 200)}
								</div>
								<span class="absolute bottom-2 left-2 rounded-full {getBadgeColor(item.type)} px-2 py-0.5 text-[10px] font-medium text-white">{item.type}</span>
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
									<span class="absolute bottom-2 left-2 rounded-full {getBadgeColor(item.type)} px-2 py-0.5 text-[10px] font-medium text-white">{item.type}</span>
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

	{#if user.isLoggedIn}
		<button
			type="button"
			class="bg-accent-600 hover:bg-accent-700 fixed right-6 bottom-6 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-colors"
			onclick={openCreateModal}
			title="Create new (+)"
		>
			<svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
			</svg>
		</button>
	{/if}
</div>
