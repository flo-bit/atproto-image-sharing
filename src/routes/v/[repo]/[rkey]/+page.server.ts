import { getBlobURL, getRecord, resolveHandle } from '$lib/atproto';
import { isDid, isHandle } from '@atcute/lexicons/syntax';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
	const repo = params.repo;

	const did = isDid(repo)
		? repo
		: isHandle(repo)
			? await resolveHandle({ handle: repo })
			: undefined;

	if (!did) throw error(404, 'User not found');

	const record = await getRecord({ did, collection: 'pics.atmo.video', rkey: params.rkey });

	const videoBlob = record.value.video as { $type: 'blob'; ref: { $link: string } } | undefined;
	const thumbnailBlob = record.value.thumbnail as
		| { $type: 'blob'; ref: { $link: string } }
		| undefined;

	if (!videoBlob || videoBlob.$type !== 'blob') {
		throw error(404, 'Video not found');
	}

	const videoUrl = await getBlobURL({ did, blob: videoBlob });

	return { record, did, videoBlob, thumbnailBlob, videoUrl };
}
