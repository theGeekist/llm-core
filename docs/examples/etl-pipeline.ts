import { createHelper, createPipelineRollback, makePipeline } from "@wpkernel/pipeline";
import type { Helper } from "@wpkernel/pipeline";
import type {
  EtlContext,
  EtlHelperKind,
  EtlPipelineState,
  EtlRunOptions,
  EtlStageDeps,
  EtlState,
  ExtractedOrder,
  LoadedOrder,
  Reporter,
  TransformedOrder,
} from "./etl-types";

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
    const flagUnused = (kind: EtlHelperKind) => (state: EtlPipelineState, visited: Set<string>) => {
      const ordered = state.helperOrders?.get(kind) ?? [];
      for (const entry of ordered) {
        if (visited.has(entry.id)) {
          continue;
        }
        stageDeps.diagnosticManager.flagUnusedHelper(
          entry.helper,
          kind,
          "was registered but never executed",
          entry.helper.dependsOn ?? [],
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
  helper: Helper<EtlContext, TInput, TOutput, Reporter, TKind>,
) => {
  pipeline.use(helper as Helper<EtlContext, unknown, unknown, Reporter, EtlHelperKind>);
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
          },
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
          },
        ),
      };
    },
  }),
];

const createNormaliseAndPriceHelper = (mode: "extend" | "override", origin: string) =>
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
      const transformed = input.map((item) => {
        const sku = item.sku.toUpperCase();
        const email = item.customerEmail.trim().toLowerCase();
        const product = context.catalogue[sku];
        const unitPrice = product?.unitPrice ?? 0;
        return {
          ...item,
          sku,
          email,
          unitPrice,
          subtotal: item.qty * unitPrice,
        };
      });

      output.push(...transformed);

      return {
        rollback: createPipelineRollback(
          () => {
            output.splice(start);
          },
          {
            key: KEY_NORMALISE_AND_PRICE,
            label: "Remove transformed orders",
          },
        ),
      };
    },
  });

const createLoadHelpers = () => [
  createHelper<EtlContext, TransformedOrder[], LoadedOrder[], Reporter, "load">({
    key: KEY_COMMIT_LOAD,
    kind: "load",
    mode: "extend",
    apply: ({ context, reporter, input, output }) => {
      const start = output.length;
      const destination = context.destination;
      const beforeInventory = { ...destination.inventory };

      const loaded = input.map((item) => ({
        orderId: item.orderId,
        customerEmail: item.email,
        sku: item.sku,
        qty: item.qty,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        loadedAt: new Date().toISOString(),
      }));

      for (const order of loaded) {
        const current = destination.inventory[order.sku] ?? 0;
        destination.inventory[order.sku] = current - order.qty;
      }

      destination.orders.push(...loaded);
      output.push(...loaded);

      if (context.simulateFailure) {
        reporter.warn?.("Simulating load failure");
        throw new Error("Load failed");
      }

      return {
        rollback: createPipelineRollback(
          () => {
            output.splice(start);
            destination.orders.splice(start);
            destination.inventory = { ...beforeInventory };
          },
          {
            key: KEY_COMMIT_LOAD,
            label: "Rollback load commit",
          },
        ),
      };
    },
  }),
];

createExtractHelpers().forEach(registerHelper);
registerHelper(createNormaliseAndPriceHelper("extend", "core"));
createLoadHelpers().forEach(registerHelper);

export const runPipeline = (options: EtlRunOptions) => pipeline.run(options);
