// Shared Playwright launcher: bundled Chromium with SwiftShader WebGL (no system Chrome / GPU here).
import { chromium } from 'playwright';

const localLibraries = '/home/dvl/.cache/ms-playwright/local-libs';
process.env.LD_LIBRARY_PATH = [
	`${localLibraries}/usr/lib/x86_64-linux-gnu`,
	`${localLibraries}/lib/x86_64-linux-gnu`,
	process.env.LD_LIBRARY_PATH,
].filter(Boolean).join(':');

// Set PW_CHANNEL=chrome to use an installed Google Chrome instead of the bundled Chromium.
export async function launchBrowser() {
	return chromium.launch({
		channel: process.env.PW_CHANNEL || undefined,
		args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
	});
}

export function collectErrors(page) {
	const errors = [];
	page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(`console: ${message.text()}`);
	});
	return errors;
}
