// place files you want to import through the `$lib` alias in this folder.

import { resolve } from '$app/paths';
import { parseUri } from './atproto';

export function getShareLinkFromUri(uri: string, handle?: string): string {
	const parts = parseUri(uri);
	if (!parts || !parts.rkey) return '';

	const repo = handle || parts.repo;

	if (parts.collection === 'pics.atmo.video') {
		return getVideoShareLink(repo, parts.rkey);
	}

	if (parts.collection === 'pics.atmo.markdown') {
		return getMarkdownShareLink(repo, parts.rkey);
	}

	return getShareLink(repo, parts.rkey);
}

export function getShareLink(repo: string, rkey: string): string {
	return `${window.location.origin}${resolve('/i/[repo]/[rkey]', {
		repo: repo,
		rkey: rkey
	})}`;
}

export function getVideoShareLink(repo: string, rkey: string): string {
	return `${window.location.origin}${resolve('/v/[repo]/[rkey]', {
		repo: repo,
		rkey: rkey
	})}`;
}

export function getMarkdownShareLink(repo: string, rkey: string): string {
	return `${window.location.origin}${resolve('/m/[repo]/[rkey]', {
		repo: repo,
		rkey: rkey
	})}`;
}
