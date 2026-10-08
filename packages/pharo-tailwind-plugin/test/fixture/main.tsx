import { createRoot } from 'react-dom/client';
import { Button, Dialog, DialogTrigger, Popover, ToggleButton } from 'react-aria-components';
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
      <div className="grid gap-pharo-3 sm:grid-cols-3">
        {[
          { name: 'surface', className: 'bg-pharo-surface' },
          { name: 'quiet', className: 'bg-pharo-surface-quiet' },
          { name: 'selected', className: 'bg-pharo-selected' },
        ].map(({ name, className }) => (
          <dl key={name} className={`${className} rounded-pharo-control p-pharo-3`}>
            <dt className="text-pharo-sm text-pharo-foreground">Signed returns · {name}</dt>
            <dd
              data-testid={`positive-${name}`}
              className={`${className} text-pharo-positive tabular-nums`}
            >
              +12.34%
            </dd>
            <dd
              data-testid={`negative-${name}`}
              className={`${className} text-pharo-negative tabular-nums`}
            >
              −5.67%
            </dd>
          </dl>
        ))}
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
        <ToggleButton
          defaultSelected
          className="min-h-pharo-control rounded-pharo-control border border-pharo-control-border bg-pharo-surface px-pharo-4 text-pharo-sm text-pharo-foreground focus-visible:pharo-focus-ring selected:pharo-selected-action"
        >
          Selected view
        </ToggleButton>
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
        <path
          data-testid="chart-grid"
          d="M 20 145 H 330"
          fill="none"
          className="stroke-pharo-chart-grid"
        />
        <path
          data-testid="chart-baseline"
          d="M 20 140 H 330"
          fill="none"
          className="stroke-pharo-chart-baseline"
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

    <section
      aria-label="Compact responsive sizing"
      className="max-w-pharo-workspace space-y-pharo-3 rounded-pharo-card bg-pharo-surface p-pharo-dialog-inset"
    >
      <header data-testid="compact-header" className="flex min-h-pharo-header items-center">
        <h2 className="text-pharo-lg">Readable density</h2>
      </header>
      <label className="flex flex-col gap-pharo-2 text-pharo-sm text-pharo-foreground">
        Density input
        <input
          className="min-h-pharo-control w-full rounded-pharo-control border border-pharo-control-border bg-pharo-surface px-pharo-3 text-pharo-base focus-visible:pharo-focus-ring"
          placeholder="A comfortable touch control"
        />
      </label>
      <div
        data-testid="responsive-plot"
        className="flex h-pharo-plot-mobile items-center justify-center bg-pharo-surface-quiet text-pharo-sm text-pharo-muted sm:h-pharo-plot-desktop"
      >
        Responsive plot box
      </div>
      <p className="max-w-pharo-matrix text-pharo-sm text-pharo-muted">
        Growing readout and table content stay outside the measured plot box.
      </p>
      <div className="max-w-pharo-dialog text-pharo-sm text-pharo-foreground">
        Dialog surfaces share the same bounded width and inset roles.
      </div>
    </section>
  </main>,
);
