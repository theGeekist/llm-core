import {
  loadAgentSkills,
  registerAgentSkill,
  type LocalSkillLoader,
} from "@geekist/llm-core/agent/runtime";
import {
  digest,
  newCoreId,
  type InvocationContext,
  type InvocationId,
} from "@geekist/llm-core/contracts";

declare const loader: LocalSkillLoader;

const invocationContext: InvocationContext = {
  invocationId: newCoreId<InvocationId>("018f0f4e-8c5b-7a91-8c3b-123456789c01"),
};

const pinned = registerAgentSkill({
  skillId: "skill.review",
  scope: "repo",
  digest: digest("a".repeat(64)),
});

const loaded = await loadAgentSkills({
  request: {
    directories: [".agents/skills"],
    disabledSkillIds: [pinned.skillId],
  },
  context: invocationContext,
  loader,
});

console.log(
  pinned.skillId,
  loaded.map((skill) => `${skill.scope}:${skill.skillId}`),
);
