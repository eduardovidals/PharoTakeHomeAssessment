import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({ component: DashboardRoute });

export function DashboardRoute() {
  return (
    <main>
      <h1>Instrument price dashboard</h1>
      <p>Synthetic historical closing prices</p>
    </main>
  );
}
