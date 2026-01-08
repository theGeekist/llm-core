export type PipelineArtefactInput<T> = {
  readonly artifact: T;
};

export const readPipelineArtefact = <T>(input: PipelineArtefactInput<T>) => input.artifact;
