// References: docs/implementation-plan.md#L47-L49,L124-L132; docs/workflow-notes.md

export const createContractView = <T>(contract: T) => () => contract;
