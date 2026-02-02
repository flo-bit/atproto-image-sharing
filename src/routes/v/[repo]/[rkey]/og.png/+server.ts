import { getCDNImageBlobUrl, getRecord, resolveHandle } from '$lib/atproto';
import { isDid, isHandle } from '@atcute/lexicons/syntax';
import { error } from '@sveltejs/kit';
import { ImageResponse } from '@ethercorps/sveltekit-og';

export async function GET({ params }) {
	const repo = params.repo;

	const did = isDid(repo)
		? repo
		: isHandle(repo)
			? await resolveHandle({ handle: repo })
			: undefined;

	if (!did) throw error(404, 'User not found');

	const record = await getRecord({ did, collection: 'pics.atmo.video', rkey: params.rkey });

	const aspectRatio = record.value.aspectRatio as {
		width: number;
		height: number;
	};

	const blob = record.value.thumbnail as { $type: 'blob'; ref: { $link: string } } | undefined;

	if (!blob || blob.$type !== 'blob') {
		throw error(404, 'Video thumbnail not found');
	}

	const ogWidth = 1200;
	const ogHeight = 630;

	let imgWidth: number;
	let imgHeight: number;

	if (aspectRatio.width / aspectRatio.height > ogWidth / ogHeight) {
		imgWidth = ogWidth;
		imgHeight = ogWidth / (aspectRatio.width / aspectRatio.height);
	} else {
		imgHeight = ogHeight;
		imgWidth = ogHeight * (aspectRatio.width / aspectRatio.height);
	}

	const htmlString = `<div style="display:flex;align-items:center;justify-content:center;width:${ogWidth}px;height:${ogHeight}px;background:#000;">
  <img src="${getCDNImageBlobUrl({ did: did, blob: blob, type: 'jpeg' }) ?? ''}" width="${Math.round(imgWidth)}" height="${Math.round(imgHeight)}" />
</div>`;

	return new ImageResponse(htmlString, {
		width: ogWidth,
		height: ogHeight
	});
}
