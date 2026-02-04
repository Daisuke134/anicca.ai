export const metadata = { title: 'FAQ | Anicca' };

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

export default function FaqPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-24">
      <h1 className="text-3xl font-bold text-foreground">FAQ</h1>
      <div className="mt-6">
        <Accordion type="single" collapsible>
          <AccordionItem value="item-1">
            <AccordionTrigger>Is my data private?</AccordionTrigger>
            <AccordionContent>Yes. Local-first, least privilege, no telemetry.</AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger>Which platforms are supported?</AccordionTrigger>
            <AccordionContent>iOS 17 or later (iPhone).</AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-3">
            <AccordionTrigger>How does Anicca help me?</AccordionTrigger>
            <AccordionContent>Anicca sends proactive nudges based on your struggles to help you build better habits.</AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </main>
  );
}


