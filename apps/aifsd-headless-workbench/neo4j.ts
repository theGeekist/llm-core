import neo4j, { type Driver, type ManagedTransaction, type QueryResult } from "neo4j-driver";
import {
  createNeo4jProjectProjectionAdapter,
  type Neo4jProjectionAdapter,
  type Neo4jQueryPort,
  type Neo4jRecord,
} from "../../packages/aifsd/src/integrations/neo4j/public.js";

export interface HeadlessWorkbenchNeo4jOptions {
  readonly database?: string;
  readonly password: string;
  readonly uri: string;
  readonly username: string;
}

export interface HeadlessWorkbenchNeo4j {
  readonly close: () => Promise<void>;
  readonly projection: Neo4jProjectionAdapter;
}

const records = (result: QueryResult): readonly Neo4jRecord[] =>
  result.records.map((record) => record.toObject());

const queryIn = async (
  transaction: ManagedTransaction,
  cypher: string,
  parameters: Readonly<Record<string, unknown>>,
): Promise<readonly Neo4jRecord[]> => records(await transaction.run(cypher, parameters));

const portFor = (driver: Driver, database: string): Neo4jQueryPort => ({
  query: async (cypher, parameters) => {
    const session = driver.session({ database });
    try {
      return records(await session.run(cypher, parameters));
    } finally {
      await session.close();
    }
  },
  transaction: async (work) => {
    const session = driver.session({ database });
    try {
      return await session.executeWrite((transaction) =>
        work({ query: (cypher, parameters) => queryIn(transaction, cypher, parameters) }),
      );
    } finally {
      await session.close();
    }
  },
});

export const createHeadlessWorkbenchNeo4j = async (
  options: HeadlessWorkbenchNeo4jOptions,
): Promise<HeadlessWorkbenchNeo4j> => {
  const driver = neo4j.driver(options.uri, neo4j.auth.basic(options.username, options.password), {
    disableLosslessIntegers: true,
  });
  await driver.verifyConnectivity();
  return {
    close: () => driver.close(),
    projection: createNeo4jProjectProjectionAdapter(portFor(driver, options.database ?? "neo4j")),
  };
};
