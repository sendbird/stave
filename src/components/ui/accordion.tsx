import type { ComponentProps } from "react";
import { Accordion as AuiAccordion } from "../aui/components/Accordion";
export const Accordion = AuiAccordion.Root;
export const AccordionItem = AuiAccordion.Item;
export function AccordionTrigger(props: ComponentProps<typeof AuiAccordion.Trigger>) {
  return <AuiAccordion.Header><AuiAccordion.Trigger {...props} data-slot="accordion-trigger" /></AuiAccordion.Header>;
}
export const AccordionContent = AuiAccordion.Panel;
