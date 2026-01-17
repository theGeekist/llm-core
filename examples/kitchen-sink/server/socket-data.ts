export type SocketData = {
  socketId: string;
  tokens: Record<string, string>;
};

export const createSocketData = (): SocketData => ({
  socketId: crypto.randomUUID(),
  tokens: {},
});

export const setSocketToken = (data: SocketData, providerId: string, token: string) => {
  data.tokens[providerId] = token;
  return true;
};

export const readSocketToken = (data: SocketData, providerId: string) =>
  data.tokens[providerId] ?? null;
