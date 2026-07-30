# Agent skills

Agent skills are portable identities resolved from explicitly selected local
directories. `/agent` exports `AgentSkillRef`, `SkillScope`,
`registerAgentSkill`, `loadAgentSkills`, and the live loader contracts.

<<< @/snippets/v2/agent-skills.ts

## Portable identity, local discovery

An `AgentSkillRef` contains only:

| Field     | Meaning                                        |
| --------- | ---------------------------------------------- |
| `skillId` | Opaque skill identity                          |
| `scope`   | `admin`, `repo`, `system`, or `user`           |
| `digest`  | SHA-256 identity of the selected skill content |

`LocalSkillCandidate` also carries a `localPath`, but that path is live host
input. `loadAgentSkills` strips it before returning portable skill references.
Paths never enter an `AgentSpec`, snapshot, checkpoint, event, or receipt.

## Loading and scope

The composition root supplies the ordered directory list and a
`LocalSkillLoader`. The loader discovers candidates; llm-core validates their
closed shape, removes disabled IDs, rejects duplicate `scope:skillId`
identities, and returns frozen portable references.

Scope is part of identity and precedence policy, not filesystem authority.
Applications decide how `admin`, `repo`, `system`, and `user` sources are
located and ordered. A loader must not infer extra directories or treat a
portable skill reference as permission to read a path.

## Security boundary

- Pin content with the declared SHA-256 digest.
- Keep directory access and file reads inside the trusted loader.
- Reject blank paths, undeclared fields, duplicate identities, and disabled
  skills before preparation.
- Place only registered portable references in `AgentSpec.skills`.

Skill loading discovers and registers instructions. It does not grant tool,
credential, network, or execution authority.
