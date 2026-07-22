import { repoToDid } from '$lib/atproto/methods';
import { getImage } from './image.server';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
	const did = await repoToDid(params.repo);
	if (!did) throw error(404, 'User not found');
	return await getImage(did, params.rkey);
}
