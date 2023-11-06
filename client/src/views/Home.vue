<script setup lang="ts">

	import type { DownloadResponse, Job } from '@/App.vue';
	import { computed, ref, watch } from 'vue';
	import { ArrowUpOnSquareStackIcon } from '@heroicons/vue/24/outline';
	import { useOverlayStore } from '@stores/overlay';
	import Spinner from '@components/loading/Spinner.vue';
	import api from '@api';
	import JSZip from 'jszip';

	const { triggerNotification } = useOverlayStore();

	/** Old jobs reverted after a page refresh */
	const props = defineProps<{
		oldJobs: Job[]
	}>();

	/** Track when the user is dragging files over the upload window */
	const dragging = ref(false);

	/** Reference to files uploaded client-side (pre-server) */
	const uploads = ref<File[]>([]);

	/** Watch for upload changes and request for corresponding jobs */
	watch(() => uploads.value, async (files) => {
		if (!files.length) return;
		await getJobs(files)
			.finally(() => {
				loading.value = false;
			})
			.catch((e: Error) => {
				console.error(e);
				triggerNotification({
					type: 'Error',
					title: 'Failed to upload',
					message: e.message
				});
			});
	}, { deep: true });

	/** Flag to track loading state */
	const loading = ref(false);

	/** Job getter function to get new jobs from the backend */
	const getJobs = async (files: File[]) => {
		loading.value = true;
		const response = await api<{
			results: DownloadResponse
		}>('upload', {
			method: 'put', body: {
				files: files.map(f => f.name),
				options: {
					width: width.value,
					height: height.value
				}
			}
		});
		const newJobs = response?.results;
		if (!newJobs) throw new Error('Failed to connect to the server');
		jobs.value = newJobs.map(j => ({ ...j, status: 'Ready' }));
	};

	/** Reference to current jobs (post-server) */
	const jobs = ref<Job[]>([]);

	/** Watch in-progress jobs on load and update local jobs */
	watch(() => props.oldJobs, (j) => jobs.value = j, { deep: true, immediate: true });


	/** Periodically check job statuses and act accordingly */
	setInterval(async () => {

		if (!jobs.value.length || allDone.value) return;

		const getDownloads = async () => {
			const res = await api<DownloadResponse>('download', { method: 'get' })
				.catch(() => undefined);
			for (let i = 0; i < jobs.value.length; i++) {
				const d = res?.find(r => r.file === jobs.value[i].file);
				if (!d) continue;
				jobs.value[i].download = d.download;
			}
		};

		// Refresh download links
		getDownloads();

		for (let i = 0; i < jobs.value.length; i++) {
			const j = jobs.value[i];
			const f = uploads.value.find(u => u.name === j.file);
			if (!f && j.status !== 'Processing') continue;
			switch (j.status) {
				case 'Error':
				case 'Done':
				case 'Uploading':
					continue;
				case 'Ready':
					await (async () => {
						jobs.value[i].status = 'Uploading';
						const arrayBuff = await f
							?.arrayBuffer()
							?.catch(() => undefined);
						if (!arrayBuff) {
							jobs.value[i].status = 'Error';
							return;
						}
						const blob = new Blob([arrayBuff], { type: f.type });
						const uploadFileRes = await fetch(j.upload, { method: 'put', body: blob });
						if (!uploadFileRes.ok) {
							jobs.value[i].status = 'Error';
							return;
						}
					})()
						.catch(() => jobs.value[i].status = 'Error')
						.then(() => jobs.value[i].status = 'Processing');
					break;
				case 'Processing':
					if (!j.download) continue;
					const file = await fetch(j.download, { method: 'get' })
						.catch(() => undefined);
					if (file?.status !== 200) continue;
					const blob = await file.blob();
					jobs.value[i].blob = blob;
					jobs.value[i].status = 'Done';
					break;
			}
		}
	}, 5000);

	/** Handle file drop event */
	const dropHandler = (event: DragEvent) => {
		const fileList = event.dataTransfer?.files;
		if (!fileList) return;
		uploads.value = [...fileList];
	};

	/** Manually upload files though the upload window */
	const uploadFiles = (): void => {
		const input = document.createElement('input');
		input.type = 'file';
		input.multiple = true;
		input.onchange = () => {
			if (!input.files) throw new Error('No files uploaded...');
			if (input.files.length > 20) return triggerNotification({
				type: 'Error',
				title: 'Too Many Files',
				message: 'You can only upload a maximum of 20 files at a time.'
			});
			for (let i = 0; i < input.files.length; i++) {
				const file = input.files[i];
				const fileSizeBytes = file.size;
				const fileSizeLimit = 50 * 1024 * 1024; // Set a size limit of 50MB in bytes
				if (fileSizeBytes > fileSizeLimit) return triggerNotification({
					type: 'Error',
					title: 'Files Too Large',
					message: 'Files must be less than 50MB total in size.'
				});
			}
			uploads.value = [...input.files];
		};
		input.click();
	};

	/** Zips and downloads all results */
	const downloadAll = async (): Promise<void> => {
		const zip = new JSZip();
		jobs.value.forEach(j => {
			if (!j.blob) return;
			zip.file(j.file, j.blob);
		});
		try {
			const content = await zip.generateAsync({ type: 'blob' });
			const url = window.URL.createObjectURL(content);
			const link = document.createElement('a');
			link.href = url;
			link.download = 'resized.zip';
			link.click();
		} catch (e) {
			console.error(e);
			triggerNotification({
				type: 'Error',
				title: 'Failed to download',
				message: 'Something went wrong, try this again later.'
			});
		}
	};

	/** Clear all jobs - Only locally, refreshing will revert previous session */
	const clear = () => {
		jobs.value = [];
		uploads.value = [];
	};

	/** Width and height of the images to be resized */
	const height = ref(4096);
	const width = ref(4096);

	/** Flag to indicate all jobs are complete */
	const allDone = computed<boolean>(() => Boolean(
		jobs.value.length &&
		jobs.value.every(j => j.status === 'Done'))
	);

</script>

<template>

	<div class="wrapper h-full">

		<div class="flex center-left">
			<div>
				<img src="@/assets/logo.png" alt="logo" class="h-32 w-32"/>
			</div>
			<div class="text-3xl font-semibold">
				Resize Mate
			</div>
		</div>

		<!-- File uploader when no jobs exist -->
		<div v-if="!jobs.length" class="h-full p-10">
			<div class="mb-6">
				With this image processor you can bulk reduce or upscale images.
				<div class="pt-4 flex gap-4 justify-between">
					<div class="flex gap-4">
						<div
							class="rounded-md px-3 pb-1.5 pt-2.5 shadow-sm ring-1 ring-inset ring-gray-300
						 focus-within:ring-2 focus-within:ring-indigo-600 w-40">
							<label for="name" class="block text-xs font-medium">Width</label>
							<input
								type="number" name="width" id="width" min="10"
								v-model="width"
								placeholder="px"
								class="block w-full border-0 p-0 placeholder:text-gray-400 focus:ring-0 sm:text-sm
								sm:leading-6 bg-transparent"/>
						</div>
						<div
							class="rounded-md px-3 pb-1.5 pt-2.5 shadow-sm ring-1 ring-inset ring-gray-300
						 focus-within:ring-2 focus-within:ring-indigo-600 w-40">
							<label for="name" class="block text-xs font-medium">Height</label>
							<input
								type="number" name="height" id="height" min="10"
								v-model="height"
								placeholder="px"
								class="block w-full border-0 p-0 placeholder:text-gray-400 focus:ring-0 sm:text-sm
								sm:leading-6 bg-transparent"/>
						</div>
					</div>
				</div>
			</div>
			<div
				v-if="loading"
				class="relative block w-full rounded-lg border-2 border-dashed border-gray-300 p-12 text-center
				hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
				center h-64">
				<Spinner class="h-6 w-6"/>
			</div>
			<button
				v-else
				type="button"
				@drop.prevent="dropHandler($event); dragging = false"
				@dragenter.prevent="dragging = true"
				@dragover.prevent="dragging = true"
				@dragleave.prevent="dragging = false"
				@click="uploadFiles()"
				class="relative block w-full rounded-lg border-2 border-dashed border-gray-300 p-12 text-center
				hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
				h-64"
				:class="dragging ? 'ring-2 ring-indigo-500' : ''"
			>
				<ArrowUpOnSquareStackIcon class="mx-auto h-8 w-8"/>
				<span class="mt-3 block text-sm font-semibold">Upload files here</span>
			</button>
		</div>

		<!-- Job list for progress updates -->
		<div v-else class="h-full rounded-lg overflow-y-auto bg-white px-4">
			<div class="px-4 sm:px-6 lg:px-8">
				<div class="sm:flex sm:items-center pt-6">
					<div class="sm:flex-auto">
						<h1 class="text-base font-semibold leading-6 text-gray-900">Files</h1>
						<p class="mt-2 text-sm text-gray-700">
							A list of all the files being processed.
						</p>
					</div>
					<div class="mt-4 sm:ml-16 sm:mt-0 sm:flex-none flex gap-2">
						<button
							type="button"
							@click="downloadAll()"
							:disabled="!allDone"
							class="block rounded-md bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white
							shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2
							focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50">
							Download All
						</button>
						<button
							type="button"
							@click="clear()"
							class="block rounded-md bg-white border-2 px-3 py-2 text-center text-sm font-semibold
							text-gray-600 shadow-sm hover:bg-gray-50 focus-visible:outline focus-visible:outline-2
							focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
							Clear
						</button>
					</div>
				</div>
				<div class="mt-8 flow-root">
					<div class="-mx-4 -my-2 sm:-mx-6 lg:-mx-8">
						<div class="inline-block min-w-full py-2 align-middle h-full">
							<table class="min-w-full border-separate border-spacing-0">
								<thead>
								<tr>
									<th scope="col"
										class="sticky top-0 z-10 border-b border-gray-300 bg-white bg-opacity-75 py-3.5
										pl-4 pr-3 text-left text-sm font-semibold text-gray-900 backdrop-blur
										backdrop-filter sm:pl-6 lg:pl-8 w-5/6">
										Name
									</th>
									<th scope="col"
										class="sticky top-0 z-10 border-b border-gray-300 bg-white bg-opacity-75 py-3.5
										pl-3 pr-4 backdrop-blur backdrop-filter sm:pr-6 lg:pr-8 w-1/6">
										<span class="sr-only">Edit</span>
									</th>
								</tr>
								</thead>
								<tbody>
								<tr v-for="(job, i) in jobs" :key="i">
									<td
										:class="i !== jobs.length ? 'border-b border-gray-200' : ''"
										class="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900
										sm:pl-6 lg:pl-8">
										{{ job.file }}
									</td>
									<td
										:class="i !== jobs.length ? 'border-b border-gray-200' : ''"
										class="flex justify-end whitespace-nowrap py-4 pl-3 pr-3 text-sm font-medium
										text-gray-900 text-right">
										<span
											v-if="job.status === 'Ready'"
											class="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">
											Ready
										</span>
										<span
											v-else-if="job.status === 'Error'"
											class="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">
											Error
										</span>
										<span
											v-else-if="job.status === 'Processing'"
											class="inline-flex items-center rounded-md bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 ring-1 ring-inset ring-purple-700/10">
											Processing
											<Spinner class="h-2 w-2 ml-2"/>
										</span>
										<span
											v-else-if="job.status === 'Uploading'"
											class="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
											Uploading
											<Spinner class="h-2 w-2 ml-2"/>
										</span>
										<span
											v-else
											class="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
											Done
										</span>
									</td>
								</tr>
								</tbody>
							</table>
						</div>
					</div>
				</div>
			</div>
		</div>

	</div>

</template>

<style scoped>

	.wrapper {
		display: grid;
		grid-template-rows: auto 1fr;
	}

</style>