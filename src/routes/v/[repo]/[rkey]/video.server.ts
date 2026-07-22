import { getBlobURL, getRecord } from '$lib/atproto';
import type { Did } from '@atcute/lexicons';
import { error } from '@sveltejs/kit';

export async function getVideo(did: Did, rkey: string) {
	const record = await getRecord({ collection: 'pics.atmo.video', did, rkey });

	const videoBlob = record.value.video as
		| { $type: 'blob'; mimeType: string; ref: { $link: string } }
		| undefined;

	const thumbnailBlob = record.value.thumbnail as
		| { $type: 'blob'; mimeType: string; ref: { $link: string } }
		| undefined;

	if (!videoBlob || videoBlob.$type !== 'blob') {
		error(404, 'Video not found');
	}

	const videoUrl = await getBlobURL({ did, blob: videoBlob });
	const thumbnailUrl = thumbnailBlob ? await getBlobURL({ did, blob: thumbnailBlob }) : undefined;

	return { record, did, videoBlob, thumbnailBlob, videoUrl, thumbnailUrl };
}
