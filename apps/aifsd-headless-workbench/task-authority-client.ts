import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  taskAuthorityServiceClientContractVersion,
  validateTaskAuthorityServiceReservationIdentity,
  type TaskAuthorityServiceClientV2,
} from "@geekist/task-graph-authority-compat/task-authority";

const isClient = (value: unknown): value is TaskAuthorityServiceClientV2 =>
  value !== null &&
  typeof value === "object" &&
  (value as { clientContractVersion?: unknown }).clientContractVersion ===
    taskAuthorityServiceClientContractVersion &&
  typeof (value as { execute?: unknown }).execute === "function" &&
  typeof (value as { getAuthorityHead?: unknown }).getAuthorityHead === "function" &&
  typeof (value as { getReceipt?: unknown }).getReceipt === "function" &&
  typeof (value as { inspect?: unknown }).inspect === "function" &&
  (value as { projectRegistration?: unknown }).projectRegistration !== undefined &&
  (value as { authenticatedClient?: unknown }).authenticatedClient !== undefined &&
  (value as { reservationIdentity?: unknown }).reservationIdentity !== undefined;

/** Load a host-composed authenticated client. Credentials remain in the module's transport session. */
export const loadTaskAuthorityClient = async (
  modulePath: string,
): Promise<TaskAuthorityServiceClientV2> => {
  const loaded = (await import(pathToFileURL(resolve(modulePath)).href)) as {
    readonly default?: unknown;
    readonly taskAuthorityClient?: unknown;
  };
  const client = loaded.taskAuthorityClient ?? loaded.default;
  if (!isClient(client)) {
    throw new TypeError("The Task Graph authority module must export a reservation-bound client");
  }
  validateTaskAuthorityServiceReservationIdentity(client.reservationIdentity);
  return client;
};
