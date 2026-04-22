import { createPortal } from "react-dom";
import { useDismissibleLayer } from "@/lib/dismissible-layer";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { cn } from "@/lib/utils";

export function ImageLightbox(args: {
  open: boolean;
  imageSrc: string;
  alt: string;
  onClose: () => void;
  ariaLabel?: string;
  closeLabel?: string;
  imageTitle?: string;
}) {
  const { containerRef, handleKeyDown } = useDismissibleLayer<HTMLDivElement>({
    enabled: args.open,
    onDismiss: args.onClose,
  });

  if (!args.open) {
    return null;
  }

  const overlay = (
    <div
      ref={containerRef}
      data-testid="image-lightbox"
      className={cn(
        UI_LAYER_CLASS.lightbox,
        "fixed inset-0 flex items-center justify-center bg-overlay p-6 backdrop-blur-[2px]",
      )}
      role="dialog"
      aria-modal="true"
      aria-label={args.ariaLabel ?? "Image full screen preview"}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onClick={args.onClose}
    >
      <button
        type="button"
        className="absolute right-4 top-4 rounded-sm border border-border/80 bg-card/90 px-2 py-1 text-sm text-foreground hover:bg-accent"
        onClick={(event) => {
          event.stopPropagation();
          args.onClose();
        }}
      >
        {args.closeLabel ?? "Close"}
      </button>
      <img
        src={args.imageSrc}
        alt={args.alt}
        className="max-h-full max-w-full cursor-zoom-out object-contain"
        title={args.imageTitle ?? "Click to close full screen"}
        onClick={(event) => {
          event.stopPropagation();
          args.onClose();
        }}
      />
    </div>
  );

  // Keep server/static render paths testable while using a root-level portal in the app.
  if (typeof document === "undefined" || !document.body) {
    return overlay;
  }

  return createPortal(overlay, document.body);
}
