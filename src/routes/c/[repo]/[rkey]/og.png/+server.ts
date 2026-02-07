import { getRecord, resolveHandle } from '$lib/atproto';
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

	const record = await getRecord({ did, collection: 'pics.atmo.code', rkey: params.rkey });

	const title = (record.value.title as string) || 'Code snippet';
	const content = (record.value.content as string) || '';
	const preview = content.length > 400 ? content.slice(0, 400) + '...' : content;

	const ogWidth = 1200;
	const ogHeight = 630;

	const escapedTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const escapedPreview = preview
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');

	const htmlString = `<div style="display:flex;flex-direction:column;justify-content:center;padding:48px;width:${ogWidth}px;height:${ogHeight}px;background:#1e1e2e;color:#cdd6f4;font-family:monospace;">
  <div style="font-size:36px;font-weight:bold;margin-bottom:24px;color:#89b4fa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapedTitle}</div>
  <div style="font-size:20px;color:#a6adc8;overflow:hidden;display:-webkit-box;-webkit-line-clamp:10;-webkit-box-orient:vertical;white-space:pre-wrap;">${escapedPreview}</div>
</div>`;

	return new ImageResponse(htmlString, {
		width: ogWidth,
		height: ogHeight
	});
}
