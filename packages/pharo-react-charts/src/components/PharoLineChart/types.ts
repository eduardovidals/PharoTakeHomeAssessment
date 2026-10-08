import type {
  ChartInspectionRow,
  PharoChartPoint,
  PharoChartSeries,
  PharoChartAppearance,
} from '../../types';
export type { PharoChartPoint, PharoChartSeries, PharoChartAppearance } from '../../types';

/** Independent formatter contexts preserve readable axis, detail, table and spoken labels. */
export interface PharoChartFormatters {
  /** Short UTC axis text; defaults to month/day with year for multiyear domains. */
  readonly formatXAxis?: (timestamp: number) => string;
  /** Full date in the inspection readout; defaults to the canonical UTC date. */
  readonly formatXDetail?: (timestamp: number) => string;
  /** Visible date for every recorded table row. */
  readonly formatXTable?: (timestamp: number) => string;
  /** Complete spoken date for the native inspection control and table. */
  readonly formatXAccessible?: (timestamp: number) => string;
  /** Numerical axis labels; no assumed currency or percentage units. */
  readonly formatYAxis?: (value: number) => string;
  /** Full recorded inspection values. */
  readonly formatYDetail?: (value: number) => string;
  /** Full recorded table values. */
  readonly formatYTable?: (value: number) => string;
}

/** Standalone data disclosure, or an accessible consumer-owned data trigger. */
export type PharoChartDataTableMode =
  | {
      /** Keep the chart-owned recorded-data disclosure. */
      readonly mode: 'inline';
      /** Inline disclosure does not associate an external trigger. */
      readonly triggerId?: never;
    }
  | {
      /** Use a consumer-owned accessible data alternative. */
      readonly mode: 'external';
      /** ID of the named, enabled and keyboard-reachable data trigger. */
      readonly triggerId: string;
    };

/** Responsive SVG comparison with recorded-point inspection and a shared data table. */
export interface PharoLineChartProps extends PharoChartFormatters {
  /** Zero to three independent series using one shared pair of domains. */
  readonly series: readonly PharoChartSeries[];
  /** Required accessible chart name. */
  readonly label: string;
  /** Optional accessible description associated with the named SVG. */
  readonly description?: string;
  /** Optional text below the x-axis tick row. */
  readonly xAxisLabel?: string;
  /** Optional text above the plot describing its numerical units. */
  readonly yAxisLabel?: string;
  /** Unique integer UTC candidates; sorted copies retain real time spacing. */
  readonly xTickValues?: readonly number[];
  /** Omit for inline disclosure; external mode requires a real reachable trigger. */
  readonly dataTable?: PharoChartDataTableMode;
  /** Old catch-all aliases are rejected, including forwarding through wider objects. */
  readonly formatX?: never;
  /** Choose the axis/detail/table value formatter explicitly. */
  readonly formatY?: never;
  /** Layout overrides apply to the actual measured container. */
  readonly className?: string;
}

/** @internal Distinguishes malformed data, unsafe arithmetic and unavailable space. */
export type ChartReason = 'PHARO-CHART-DATA' | 'PHARO-CHART-DOMAIN' | 'PHARO-CHART-SIZE';

/** @internal A finite domain value and its projected axis coordinate. */
export interface ChartTick {
  /** Domain value: UTC milliseconds for x, or a plain number for y. */
  readonly value: number;
  /** Finite pixel coordinate in the SVG viewBox. */
  readonly position: number;
}

/** @internal A formatted tick with a bounded presentation budget. */
export interface ChartAxisLabel extends ChartTick {
  /** Complete formatter output retained in the SVG title. */
  readonly label: string;
  /** Compact visible string; observations and the complete label stay unchanged. */
  readonly text: string;
  /** SVG alignment chosen to keep endpoint labels within the measured plot. */
  readonly anchor: 'start' | 'middle' | 'end';
  /** Conservative pixel width used to prevent adjacent x-axis label overlap. */
  readonly width: number;
}

/** @internal A visible marker for an isolated, defined observation. */
export interface ChartMarker {
  /** Finite projected horizontal coordinate. */
  readonly x: number;
  /** Finite projected vertical coordinate. */
  readonly y: number;
  /** The copied recorded observation, rather than an interpolated point. */
  readonly point: PharoChartPoint;
}

/** @internal Chronological copies and validated numerical marks for one series. */
export interface PreparedChartSeries {
  /** Unchanged source series identity. */
  readonly id: string;
  /** Unchanged source series label. */
  readonly label: string;
  /** Copied points in ascending UTC order, including explicit missing values. */
  readonly points: readonly PharoChartPoint[];
  /** Straight segmented D3 path, or null when this series has no defined values. */
  readonly path: string | null;
  /** Markers for each defined segment containing only one observation. */
  readonly markers: readonly ChartMarker[];
}

/** @internal Finite shared geometry ready for React-owned SVG rendering. */
export interface ReadyChartGeometry {
  /** Discriminator identifying validated, renderable geometry. */
  readonly kind: 'ready';
  /** Measured content-box width in pixels. */
  readonly width: number;
  /** Measured content-box height in pixels. */
  readonly height: number;
  /** Deliberate plotting bounds with reserved space for axes and marker radii. */
  readonly plot: {
    /** Left plot coordinate, after the numerical label gutter. */
    readonly left: number;
    /** Top plot coordinate, below the optional axis label. */
    readonly top: number;
    /** Right plot coordinate, before the outer marker margin. */
    readonly right: number;
    /** Bottom plot coordinate, above the x-axis tick and label rows. */
    readonly bottom: number;
  };
  /** Shared increasing UTC domain, padded when only one timestamp is present. */
  readonly xDomain: readonly [number, number];
  /** Shared increasing numerical domain, padded when all values are equal. */
  readonly yDomain: readonly [number, number];
  /** Validated caller UTC candidates, or automatic ticks when candidates are omitted. */
  readonly xTicks: readonly ChartTick[];
  /** Finite numerical ticks with a bounded requested count. */
  readonly yTicks: readonly ChartTick[];
  /** Prepared series in caller series order, using the shared domains. */
  readonly series: readonly PreparedChartSeries[];
}

/** @internal Explicit renderable, empty, invalid or unavailable-space result. */
export type ChartGeometry =
  | ReadyChartGeometry
  | {
      /** No defined observations exist, including an all-null input. */
      readonly kind: 'empty';
      /** Readable no-observations explanation for the named status. */
      readonly message: string;
    }
  | {
      /** Invalid values or insufficient measured plotting space. */
      readonly kind: 'invalid' | 'unmeasured';
      /** Stable diagnostic category without source-data or path disclosure. */
      readonly reason: ChartReason;
      /** Readable explanation for the named unavailable status. */
      readonly message: string;
    };

/** @internal Immutable instance-owned appearance assignments and preferences. */
export interface ChartIdentityState {
  /** Validated ID/appearance signature, or the safe invalid-configuration sentinel. */
  readonly configuration: string;
  /** Latest valid active assignments; retained while a configuration is invalid. */
  readonly active: ReadonlyMap<string, PharoChartAppearance>;
  /** Previous valid preferences for returning IDs when their slots remain free. */
  readonly history: ReadonlyMap<string, PharoChartAppearance>;
  /** Whether the current configuration permits distinct, stable appearances. */
  readonly valid: boolean;
}

/** @internal An exact inspection row with caller-formatted readable output. */
export type ChartInspectionDetail = ChartInspectionRow & {
  /** Complete formatter output, or the explicit unavailable message. */
  readonly display: string;
};

/** @internal Ownership of one potential touch tap, without preventing scrolling. */
export interface ChartTouchGesture {
  /** Pointer identity used to ignore unrelated or cancelled touch events. */
  readonly pointerId: number;
  /** Initial client-space horizontal coordinate. */
  readonly startX: number;
  /** Initial client-space vertical coordinate. */
  readonly startY: number;
  /** A moved or multi-pointer gesture is never committed as a tap. */
  readonly moved: boolean;
}
