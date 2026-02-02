/**
 * Extracts width and height from a video file by loading it into a temporary video element.
 */
export function getVideoAspectRatio(
	file: File | Blob
): Promise<{ width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const video = document.createElement('video');
		video.preload = 'metadata';

		const url = URL.createObjectURL(file);
		video.src = url;

		video.onloadedmetadata = () => {
			URL.revokeObjectURL(url);
			resolve({ width: video.videoWidth, height: video.videoHeight });
		};

		video.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Failed to load video metadata'));
		};
	});
}

/**
 * Generates a thumbnail from the first frame of a video file.
 * Returns a WebP blob and the video's aspect ratio.
 */
export function generateVideoThumbnail(
	file: File | Blob
): Promise<{ blob: Blob; aspectRatio: { width: number; height: number } }> {
	return new Promise((resolve, reject) => {
		const video = document.createElement('video');
		video.preload = 'auto';
		video.muted = true;
		video.playsInline = true;

		const url = URL.createObjectURL(file);
		video.src = url;

		video.onloadeddata = () => {
			// Seek to the first frame
			video.currentTime = 0;
		};

		video.onseeked = () => {
			const canvas = document.createElement('canvas');
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;

			const ctx = canvas.getContext('2d');
			if (!ctx) {
				URL.revokeObjectURL(url);
				return reject(new Error('Failed to get canvas context'));
			}

			ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

			canvas.toBlob(
				(blob) => {
					URL.revokeObjectURL(url);
					if (!blob) {
						return reject(new Error('Failed to generate thumbnail'));
					}
					resolve({
						blob,
						aspectRatio: {
							width: video.videoWidth,
							height: video.videoHeight
						}
					});
				},
				'image/webp',
				0.8
			);
		};

		video.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Failed to load video'));
		};
	});
}
