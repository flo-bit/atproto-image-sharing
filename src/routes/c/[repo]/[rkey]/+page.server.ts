import { getRecord, resolveHandle } from '$lib/atproto';
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

	const record = await getRecord({ did, collection: 'pics.atmo.code', rkey: params.rkey });

	if (!record.value.content) {
		throw error(404, 'Code not found');
	}

	return { record, did };
}
