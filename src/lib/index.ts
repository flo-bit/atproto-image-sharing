// place files you want to import through the `$lib` alias in this folder.

import { resolve } from '$app/paths';
import { parseUri } from './atproto';

export function getShareLinkFromUri(uri: string): string {
	const parts = parseUri(uri);
	if (!parts || !parts.rkey) return '';

	return getShareLink(parts.repo, parts.rkey);
}

export function getShareLink(repo: string, rkey: string): string {
	return `${window.location.origin}${resolve('/i/[repo]/[rkey]', {
		repo: repo,
		rkey: rkey
	})}`;
}