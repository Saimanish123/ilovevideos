"use client";

import { Info } from "lucide-react";
import { useState } from "react";
import {
  type IllustrationId,
  illustrations,
  ToolIllustration,
} from "@/components/illustrations/tools";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogActions,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { ProgressLine } from "@/components/ui/progress-line";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`k-${title}`} className="border-border border-t pt-6">
      <h2 id={`k-${title}`} className="text-h3">
        {title}
      </h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** Every primitive in its states, for review at 375, 768 and 1280 and the visual baseline. */
export function KitchenSink() {
  const [preset, setPreset] = useState<"smaller" | "balanced" | "best">("balanced");
  const [format, setFormat] = useState<"mp4" | "webm" | "mov">("mp4");
  const [height, setHeight] = useState(720);
  const [name, setName] = useState("holiday-clip");
  const [keep, setKeep] = useState(true);

  return (
    <TooltipProvider>
      <div className="mx-auto w-full max-w-(--container-content) space-y-12 px-4 py-12 md:px-8 md:py-16">
        <header>
          <h1 className="text-h1">UI kit</h1>
          <p className="mt-3 max-w-(--container-prose) text-body-lg text-fg-muted">
            Every primitive in src/components/ui with the tokens it uses. Development only.
          </p>
        </header>

        <Block title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg">
              Compress
            </Button>
            <Button variant="secondary" size="lg">
              Start over
            </Button>
            <Button variant="secondary">Choose a file</Button>
            <Button variant="ghost">Show command</Button>
            <Button variant="destructive">Remove</Button>
            {/* quiet: ghost for controls on a bg-subtle surface, where ghost's hover would not show. */}
            <span className="inline-flex items-center gap-2 rounded-md bg-bg-subtle p-2">
              <span className="px-2 text-sm">clip.mp4</span>
              <Button variant="quiet">Remove</Button>
            </span>
            <Button variant="secondary" size="sm">
              Copy
            </Button>
            <Button variant="secondary" disabled>
              Disabled
            </Button>
          </div>
          <p className="mt-3 text-fg-muted text-sm">
            One primary per screen state; this page shows it once.
          </p>
        </Block>

        <Block title="Inputs">
          <div className="grid max-w-(--container-panel) gap-6">
            <Field label="File name" htmlFor="k-name" hint="The extension is added for you.">
              <Input id="k-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Height" htmlFor="k-height" trailing={`${height}p`}>
              <div className="flex items-center gap-3">
                <Slider
                  className="flex-1"
                  aria-label="Height"
                  value={height}
                  onValueChange={setHeight}
                  min={240}
                  max={2160}
                  step={2}
                  getAriaValueText={(_, v) => `${v}p`}
                />
                <NumberInput
                  id="k-height"
                  className="w-22 shrink-0"
                  value={height}
                  min={240}
                  max={2160}
                  step={2}
                  onChange={(e) => setHeight(Number(e.target.value) || 240)}
                />
              </div>
            </Field>
            <Field label="Preset" labelId="k-preset">
              <Segmented
                name="k-preset"
                aria-labelledby="k-preset"
                value={preset}
                onChange={setPreset}
                options={[
                  { value: "smaller", label: "Smaller" },
                  { value: "balanced", label: "Balanced" },
                  { value: "best", label: "Best" },
                ]}
              />
            </Field>
            <Field label="Format" labelId="k-format">
              <Select
                aria-labelledby="k-format"
                value={format}
                onValueChange={setFormat}
                options={[
                  { value: "mp4", label: "MP4" },
                  { value: "webm", label: "WebM" },
                  { value: "mov", label: "MOV" },
                ]}
              />
            </Field>
            <Checkbox
              label="Keep the sound"
              hint="Copied as it is when the format allows."
              checked={keep}
              onChange={(e) => setKeep(e.target.checked)}
            />
          </div>
        </Block>

        <Block title="Progress">
          <div className="max-w-(--container-panel) space-y-3">
            <ProgressLine ratio={0.62} label="Encoding" />
            <p className="tabular text-fg-muted text-sm">Encoding frame 782 of 1,260</p>
          </div>
        </Block>

        <Block title="Overlays">
          <div className="flex flex-wrap items-center gap-3">
            <Dialog>
              <DialogTrigger render={<Button variant="secondary" />}>Open dialog</DialogTrigger>
              <DialogContent
                title="Discard this result?"
                description="The compressed file has not been downloaded yet."
              >
                <DialogActions>
                  <DialogClose render={<Button variant="secondary" />}>Keep it</DialogClose>
                  <DialogClose render={<Button variant="destructive" />}>Discard</DialogClose>
                </DialogActions>
              </DialogContent>
            </Dialog>
            <Sheet>
              <SheetTrigger render={<Button variant="secondary" />}>Open sheet</SheetTrigger>
              <SheetContent
                title="Keyboard shortcuts"
                description="Space plays and pauses. Arrow keys move one frame."
              >
                <SheetClose render={<Button variant="secondary" className="w-full" />}>
                  Close
                </SheetClose>
              </SheetContent>
            </Sheet>
            <Tooltip content="What the numbers mean">
              <button
                type="button"
                aria-label="What the numbers mean"
                className="flex size-11 items-center justify-center rounded-md text-fg-muted hover:bg-bg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
              >
                <Info size={20} strokeWidth={1.5} aria-hidden />
              </button>
            </Tooltip>
          </div>
        </Block>

        <Block title="Illustrations">
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {(Object.keys(illustrations) as IllustrationId[]).map((id) => (
              <li key={id} className="overflow-hidden rounded-lg border border-border bg-bg-raised">
                <div className="flex aspect-3/2 items-center justify-center bg-bg-subtle text-fg">
                  <ToolIllustration id={id} className="h-3/4 w-3/4" />
                </div>
                <p className="px-3 py-2 font-mono text-fg-muted text-xs">{id}</p>
              </li>
            ))}
          </ul>
        </Block>
      </div>
    </TooltipProvider>
  );
}
