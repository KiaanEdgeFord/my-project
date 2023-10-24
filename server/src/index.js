import express from 'express';
import cors from 'cors';
import { PORT, STAGE } from './config/env.js';

const app = express();

/** Middleware */
app
	.use(cors())
	.use(express.urlencoded({ extended: true }))
	.use(express.json());

/** initial route */
app.get('/', async (_, res) => {
	console.log(`Server is running on ${ STAGE() }`);
	res.json({ message: 'Hello' });
});

app.listen(PORT(), () => console.log(`Server is listening on port ${ PORT() }`));
