import express from 'express';
import cors from 'cors';
import codeRouter from './routes/codeRoutes';

const app = express();

app.use(cors({
  origin: '*',
  credentials: true,
  methods: '*',
  allowedHeaders: '*'
}));

app.use(express.json());

// Mount the code router under /api/v1/code
app.use('/api/v1/code', codeRouter);

export default app;
