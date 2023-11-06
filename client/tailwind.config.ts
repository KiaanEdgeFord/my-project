import { Config } from 'tailwindcss';
import * as defaultTheme from 'tailwindcss/defaultTheme';

const config: Config = {
	content: [
		'./index.html',
		'./src/**/*.{vue,js,ts,jsx,tsx}'
	],
	theme: {
		extend: {
			fontFamily: {
				sans: ['Inter var', ...defaultTheme.fontFamily.sans]
			}
		}
	},
	plugins: [
		// @ts-ignore
		require('@tailwindcss/forms')
	]
};

export default config;


