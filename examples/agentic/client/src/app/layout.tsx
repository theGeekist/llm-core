"use client";

import type { FC } from "react";
import { Button } from "../components/ui/button";

export type ConnectButtonProps = {
  providerLabel: string;
  hasToken: boolean;
  requiresToken: boolean;
  onOpen: () => void;
};

const ConnectButton: FC<ConnectButtonProps> = ({
  providerLabel,
  hasToken,
  requiresToken,
  onOpen,
}) => {
  if (!requiresToken) {
    return null;
  }
  return (
    <Button
      variant={hasToken ? "outline" : "default"}
      size="sm"
      onClick={onOpen}
      className="ks-connect-btn"
    >
      {hasToken ? "Manage" : "Connect"} {providerLabel}
    </Button>
  );
};

export const TopBar: FC<{ connect: ConnectButtonProps }> = ({ connect }) => {
  return (
    <div className="ks-topbar">
      <div className="ks-topbar-inner">
        <div className="flex flex-wrap items-center gap-3">
          <img
            src="/llm-core-logo.svg"
            alt="LLM Core"
            className="h-7 w-7 rounded-sm border border-border/60 bg-background p-1"
          />
          <span className="font-semibold text-foreground">@geekist/llm-core</span>
          <span className="text-[11px] uppercase tracking-[0.2em]">Geekist</span>
        </div>
        <div className="ks-topbar-actions">
          <LinkBar />
          <ConnectButton
            providerLabel={connect.providerLabel}
            hasToken={connect.hasToken}
            requiresToken={connect.requiresToken}
            onOpen={connect.onOpen}
          />
        </div>
      </div>
    </div>
  );
};

export const Footer: FC = () => {
  return (
    <footer className="ks-footer">
      <div className="ks-footer-inner">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-foreground">LLM Core</span>
          <span>@geekist/llm-core</span>
          <span className="text-[11px] uppercase tracking-[0.2em]">Geekist</span>
        </div>
        <LinkBar />
      </div>
    </footer>
  );
};

const LINKS = [
  {
    href: "https://llm-core.geekist.co",
    label: "Docs",
    emphasis: true,
  },
  {
    href: "https://github.com/theGeekist/llm-core",
    label: "GitHub",
    emphasis: false,
  },
  {
    href: "https://www.npmjs.com/package/@geekist/llm-core",
    label: "npm",
    emphasis: false,
  },
  {
    href: "https://geekist.co",
    label: "geekist.co",
    emphasis: false,
  },
] as const;

const LinkBar: FC = () => {
  return <div className="ks-link-bar">{LINKS.map(renderLinkItem)}</div>;
};

const renderLinkItem = (link: (typeof LINKS)[number]) => (
  <a
    key={link.href}
    href={link.href}
    className={link.emphasis ? "ks-link ks-link-primary" : "ks-link"}
    target="_blank"
    rel="noreferrer"
  >
    {link.label}
  </a>
);
