import {
  CircleCheckIcon,
  InfoIcon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast, Toaster as Sonner, type ToasterProps } from "sonner";
import { Loader } from "@/components/ui/loader";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { useAppStore } from "@/store/app.store";

const Toaster = ({ className, ...props }: ToasterProps) => {
  const isDarkMode = useAppStore((state) => state.isDarkMode);

  return (
    <Sonner
      theme={isDarkMode ? "dark" : "light"}
      position="top-center"
      visibleToasts={3}
      expand={false}
      gap={8}
      offset={12}
      mobileOffset={8}
      className={["toaster group", UI_LAYER_CLASS.popover, className]
        .filter(Boolean)
        .join(" ")}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader aria-hidden size="xs" variant="spinner" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          "--width": "min(24rem, calc(100vw - 1.5rem))",
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
