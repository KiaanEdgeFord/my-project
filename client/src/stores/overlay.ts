import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

interface Notification {
	title?: string;
	message: string;
	type: 'Success' | 'Error' | 'Warning' | 'Info';
	/** ms */
	timeout?: number;
}

export const useOverlayStore = defineStore('Overlay', () => {

	const notification = ref<Notification>();
	const triggerNotification = (n?: Notification) => {
		notification.value = n;
		setTimeout(() => notification.value = undefined, n?.timeout ?? 5000);
	};

	return {
		triggerNotification,
		notification: computed<Notification | undefined>(() => notification.value)
	};
});