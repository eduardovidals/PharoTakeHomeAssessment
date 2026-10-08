/** A recorded UTC epoch-millisecond observation; null explicitly means missing. */
export interface PharoChartPoint {
  /** Integer UTC epoch milliseconds within JavaScript's valid Date range. */
  readonly x: number;
  /** A finite numerical observation, or null to break the line at missing data. */
  readonly y: number | null;
}

/** Three semantic color and dash identities, independent of array order. */
export type PharoChartAppearance = 'primary' | 'secondary' | 'tertiary';

/** Generic observations with a stable, nonblank identifier and readable label. */
export interface PharoChartSeries {
  /** Nonblank exact identity retained across additions, removals and reordering. */
  readonly id: string;
  /** Nonblank, human-readable description of this series. */
  readonly label: string;
  /** Readonly observations; the chart sorts a copy and rejects duplicate times. */
  readonly points: readonly PharoChartPoint[];
  /** Optional explicit identity; active series must have distinct appearances. */
  readonly appearance?: PharoChartAppearance;
}

/** Responsive SVG comparison with recorded-point inspection and a full data table. */
export interface PharoLineChartProps {
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
  /** Formats UTC timestamps; identical tick labels retain their first coordinate. */
  readonly formatX?: (timestamp: number) => string;
  /** Optional short axis formatter; details and table retain formatX during migration. */
  readonly formatXAxis?: (timestamp: number) => string;
  /** Unique integer UTC candidates; sorted copies in the data domain retain real time spacing. */
  readonly xTickValues?: readonly number[];
  /** Formats numeric values; defaults to plain numbers without currency. */
  readonly formatY?: (value: number) => string;
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

/** @internal One series' exact value, explicit missing record or absent record. */
export type ChartInspectionRow = {
  /** Exact series identity associated with this observation. */
  readonly id: string;
  /** Full series label used in details and accessible value text. */
  readonly label: string;
} & (
  | {
      /** A defined observation exists at the inspected timestamp. */
      readonly kind: 'available';
      /** Unrounded recorded value, never an interpolated estimate. */
      readonly value: number;
    }
  | {
      /** Distinguishes an explicit null from a date absent in this series. */
      readonly kind: 'missing' | 'absent';
      /** Null means unavailable and must never be formatted as zero. */
      readonly value: null;
    }
);

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
