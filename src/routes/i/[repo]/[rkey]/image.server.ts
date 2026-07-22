import { getBlobURL, getRecord } from '$lib/atproto';
import type { Did } from '@atcute/lexicons';
import { error } from '@sveltejs/kit';

export async function getImage(did: Did, rkey: string) {
	const record = await getRecord({ collection: 'pics.atmo.image', did, rkey });

	const blob = record.value.image as
		| { $type: 'blob'; mimeType: string; ref: { $link: string } }
		| undefined;

	if (!blob || blob.$type !== 'blob') {
		error(404, 'Image not found');
	}

	const imageUrl = await getBlobURL({ did, blob });

	return { record, did, blob, imageUrl };
}
