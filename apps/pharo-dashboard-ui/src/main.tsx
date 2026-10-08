import { bootstrapApplication } from './app/bootstrap';
import './index.css';

const element = document.getElementById('root');

if (!element) throw new Error('Application mount is missing.');

const startup = bootstrapApplication(element);

// Register ownership immediately, including replacement while startup is still pending.
if (import.meta.hot) {
  import.meta.hot.dispose(async () => {
    const application = await startup;

    await application.dispose();
  });
}

await startup;
