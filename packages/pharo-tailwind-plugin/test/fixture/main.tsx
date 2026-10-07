import { createRoot } from 'react-dom/client';
import { Button, Dialog, DialogTrigger, Popover } from 'react-aria-components';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Theme fixture root is missing.');

const actionClasses =
  'min-h-pharo-control rounded-pharo-control bg-pharo-action px-pharo-4 text-pharo-sm text-pharo-on-action pharo-transition-colors hover:bg-pharo-action-hover pressed:bg-pharo-action-active disabled:bg-pharo-disabled-surface disabled:text-pharo-disabled-foreground focus-visible:pharo-focus-ring';

createRoot(root).render(
  <main className="mx-auto max-w-3xl space-y-pharo-6 p-pharo-8">
    <header>
      <p className="font-pharo-mono text-pharo-xs text-pharo-muted">PHARO / THEME CONTRACT</p>
      <h1 className="text-pharo-display">Clear information, deliberate contrast</h1>
      <p className="mt-pharo-2 text-pharo-base">
        An isolated consumer of the public theme CSS entry.
      </p>
    </header>

    <section
      aria-label="Semantic text"
      className="space-y-pharo-3 rounded-pharo-card bg-pharo-surface p-pharo-6 pharo-shadow-card"
    >
      <h2 className="text-pharo-title">Readable surfaces</h2>
      <p data-testid="foreground" className="bg-pharo-surface text-pharo-foreground">
        Primary text on a clean surface.
      </p>
      <p data-testid="muted" className="bg-pharo-surface text-pharo-muted">
        Supporting text remains legible.
      </p>
      <p
        data-testid="error"
        className="rounded-pharo-control bg-pharo-error-surface p-pharo-3 text-pharo-error"
      >
        Error: a requested series could not be loaded.
      </p>
      <p
        data-testid="success"
        className="rounded-pharo-control bg-pharo-success-surface p-pharo-3 text-pharo-success"
      >
        Success: the supplied data is ready.
      </p>
      <p
        data-testid="warning"
        className="rounded-pharo-control bg-pharo-warning-surface p-pharo-3 text-pharo-warning"
      >
        Notice: choose up to three series.
      </p>
      <div
        data-testid="control-border"
        className="rounded-pharo-control border border-pharo-control-border bg-pharo-surface p-pharo-3"
      >
        Control boundary contrast
      </div>
    </section>

    <section
      aria-label="Interactive states"
      className="space-y-pharo-4 rounded-pharo-card bg-pharo-surface p-pharo-6 pharo-shadow-card"
    >
      <h2 className="text-pharo-title">Intentional states</h2>
      <div className="flex flex-wrap gap-pharo-4">
        <Button className={actionClasses}>Theme action</Button>
        <Button className={actionClasses} isDisabled>
          Unavailable action
        </Button>
        <DialogTrigger>
          <Button className={actionClasses}>Open theme dialog</Button>
          <Popover className="rounded-pharo-card border border-pharo-control-border bg-pharo-surface p-pharo-6 text-pharo-foreground pharo-shadow-overlay">
            <Dialog aria-label="Theme portal" className="outline-none">
              {({ close }) => (
                <div className="space-y-pharo-4">
                  <h2 className="text-pharo-title">A body-portaled surface</h2>
                  <p data-testid="portal-text">Document tokens and typography reach this dialog.</p>
                  <Button onPress={close} className={actionClasses}>
                    Close theme dialog
                  </Button>
                </div>
              )}
            </Dialog>
          </Popover>
        </DialogTrigger>
      </div>
    </section>

    <section
      aria-label="Chart series tokens"
      className="rounded-pharo-card bg-pharo-surface p-pharo-6 pharo-shadow-card"
    >
      <h2 className="text-pharo-title">Distinct beyond color</h2>
      <svg
        role="img"
        aria-labelledby="series-title"
        viewBox="0 0 560 150"
        className="bg-pharo-surface"
      >
        <title id="series-title">Three labeled series with solid, dashed, and dotted lines</title>
        <path
          data-testid="chart-1"
          d="M 20 30 H 330"
          fill="none"
          strokeWidth="4"
          className="stroke-pharo-chart-1"
        />
        <path
          data-testid="chart-2"
          d="M 20 75 H 330"
          fill="none"
          strokeWidth="4"
          className="stroke-pharo-chart-2"
        />
        <path
          data-testid="chart-3"
          d="M 20 120 H 330"
          fill="none"
          strokeWidth="4"
          className="stroke-pharo-chart-3"
        />
        <text x="360" y="35" className="fill-pharo-foreground text-pharo-sm">
          Series one · solid
        </text>
        <text x="360" y="80" className="fill-pharo-foreground text-pharo-sm">
          Series two · dashed
        </text>
        <text x="360" y="125" className="fill-pharo-foreground text-pharo-sm">
          Series three · dotted
        </text>
      </svg>
    </section>
  </main>,
);
