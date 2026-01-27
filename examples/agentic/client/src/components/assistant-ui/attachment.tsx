import { useEffect, useRef, useState, type FC, type PropsWithChildren } from "react";
import { FileText, PlusIcon, XIcon } from "lucide-react";
import {
  AttachmentPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useAssistantApi,
  useAssistantState,
} from "@assistant-ui/react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { cn } from "../../lib/utils";
import { bindFirst } from "@geekist/llm-core";
import { TooltipIconButton } from "./tooltip-icon-button";

type AttachmentPreviewProps = {
  src: string;
};

const AttachmentPreview: FC<AttachmentPreviewProps> = ({ src }) => {
  return (
    <img
      src={src}
      alt="Attachment preview"
      className="block h-full w-full object-cover"
      loading="lazy"
    />
  );
};

type FileEffectState = {
  url: string | null;
};

type FileEffectInput = {
  file: File | null;
  setSrc: (src: string | null) => void;
  state: FileEffectState;
};

type FileCleanup = () => boolean | null;

const useFileSrc = (file: File | null) => {
  const [src, setSrc] = useState<string | null>(null);
  const stateRef = useRef<FileEffectState>({ url: null });

  useEffect(bindFileEffect({ file, setSrc, state: stateRef.current }), [file]);

  return src;
};

const revokeObjectUrl = (state: FileEffectState) => {
  if (!state.url) {
    return null;
  }
  URL.revokeObjectURL(state.url);
  state.url = null;
  return true;
};

const runFileEffect = (input: FileEffectInput): FileCleanup => {
  revokeObjectUrl(input.state);
  if (!input.file) {
    input.setSrc(null);
    return bindFirst(revokeObjectUrl, input.state);
  }

  const objectUrl = URL.createObjectURL(input.file);
  input.state.url = objectUrl;
  input.setSrc(objectUrl);
  return bindFirst(revokeObjectUrl, input.state);
};

const runCleanupEffect = (cleanup: FileCleanup) => {
  cleanup();
};

const bindCleanupEffect = (cleanup: FileCleanup) => bindFirst(runCleanupEffect, cleanup);

const runFileEffectHook = (input: FileEffectInput) => bindCleanupEffect(runFileEffect(input));

const bindFileEffect = (input: FileEffectInput) => bindFirst(runFileEffectHook, input);

const useAttachmentSrc = () => {
  const state = useAssistantState(readAttachmentState);
  return useFileSrc(state.file) ?? state.src;
};

const readAttachmentState = ({
  attachment,
}: {
  attachment: { type: string; file?: File; content?: unknown };
}) => {
  if (attachment.type !== "image") {
    return { file: null, src: null };
  }
  if (attachment.file) {
    return { file: attachment.file, src: null };
  }
  const content = attachment.content as Array<{ type: string; image?: string }> | undefined;
  const entry = content?.find(readImageEntry);
  return { file: null, src: entry?.image ?? null };
};

const readImageEntry = (entry: { type: string; image?: string }) => entry.type === "image";

const readAttachmentTypeLabel = (type: string) => {
  switch (type) {
    case "image":
      return "Image";
    case "document":
      return "Document";
    case "file":
      return "File";
    default:
      return "Attachment";
  }
};

type AttachmentTypeLabelState = {
  attachment: { type: string };
};

const readAttachmentTypeLabelFromState = (state: AttachmentTypeLabelState) =>
  readAttachmentTypeLabel(state.attachment.type);

const AttachmentPreviewDialog: FC<PropsWithChildren> = ({ children }) => {
  const src = useAttachmentSrc();

  if (!src) {
    return <>{children}</>;
  }

  return (
    <Dialog>
      <DialogTrigger className="cursor-pointer transition-colors hover:bg-accent/50" asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="p-2 sm:max-w-3xl [&>button]:rounded-full [&>button]:bg-foreground/60 [&>button]:p-1 [&>button]:opacity-100 [&>button]:ring-0! [&_svg]:text-background [&>button]:hover:[&_svg]:text-destructive">
        <DialogTitle className="sr-only">Image Attachment Preview</DialogTitle>
        <div className="relative mx-auto flex max-h-[80dvh] w-full items-center justify-center overflow-hidden bg-background">
          <AttachmentPreview src={src} />
        </div>
      </DialogContent>
    </Dialog>
  );
};

const AttachmentThumb: FC = () => {
  const isImage = useAssistantState(readIsImageAttachment);
  const src = useAttachmentSrc();
  const imageSrc = src ?? "";

  return (
    <Avatar className="h-full w-full rounded-none">
      <AvatarImage src={imageSrc} alt="Attachment preview" className="object-cover" />
      <AvatarFallback delayMs={isImage ? 200 : 0}>
        <FileText className="size-6 text-muted-foreground" />
      </AvatarFallback>
    </Avatar>
  );
};

const readIsImageAttachment = ({ attachment }: { attachment: { type: string } }) =>
  attachment.type === "image";

const AttachmentRemove: FC = () => {
  return (
    <AttachmentPrimitive.Remove asChild>
      <TooltipIconButton
        tooltip="Remove file"
        className="absolute top-1.5 right-1.5 size-3.5 rounded-full bg-white text-muted-foreground opacity-100 shadow-sm hover:bg-white! [&_svg]:text-black hover:[&_svg]:text-destructive"
        side="top"
      >
        <XIcon className="size-3 dark:stroke-[2.5px]" />
      </TooltipIconButton>
    </AttachmentPrimitive.Remove>
  );
};

const AttachmentTile: FC = () => {
  const api = useAssistantApi();
  const isComposer = api.attachment.source === "composer";
  const typeLabel = useAssistantState(readAttachmentTypeLabelFromState);

  return (
    <Tooltip>
      <AttachmentPrimitive.Root
        className={cn("relative", isComposer && "only:[&>#attachment-tile]:size-20")}
      >
        <AttachmentPreviewDialog>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "size-14 cursor-pointer overflow-hidden rounded-[14px] border bg-muted transition-opacity hover:opacity-75",
                isComposer && "border-foreground/20",
              )}
              role="button"
              id="attachment-tile"
              aria-label={`${typeLabel} attachment`}
            >
              <AttachmentThumb />
            </div>
          </TooltipTrigger>
        </AttachmentPreviewDialog>
        {isComposer ? <AttachmentRemove /> : null}
      </AttachmentPrimitive.Root>
      <TooltipContent side="top">
        <AttachmentPrimitive.Name />
      </TooltipContent>
    </Tooltip>
  );
};

export const UserMessageAttachments: FC = () => {
  return (
    <div className="col-span-full col-start-1 row-start-1 flex w-full justify-end gap-2">
      <MessagePrimitive.Attachments components={{ Attachment: AttachmentTile }} />
    </div>
  );
};

export const ComposerAttachments: FC = () => {
  return (
    <div className="mb-2 flex w-full items-center gap-2 overflow-x-auto px-1.5 pt-0.5 pb-1 empty:hidden">
      <ComposerPrimitive.Attachments components={{ Attachment: AttachmentTile }} />
    </div>
  );
};

export const ComposerAddAttachment: FC = () => {
  return (
    <ComposerPrimitive.AddAttachment asChild>
      <TooltipIconButton
        tooltip="Add Attachment"
        side="bottom"
        variant="ghost"
        size="icon"
        className="size-8 rounded-full p-1 text-xs font-semibold hover:bg-muted-foreground/15 dark:border-muted-foreground/15 dark:hover:bg-muted-foreground/30"
        aria-label="Add Attachment"
      >
        <PlusIcon className="size-5 stroke-[1.5px]" />
      </TooltipIconButton>
    </ComposerPrimitive.AddAttachment>
  );
};
