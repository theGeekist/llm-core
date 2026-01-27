"use client";

import type { FC, ChangeEvent } from "react";
import { readProviderOption, type ProviderId } from "../demo-options";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";

type ProviderConnectDialogProps = {
  providerId: ProviderId;
  open: boolean;
  token: string;
  onOpenChange: (open: boolean) => void;
  onTokenChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSave: () => void;
  onClear: () => void;
};

const buildTokenInputId = (providerId: ProviderId) => `${providerId}-token`;

export const ProviderConnectDialog: FC<ProviderConnectDialogProps> = ({
  providerId,
  open,
  token,
  onOpenChange,
  onTokenChange,
  onSave,
  onClear,
}) => {
  const provider = readProviderOption(providerId);
  const label = provider.label;
  const authUrl = provider.authUrl;
  const tokenInputId = buildTokenInputId(providerId);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect {label}</DialogTitle>
          <DialogDescription>
            Store tokens in session storage and send them to the server per socket.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label
              htmlFor={tokenInputId}
              className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
            >
              {label} API token
            </label>
            {authUrl ? (
              <a
                href={authUrl}
                className="text-xs font-semibold text-primary hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                Get a {label} API key
              </a>
            ) : null}
          </div>
          <input
            id={tokenInputId}
            type="password"
            value={token}
            onChange={onTokenChange}
            placeholder={provider.tokenPlaceholder}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClear}>
            Clear
          </Button>
          <Button onClick={onSave}>Save Token</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
