import type { ComponentProps } from "react";
import { Accordion as AdsAccordion } from "../ads/components/Accordion";
export const Accordion = AdsAccordion.Root;
export const AccordionItem = AdsAccordion.Item;
export function AccordionTrigger(props: ComponentProps<typeof AdsAccordion.Trigger>) {
  return <AdsAccordion.Header><AdsAccordion.Trigger {...props} data-slot="accordion-trigger" /></AdsAccordion.Header>;
}
export const AccordionContent = AdsAccordion.Panel;
