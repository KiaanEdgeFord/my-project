import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
	plugins: [
		vue()
	],
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
			'@components': fileURLToPath(new URL('./src/components', import.meta.url)),
			'@views': fileURLToPath(new URL('./src/views', import.meta.url)),
			'@api': fileURLToPath(new URL('./src/lib/api', import.meta.url)),
			'@stores': path.resolve(__dirname, 'src/stores')
		}
	}
});
