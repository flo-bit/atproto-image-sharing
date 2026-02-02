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

	const record = await getRecord({ did, collection: 'pics.atmo.image', rkey: params.rkey });

	const blob = record.value.image as { $type: 'blob'; ref: { $link: string } } | undefined;

	if (!blob || blob.$type !== 'blob') {
		throw error(404, 'Image not found');
	}

	const imageUrl = await getBlobURL({ did, blob });

	return { record, did, blob, imageUrl };
}
