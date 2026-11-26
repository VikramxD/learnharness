import { readFileSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

type ProductBuild = { commit: string | null; dirty: boolean | null; builtAt: string | null };

function readProductBuild(): ProductBuild {
	try {
		const stamp: Partial<ProductBuild> = JSON.parse(readFileSync(path.join(/* turbopackIgnore: true */ process.cwd(), "product-build.json"), "utf8"));
		return { commit: stamp.commit ?? null, dirty: stamp.dirty ?? null, builtAt: stamp.builtAt ?? null };
	} catch {
		return { commit: null, dirty: null, builtAt: null };
	}
}

/** Fork-only route: its presence tells a fork build from the released app, and the stamp names the commit it was built from. */
export function GET() {
	return Response.json({ product: "gen-media", ...readProductBuild() }, { headers });
}
