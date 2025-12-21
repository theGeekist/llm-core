import { makePipeline, createPipelineRollback, createHelper } from "@wpkernel/pipeline";
import type {
  Reporter,
  EtlRunOptions,
  EtlContext,
  ExtractedOrder,
  TransformedOrder,
  LoadedOrder,
  EtlState,
  EtlStageDeps,
  EtlHelperKind,
  EtlPipelineState,
} from "./types";
import type { Helper } from "@wpkernel/pipeline";

const pipeline = makePipeline<EtlRunOptions, EtlContext, Reporter, EtlState>({
  helperKinds: ["extract", "transform", "load"],
  createContext: (options: EtlRunOptions): EtlContext => ({
    reporter: options.reporter ?? {
      warn: (message, context) => console.warn(message, context),
    },
    source: options.source,
    destination: options.destination,
    catalogue: options.catalogue,
    simulateFailure: options.simulateFailure ?? false,
  }),
  createState: (): EtlState => ({
    extracted: [],
    transformed: [],
    loaded: [],
  }),
  createStages: (deps) => {
    const stageDeps = deps as EtlStageDeps;
    const flagUnused = (kind: EtlHelperKind) => (
      state: EtlPipelineState,
      visited: Set<string>
    ) => {
      const ordered = state.helperOrders?.get(kind) ?? [];
      for (const entry of ordered) {
        if (visited.has(entry.id)) {
          continue;
        }
        stageDeps.diagnosticManager.flagUnusedHelper(
          entry.helper,
          kind,
          "was registered but never executed",
          entry.helper.dependsOn ?? []
        );
      }
      return state;
    };
    return [
      stageDeps.makeHelperStage("extract", {
        makeArgs: (state) => () => ({
          context: state.context,
          reporter: state.reporter,
          input: state.context.source,
          output: state.userState.extracted,
        }),
        onVisited: flagUnused("extract"),
      }),
      stageDeps.makeHelperStage("transform", {
        makeArgs: (state) => () => ({
          context: state.context,
          reporter: state.reporter,
          input: state.userState.extracted,
          output: state.userState.transformed,
        }),
        onVisited: flagUnused("transform"),
      }),
      stageDeps.makeHelperStage("load", {
        makeArgs: (state) => () => ({
          context: state.context,
          reporter: state.reporter,
          input: state.userState.transformed,
          output: state.userState.loaded,
        }),
        onVisited: flagUnused("load"),
      }),
      stageDeps.finalizeResult,
    ];
  },
});

const registerHelper = <TInput, TOutput, TKind extends EtlHelperKind>(
  helper: Helper<EtlContext, TInput, TOutput, Reporter, TKind>
) => {
  pipeline.use(
    helper as Helper<EtlContext, unknown, unknown, Reporter, EtlHelperKind>
  );
};

const KEY_PARSE_ORDER_LINES = "parse-order-lines";
const KEY_NORMALISE_AND_PRICE = "normalise-and-price";
const KEY_COMMIT_LOAD = "commit-load";

const createExtractHelpers = () => [
  createHelper<EtlContext, string[], ExtractedOrder[], Reporter, "extract">({
    key: "extract-middleware",
    kind: "extract",
    mode: "extend",
    priority: 1000,
    apply: async ({ reporter }, next) => {
      reporter.warn?.("Extract middleware start");
      await next?.();
      reporter.warn?.("Extract middleware end");
    },
  }),
  createHelper<EtlContext, string[], ExtractedOrder[], Reporter, "extract">({
    key: KEY_PARSE_ORDER_LINES,
    kind: "extract",
    mode: "extend",
    apply: async ({ reporter, input, output }) => {
      await Promise.resolve();

      const start = output.length;
      const extracted: ExtractedOrder[] = [];

      for (let i = 0; i < input.length; i++) {
        const raw = input[i] as string;
        const lineNo = i + 1;

        const trimmed = raw.trim();
        if (trimmed.length === 0) {
          reporter.warn?.("Skipping blank order line", { line: lineNo });
          continue;
        }

        const parts = trimmed.split(",").map((p) => p.trim());
        if (parts.length !== 4) {
          reporter.warn?.("Skipping malformed order line (expected 4 columns)", {
            line: lineNo,
            raw,
            parts,
          });
          continue;
        }

        const [orderId, customerEmail, sku, qtyRaw] = parts;
        const qty = Number(qtyRaw);

        if (!orderId || !customerEmail || !sku || !Number.isFinite(qty)) {
          reporter.warn?.("Skipping invalid order line (missing fields)", {
            line: lineNo,
            raw,
          });
          continue;
        }

        extracted.push({
          line: lineNo,
          orderId,
          customerEmail,
          sku,
          qty,
          raw,
        });
      }

      output.push(...extracted);

      return {
        rollback: createPipelineRollback(
          () => {
            output.splice(start);
          },
          {
            key: KEY_PARSE_ORDER_LINES,
            label: "Remove extracted orders",
          }
        ),
      };
    },
  }),

  createHelper<EtlContext, string[], ExtractedOrder[], Reporter, "extract">({
    key: "reject-nonpositive-qty",
    kind: "extract",
    mode: "extend",
    dependsOn: [KEY_PARSE_ORDER_LINES],
    apply: ({ reporter, output }) => {
      const before = output.slice();
      const filtered = output.filter((o) => {
        if (o.qty <= 0) {
          reporter.warn?.("Dropping order with non-positive qty", {
            line: o.line,
            orderId: o.orderId,
            qty: o.qty,
          });
          return false;
        }
        return true;
      });

      output.length = 0;
      output.push(...filtered);

      return {
        rollback: createPipelineRollback(
          () => {
            output.length = 0;
            output.push(...before);
          },
          {
            key: "reject-nonpositive-qty",
            label: "Restore pre-filter extracted orders",
          }
        ),
      };
    },
  }),
];

const createNormaliseAndPriceHelper = (
  mode: "extend" | "override",
  origin: string
) =>
  createHelper<EtlContext, ExtractedOrder[], TransformedOrder[], Reporter, "transform">({
    key: KEY_NORMALISE_AND_PRICE,
    kind: "transform",
    mode,
    origin,
    apply: ({ context, reporter, input, output }) => {
      if (mode === "override") {
        reporter.warn?.("Override helper active for normalise-and-price", {
          origin,
        });
      }

      const start = output.length;
      const transformed: TransformedOrder[] = [];

      for (const record of input) {
        const email = record.customerEmail.trim().toLowerCase();
        const sku = record.sku.trim().toUpperCase();

        const product = context.catalogue[sku];
        if (!product) {
          reporter.warn?.("Unknown SKU; dropping order", {
            line: record.line,
            orderId: record.orderId,
            sku,
          });
          continue;
        }

        const unitPrice = product.unitPrice;
        const subtotal = unitPrice * record.qty;

        transformed.push({
          ...record,
          customerEmail: record.customerEmail,
          email,
          sku,
          unitPrice,
          subtotal,
        });
      }

      output.push(...transformed);

      return {
        rollback: createPipelineRollback(
          () => {
            output.splice(start);
          },
          {
            key: KEY_NORMALISE_AND_PRICE,
            label: "Remove transformed orders",
          }
        ),
      };
    },
  });

const createTransformHelpers = () => [
  createNormaliseAndPriceHelper("extend", "baseline-transform"),
  createNormaliseAndPriceHelper("override", "override-transform"),
  createHelper<EtlContext, ExtractedOrder[], TransformedOrder[], Reporter, "transform">({
    key: "dedupe-orders",
    kind: "transform",
    mode: "extend",
    dependsOn: [KEY_NORMALISE_AND_PRICE],
    apply: ({ output }) => {
      // Keep the last occurrence per orderId (later lines win)
      const before = output.slice();
      const byId = new Map<string, TransformedOrder>();
      for (const rec of output) {
        byId.set(rec.orderId, rec);
      }

      const deduped = Array.from(byId.values()).sort((a, b) => a.line - b.line);
      output.length = 0;
      output.push(...deduped);

      return {
        rollback: createPipelineRollback(
          () => {
            output.length = 0;
            output.push(...before);
          },
          {
            key: "dedupe-orders",
            label: "Restore pre-dedupe transformed orders",
          }
        ),
      };
    },
  }),
];

const createLoadHelpers = () => [
  createHelper<EtlContext, TransformedOrder[], LoadedOrder[], Reporter, "load">({
    key: "validate-load",
    kind: "load",
    mode: "extend",
    apply: ({ context, input }) => {
      if (input.length === 0) {
        throw new Error("No transformed orders to load.");
      }

      // Pre-flight: ensure inventory is sufficient for all SKUs.
      const required = new Map<string, number>();
      for (const rec of input) {
        required.set(rec.sku, (required.get(rec.sku) ?? 0) + rec.qty);
      }

      for (const [sku, qty] of required.entries()) {
        const have = context.destination.inventory[sku] ?? 0;
        if (have < qty) {
          throw new Error(
            `Insufficient inventory for ${sku}: need ${qty}, have ${have}`
          );
        }
      }
    },
  }),

  createHelper<EtlContext, TransformedOrder[], LoadedOrder[], Reporter, "load">({
    key: KEY_COMMIT_LOAD,
    kind: "load",
    mode: "extend",
    dependsOn: ["validate-load"],
    apply: async ({ context, input, output }) => {
      await Promise.resolve();

      const db = context.destination;
      const ordersStart = db.orders.length;
      const outputStart = output.length;

      // Snapshot inventory deltas so rollback is clean even if multiple SKUs.
      const inventoryBefore: Record<string, number> = {};
      for (const rec of input) {
        if (!(rec.sku in inventoryBefore)) {
          inventoryBefore[rec.sku] = db.inventory[rec.sku] ?? 0;
        }
      }

      const loaded: LoadedOrder[] = input.map((rec) => ({
        orderId: rec.orderId,
        customerEmail: rec.email,
        sku: rec.sku,
        qty: rec.qty,
        unitPrice: rec.unitPrice,
        subtotal: rec.subtotal,
        loadedAt: new Date().toISOString(),
      }));

      // Apply side effects: persist orders, decrement inventory.
      db.orders.push(...loaded);
      for (const rec of input) {
        db.inventory[rec.sku] = (db.inventory[rec.sku] ?? 0) - rec.qty;
      }

      output.push(...loaded);

      return {
        rollback: createPipelineRollback(
          () => {
            db.orders.splice(ordersStart);
            output.splice(outputStart);
            for (const [sku, prior] of Object.entries(inventoryBefore)) {
              db.inventory[sku] = prior;
            }
          },
          {
            key: KEY_COMMIT_LOAD,
            label: "Undo order commit and restore inventory",
          }
        ),
      };
    },
  }),

  createHelper<EtlContext, TransformedOrder[], LoadedOrder[], Reporter, "load">({
    key: "finalize-load",
    kind: "load",
    mode: "extend",
    dependsOn: [KEY_COMMIT_LOAD],
    apply: ({ context }) => {
      if (context.simulateFailure) {
        throw new Error("Simulated failure after commit (should rollback).");
      }
    },
  }),
];

const registerHelpers = () => {
  for (const helper of createExtractHelpers()) {
    registerHelper(helper);
  }
  for (const helper of createTransformHelpers()) {
    registerHelper(helper);
  }
  for (const helper of createLoadHelpers()) {
    registerHelper(helper);
  }
};

registerHelpers();

const source = [
  "ORD-1001, alice@example.com, sku-chair, 2",
  "ORD-1002, bob@example.com, SKU-DESK, 1",
  "ORD-1002,  bob@example.com , sku-desk, 3", // duplicate orderId: last wins
  "ORD-1003, carol@example.com, SKU-UNKNOWN, 1", // unknown SKU -> warn/drop
  "ORD-1004, dave@example.com, SKU-CHAIR, -1", // invalid qty -> warn/drop
  "", // blank line -> warn/drop
  "not,a,valid,row", // malformed -> warn/drop
];

const catalogue = {
  "SKU-CHAIR": { sku: "SKU-CHAIR", name: "Chair", unitPrice: 4999 },
  "SKU-DESK": { sku: "SKU-DESK", name: "Desk", unitPrice: 12999 },
};

const destination = {
  orders: [],
  inventory: {
    "SKU-CHAIR": 10,
    "SKU-DESK": 5,
  },
};

const result = await pipeline.run({
  source,
  destination,
  catalogue,
  // Set to true to trigger rollback behaviour *after* commit.
  simulateFailure: false,
});

console.log("Extracted:", result.artifact.extracted);
console.log("Transformed:", result.artifact.transformed);
console.log("Loaded:", result.artifact.loaded);
const stepKeys = result.steps.map((step) => {
  const record = step as unknown as Record<string, unknown>;
  if ("helper" in record) {
    const helper = record.helper as { key?: string } | undefined;
    return helper?.key;
  }
  if ("key" in record) {
    return record.key as string | undefined;
  }
  return undefined;
});
console.log("Steps:", stepKeys);
console.log("Diagnostics:", result.diagnostics);
console.log("DB Orders:", destination.orders);
console.log("DB Inventory:", destination.inventory);
