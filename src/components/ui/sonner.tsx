import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import { toast, Toaster as Sonner, type ToasterProps } from "sonner";
import { useAppStore } from "@/store/app.store";

const Toaster = ({ ...props }: ToasterProps) => {
  const isDarkMode = useAppStore((state) => state.isDarkMode);

  return (
    <Sonner
      theme={isDarkMode ? "dark" : "light"}
      position="top-right"
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        descriptionClassName: "!text-muted-foreground",
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { toast, Toaster };
