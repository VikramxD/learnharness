import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const CACHE = path.join(os.homedir(), "Library/Caches/ms-playwright");

export function chromiumExecutable() {
	if (process.env.LH_VERIFY_CHROMIUM) return process.env.LH_VERIFY_CHROMIUM;
	const builds = fs.existsSync(CACHE) ? fs.readdirSync(CACHE).filter((d) => d.startsWith("chromium_headless_shell-")) : [];
	builds.sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
	for (const build of builds) {
		const exe = path.join(CACHE, build, "chrome-headless-shell-mac-arm64/chrome-headless-shell");
		if (fs.existsSync(exe)) return exe;
	}
	throw new Error(`No chromium_headless_shell under ${CACHE}; set LH_VERIFY_CHROMIUM`);
}

export function readState(statePath) {
	return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

export async function open(url, { viewport = { width: 1400, height: 900 }, timeout = 20_000 } = {}) {
	const browser = await chromium.launch({ executablePath: chromiumExecutable() });
	const page = await browser.newPage({ viewport });
	page.setDefaultTimeout(timeout);
	const errors = [];
	page.on("pageerror", (e) => errors.push(String(e)));
	page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
	// Not "networkidle": the app holds an SSE stream open forever.
	await page.goto(url, { waitUntil: "domcontentloaded" });
	return { browser, page, errors, url, close: () => browser.close() };
}

const locate = (page, target) => (typeof target === "string" ? page.locator(target).first() : target);

export async function waitFor(page, target, options) {
	const locator = locate(page, target);
	await locator.waitFor({ state: "visible", ...options });
	return locator;
}

export async function click(page, target, options) {
	await (await waitFor(page, target, options)).click();
}

/** The app's composer is a contenteditable that ignores Playwright's fill, so it gets real keystrokes. */
export async function fill(page, target, value, options) {
	const locator = await waitFor(page, target, options);
	if (!(await locator.evaluate((el) => el.isContentEditable))) return locator.fill(value);
	await locator.click();
	await page.keyboard.press("Meta+A");
	await page.keyboard.press("Backspace");
	await page.keyboard.type(value);
}

export async function screenshot(page, file, options) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	await page.screenshot({ path: file, ...options });
	return file;
}

export async function callPlugin(url, id, operation, input = {}) {
	const res = await fetch(`${url}/api/plugins/${encodeURIComponent(id)}/call`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ operation, input }),
	});
	const body = await res.json().catch(() => ({ error: `non-JSON response (${res.status})` }));
	if (!res.ok || body.error) throw new Error(`${id}.${operation} -> ${res.status} ${body.error ?? JSON.stringify(body)}`);
	return body.result;
}
