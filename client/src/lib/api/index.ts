import { v4 as uuid } from 'uuid';

/** Response type for optional API return types */
type Res = Record<string, any> | undefined;

/**
 * Fetches data from the API
 * Throws an error if the response is not ok (Handled by the caller)
 * Assumes response is JSON if status is not NO_CONTENT
 */

export interface Params<T extends Record<string, any> = Record<string, any>> {
	method: 'get' | 'put' | 'delete' | 'post';
	body?: T;
}

const api = async <T extends Res = any>(input: URL | RequestInfo, params: Params): Promise<T | undefined> => {

	// Temporary identifier for the user
	const identifier = localStorage.getItem('identifier');
	if (!identifier) localStorage.setItem('identifier', uuid().replace(/-/g, ''));

	input = (import.meta.env.VITE_APP_API ?? '') + input;
	const init: RequestInit = {
		method: params.method,
		body: JSON.stringify(params.body),
		headers: {
			'Content-Type': 'application/json',
			'identifier': identifier ?? ''
		}
	};
	const response = await fetch(input, init);
	const body = await response.json();
	if (!response.ok) throw new Error(body.message ?? response.statusText);
	if (response.status === 204) return undefined;
	return body;
};

export default api;
