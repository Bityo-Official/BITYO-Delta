import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: `${SITE_NAME} · 跨所合約對沖記帳`,
		short_name: SITE_NAME,
		description: SITE_DESCRIPTION,
		start_url: "/dashboard",
		display: "standalone",
		background_color: "#0A0A0B",
		theme_color: "#0A0A0B",
		icons: [
			{ src: "/icon.png", sizes: "any", type: "image/png", purpose: "any" },
		],
	};
}
