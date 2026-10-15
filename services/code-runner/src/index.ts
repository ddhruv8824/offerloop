import app from './app';
import { PORT } from './config/appConfig';

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Backend API running: http://127.0.0.1:${PORT}`);
});
