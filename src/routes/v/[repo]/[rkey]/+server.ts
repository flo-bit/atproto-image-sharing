import { repoToDid } from '$lib/atproto/methods';
import { getVideo } from './video.server';
import { error } from '@sveltejs/kit';

export async function GET({ params }) {
	const did = await repoToDid(params.repo);
	if (!did) throw error(404, 'User not found');

	const video = await getVideo(did, params.rkey);
	return await fetch(video.videoUrl);
}