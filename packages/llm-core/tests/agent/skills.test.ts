import { describe, expect, test } from "bun:test";
import { contractVersion, digest, newCoreId, type InvocationId } from "#contracts";
import {
  loadAgentSkills,
  registerAgentSkill,
  type AgentSkillRef,
  type LocalSkillCandidate,
} from "../../src/features/agent/public";
import { prepareWithLocalRunner } from "./local-runner-preparation";

const SKILL: AgentSkillRef = registerAgentSkill({
  skillId: "skill:review",
  scope: "repo",
  digest: digest("a".repeat(64)),
});
const CONTEXT = {
  invocationId: newCoreId<InvocationId>("018f0f4e-8c5b-7a91-8c3b-123456789d41"),
};

describe("portable agent skills", () => {
  test("keeps local paths outside portable skill identity", async () => {
    const candidate: LocalSkillCandidate = {
      ...SKILL,
      localPath: "/Users/example/private/repo/SKILL.md",
    };
    const skills = await loadAgentSkills({
      request: { directories: ["/Users/example/private/repo"] },
      context: CONTEXT,
      loader: { load: () => [candidate] },
    });
    expect(skills).toEqual([SKILL]);
    expect(JSON.stringify(skills)).not.toContain("/Users/example");
    expect(() => registerAgentSkill(candidate)).toThrow("closed portable");
  });

  test("isolates portable skills from loader and caller mutation", async () => {
    const candidate: LocalSkillCandidate = {
      ...SKILL,
      localPath: "/workspace/skills/skill",
    };
    const request = { directories: ["/workspace/skills"] };
    let receivedContext: typeof CONTEXT | undefined;
    const skills = await loadAgentSkills({
      request,
      context: { ...CONTEXT },
      loader: {
        load: ({ request: received, context }) => {
          receivedContext = context;
          (received.directories as string[])[0] = "/credential/path";
          return [candidate];
        },
      },
    });
    (candidate as { localPath: string }).localPath = "/mutated";
    expect(skills).toEqual([SKILL]);
    expect(request.directories).toEqual(["/workspace/skills"]);
    expect(receivedContext).toEqual(CONTEXT);
    expect(Object.isFrozen(skills[0])).toBe(true);
  });

  test("embeds only registered skill identity in prepared agent specs", () => {
    const spec = prepareWithLocalRunner({
      agentId: "agent:skills",
      version: contractVersion("2.0.0"),
      instructions: "Use the selected skills.",
      effectRequirement: "read-only",
      skills: [SKILL],
    });
    expect(spec.skills).toEqual([SKILL]);
    expect(JSON.stringify(spec)).not.toContain("path");
    expect(() =>
      prepareWithLocalRunner({
        ...spec,
        skills: [
          {
            ...SKILL,
            digest: { algorithm: "sha-256", value: "bad" },
          },
        ] as never,
      }),
    ).toThrow("SHA-256");

    expect(() =>
      prepareWithLocalRunner({
        agentId: "agent:skills",
        version: contractVersion("2.0.0"),
        instructions: "Use unique skills.",
        effectRequirement: "read-only",
        skills: [SKILL, SKILL],
      }),
    ).toThrow("unique");

    for (const metadata of [
      { nested: { localPath: "/workspace/private" } },
      { nested: { locator: "https://placeholder.invalid/resource" } },
      { nested: { value: "/workspace/private" } },
      { nested: { myLocalPathValue: "placeholder" } },
      { nested: { resourceLocatorValue: "placeholder" } },
      { nested: { callbackUrlValue: "placeholder" } },
      { nested: { "my_LOCAL-path_Value": "placeholder" } },
      { nested: { "resource-LOCATOR_value": "placeholder" } },
      { nested: { callback_URL_value: "placeholder" } },
    ]) {
      expect(() =>
        prepareWithLocalRunner({
          agentId: "agent:skills",
          version: contractVersion("2.0.0"),
          instructions: "Reject physical locators.",
          effectRequirement: "read-only",
          metadata: metadata as never,
        }),
      ).toThrow("portable");
    }
  });

  test("rejects duplicate loader identities", async () => {
    expect(() =>
      loadAgentSkills({
        request: { directories: ["/skills"] },
        context: CONTEXT,
        loader: {
          load: () => [
            { ...SKILL, localPath: "/skills/a" },
            {
              ...SKILL,
              digest: digest("b".repeat(64)),
              localPath: "/skills/b",
            },
          ],
        },
      }),
    ).toThrow("duplicate portable identities");
  });

  test("rejects blank and undeclared local candidate fields", () => {
    expect(() =>
      loadAgentSkills({
        request: { directories: ["/skills"] },
        context: CONTEXT,
        loader: { load: () => [{ ...SKILL, localPath: " " }] },
      }),
    ).toThrow("nonblank path");
    expect(() =>
      loadAgentSkills({
        request: { directories: ["/skills"] },
        context: CONTEXT,
        loader: {
          load: () => [{ ...SKILL, localPath: "/skills/a", credential: "secret" }] as never,
        },
      }),
    ).toThrow("closed candidate");
  });

  test("enforces disabled skill IDs when the loader ignores them", async () => {
    const enabled = registerAgentSkill({
      skillId: "skill:enabled",
      scope: "repo",
      digest: digest("b".repeat(64)),
    });
    expect(
      await loadAgentSkills({
        request: {
          directories: ["/workspace/skills"],
          disabledSkillIds: [SKILL.skillId],
        },
        context: CONTEXT,
        loader: {
          load: () => [
            { ...SKILL, localPath: "/workspace/skills/disabled" },
            { ...enabled, localPath: "/workspace/skills/enabled" },
          ],
        },
      }),
    ).toEqual([enabled]);
  });
});
