export default class Job {

	id: string;
	key: string;
	receipt: string;
	size: number;

	private timer: number = 0;

	failures: number = 0;

	constructor(job: JobArgs) {
		this.id = job.id;
		this.key = job.key;
		this.receipt = job.receipt;
		this.size = job.size;
	}

	sizeInMB(): number {
		return this.size / 1000000;
	}

	/** Starts a timer to track job duration */
	start(): void {
		this.timer = performance.now();
	}

	/** Stops the timer and returns the duration as a string with appropriate units */
	stop(): string {
		const duration = performance.now() - this.timer; // duration in milliseconds
		if (duration < 1000) {
			// Less than a second, show in milliseconds
			return `${ duration.toFixed(0) }ms`;
		} else if (duration < 60000) {
			// Less than a minute but more than a second, show in seconds
			return `${ (duration / 1000).toFixed(2) }sec`;
		} else {
			// More than a minute, show in minutes and seconds
			const minutes = Math.floor(duration / 60000);
			const seconds = ((duration % 60000) / 1000).toFixed(2);
			return `${ minutes }min ${ seconds }sec`;
		}
	}

	/** Get this jobs session ID */
	session(): string | undefined {
		// Keys are in the format jobs/input/{sessionID}/{filename.extension}
		// Get the session ID from they key or return undefined if none found
		return this.key.split('/')[2];
	}


}

/**
 * Exclude null, undefined, and callable properties from T.
 * Does not exclude getters and setters specified with keywords get & set.
 */
type DataProps<T> = Pick<T, { [K in keyof T]: T[K] extends (..._: any) => any ? never : K }[keyof T]>;

type JobArgs = DataProps<
	Omit<Job,
		| 'state'
		| 'failures'
		| 'visibilityTimout'
	>
>;

