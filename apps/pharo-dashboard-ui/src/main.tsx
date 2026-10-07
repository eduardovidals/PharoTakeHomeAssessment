import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createAppQueryClient } from './app/queryClient';
import { createAppRouter } from './app/router';
import { AppProviders } from './app/providers/AppProviders';

const element = document.getElementById('root');
if (!element) throw new Error('Application mount is missing.');
const router = createAppRouter(createAppQueryClient());
createRoot(element).render(
  <StrictMode>
    <AppProviders router={router} />
  </StrictMode>,
);
