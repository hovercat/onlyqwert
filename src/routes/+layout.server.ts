import type { LayoutServerLoad } from './$types';

export interface FooterLink {
	label: string;
	url: string;
}

export interface Branding {
	brandName: string;
	heroTitle: string;
	heroTagline: string;
	footerLinks: FooterLink[];
}

/** Parses `Label|https://url;Other|https://url2`, keeping only http(s) links. */
function parseLinks(raw: string | undefined): FooterLink[] {
	if (!raw) return [];
	return raw
		.split(';')
		.map((part) => part.split('|').map((s) => s.trim()))
		.filter(([label, url]) => label && url && /^https?:\/\//i.test(url))
		.map(([label, url]) => ({ label, url }));
}

// Site specific copy comes from the environment so it stays out of the repo.
export const load: LayoutServerLoad = () => {
	const branding: Branding = {
		brandName: process.env.SITE_BRAND_NAME?.trim() || 'onlyqwert',
		heroTitle: process.env.SITE_HERO_TITLE?.trim() || 'Guess together, live.',
		heroTagline:
			process.env.SITE_HERO_TAGLINE?.trim() ||
			'Open a room, share the code and play. No accounts, no installs.',
		footerLinks: parseLinks(process.env.SITE_FOOTER_LINKS)
	};
	return { branding };
};
