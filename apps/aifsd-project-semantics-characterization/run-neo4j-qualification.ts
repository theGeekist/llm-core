import neo4j from "neo4j-driver";

const image = "neo4j:5.26.28";
const password = `aifsd-${crypto.randomUUID()}`;
const container = `aifsd-neo4j-${process.pid}-${Date.now()}`;
let qualificationExitCode = 0;

const run = async (...args: string[]): Promise<string> => {
  const process = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(stderr || stdout);
  return stdout.trim();
};

const waitForNeo4j = async (uri: string): Promise<void> => {
  const driver = neo4j.driver(uri, neo4j.auth.basic("neo4j", password));
  try {
    for (let attempt = 0; attempt < 360; attempt += 1) {
      try {
        await driver.verifyConnectivity();
        return;
      } catch {
        await Bun.sleep(500);
      }
    }
    throw new Error("Neo4j did not become ready within 180 seconds");
  } finally {
    await driver.close();
  }
};

try {
  await run(
    "run",
    "--detach",
    "--rm",
    "--name",
    container,
    "--env",
    `NEO4J_AUTH=neo4j/${password}`,
    "--publish",
    "127.0.0.1::7687",
    image,
  );
  const port = (await run("port", container, "7687/tcp")).split(":").at(-1);
  if (port === undefined) throw new Error("Docker did not publish the Neo4j Bolt port");
  const uri = `bolt://127.0.0.1:${port}`;
  try {
    await waitForNeo4j(uri);
  } catch (error) {
    const logs = await run("logs", container);
    throw new Error(`${String(error)}\n${logs}`);
  }
  const qualification = Bun.spawn(["bun", "test", "neo4j-qualification.test.ts"], {
    cwd: import.meta.dir,
    env: {
      ...process.env,
      AIFSD_NEO4J_URI: uri,
      AIFSD_NEO4J_PASSWORD: password,
    },
    stdout: "inherit",
    stderr: "inherit",
  });
  qualificationExitCode = await qualification.exited;
} finally {
  try {
    await run("stop", container);
  } catch {
    // The container may already have exited and removed itself.
  }
}

if (qualificationExitCode !== 0) process.exitCode = qualificationExitCode;
