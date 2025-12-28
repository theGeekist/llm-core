export type Reporter = {
  warn?: (message: string, context?: unknown) => void;
};

// --- Domain: tiny in-memory "orders" ETL ---

export type Product = {
  sku: string;
  name: string;
  unitPrice: number; // cents
};

export type ProductCatalogue = Record<string, Product>;

export type InMemoryDb = {
  orders: LoadedOrder[];
  inventory: Record<string, number>; // sku -> remaining
};

export type EtlRunOptions = {
  /**
   * Each source entry is a CSV-like line:
   *   orderId,customerEmail,sku,qty
   * Example:
   *   ORD-1001,alice@example.com,SKU-CHAIR,2
   */
  source: string[];
  destination: InMemoryDb;
  catalogue: ProductCatalogue;
  reporter?: Reporter;
  simulateFailure?: boolean;
};

export type EtlContext = {
  reporter: Reporter;
  source: string[];
  destination: InMemoryDb;
  catalogue: ProductCatalogue;
  simulateFailure: boolean;
};

export type ExtractedOrder = {
  line: number;
  orderId: string;
  customerEmail: string;
  sku: string;
  qty: number;
  raw: string;
};

export type TransformedOrder = ExtractedOrder & {
  email: string; // normalised
  sku: string; // normalised
  unitPrice: number; // cents
  subtotal: number; // cents
};

export type LoadedOrder = {
  orderId: string;
  customerEmail: string;
  sku: string;
  qty: number;
  unitPrice: number;
  subtotal: number;
  loadedAt: string;
};

export type EtlState = {
  extracted: ExtractedOrder[];
  transformed: TransformedOrder[];
  loaded: LoadedOrder[];
};

export type EtlHelperKind = "extract" | "transform" | "load";

export type EtlHelperOrderEntry = {
  id: string;
  helper: {
    key: string;
    dependsOn: readonly string[];
    origin?: string;
    mode?: string;
    priority?: number;
  };
};

export type EtlPipelineState = {
  context: EtlContext;
  reporter: Reporter;
  runOptions: EtlRunOptions;
  userState: EtlState;
  helperOrders?: Map<string, EtlHelperOrderEntry[]>;
} & Record<string, unknown>;

export type EtlHelperArgs<TInput, TOutput> = {
  context: EtlContext;
  reporter: Reporter;
  input: TInput;
  output: TOutput;
};

export type EtlStageDeps = {
  makeHelperStage: (
    kind: EtlHelperKind,
    spec: {
      makeArgs: (state: EtlPipelineState) => (entry: unknown) => EtlHelperArgs<unknown, unknown>;
      onVisited: (state: EtlPipelineState, visited: Set<string>) => EtlPipelineState;
    },
  ) => unknown;
  diagnosticManager: {
    flagUnusedHelper: (
      helper: EtlHelperOrderEntry["helper"],
      kind: string,
      reason: string,
      dependsOn: readonly string[],
    ) => void;
  };
  finalizeResult: unknown;
};
