import { Toast as BaseToast } from "@base-ui/react/toast";
import type * as React from "react";

export const createToastManager = BaseToast.createToastManager;

export const ToastProvider = BaseToast.Provider;
export const ToastPortal = BaseToast.Portal;
export const ToastViewport = BaseToast.Viewport;
export const ToastRoot = BaseToast.Root;
export const ToastContent = BaseToast.Content;
export const ToastTitle = BaseToast.Title;
export const ToastDescription = BaseToast.Description;
export const ToastAction = BaseToast.Action;
export const ToastClose = BaseToast.Close;
export const useToastManager = BaseToast.useToastManager;

export type ToastProviderProps = React.ComponentProps<typeof ToastProvider>;
export type ToastRootProps = React.ComponentProps<typeof ToastRoot>;
