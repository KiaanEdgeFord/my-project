<template>
	<div class="h-full w-full p-10">
		<Notification/>
		<Home :oldJobs="inProgressJobs"/>
	</div>
</template>

<script setup lang="ts">

	import { ref } from 'vue';
	import Notification from '@components/notification/Notification.vue';
	import { useOverlayStore } from '@stores/overlay';
	import Home from '@views/Home.vue';
	import api from '@api';

	/** Response expected from the init route */
	export interface Job {
		file: string;
		upload: string;
		download?: string;
		status: 'Ready' | 'Uploading' | 'Processing' | 'Done' | 'Error';
		blob?: Blob;
	}

	export type DownloadResponse = Array<Omit<Job, 'status' | 'blob'>>

	/** Flag to track loading state */
	const loading = ref(false);

	/** Any jobs received from the initialisation endpoint to be marked as in-progress */
	const inProgressJobs = ref<Job[]>([]);

	/** Method for getting previous session */
	const initialisation = async (): Promise<void> => {
		loading.value = true;
		const jobs = await api<DownloadResponse>('download', { method: 'get' });
		if (!jobs) throw new Error('Failed to connect to the server');
		inProgressJobs.value = jobs.map(j => ({ ...j, status: 'Processing' }));
	};

	const { triggerNotification } = useOverlayStore();
	initialisation()
		.finally(() => loading.value = false)
		.catch((e: Error) => {
			console.error(e);
			triggerNotification({
				type: 'Error',
				title: 'Error',
				message: e.message
			});
		});

</script>