import { Accordion as BaseAccordion } from "@base-ui/react/accordion";
import type * as React from "react";

export const AccordionRoot = BaseAccordion.Root;
export const AccordionItem = BaseAccordion.Item;
export const AccordionHeader = BaseAccordion.Header;
export const AccordionTrigger = BaseAccordion.Trigger;
export const AccordionPanel = BaseAccordion.Panel;

export type AccordionRootProps = React.ComponentProps<typeof AccordionRoot>;
export type AccordionItemProps = React.ComponentProps<typeof AccordionItem>;
