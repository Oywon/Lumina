import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

export function SettingsDrawer({
  open,
  onOpenChange,
  settings,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  settings: {
    office_open: string;
    office_close: string;
    long_on_minutes: number;
    timezone: string;
  };
  saving: boolean;
  onSave: (v: {
    office_open: string;
    office_close: string;
    long_on_minutes: number;
  }) => void;
}) {
  const [open_, setOpen_] = useState(settings.office_open.slice(0, 5));
  const [close_, setClose_] = useState(settings.office_close.slice(0, 5));
  const [longOn, setLongOn] = useState(settings.long_on_minutes);

  useEffect(() => {
    if (open) {
      setOpen_(settings.office_open.slice(0, 5));
      setClose_(settings.office_close.slice(0, 5));
      setLongOn(settings.long_on_minutes);
    }
  }, [open, settings]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Alert settings</SheetTitle>
          <SheetDescription>
            Tune office hours and thresholds. Applied to the next simulator tick.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4 px-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="open">Office opens</Label>
              <Input
                id="open"
                type="time"
                value={open_}
                onChange={(e) => setOpen_(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="close">Office closes</Label>
              <Input
                id="close"
                type="time"
                value={close_}
                onChange={(e) => setClose_(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="longon">
              Alert when a room is fully ON for (minutes)
            </Label>
            <Input
              id="longon"
              type="number"
              min={1}
              max={1440}
              value={longOn}
              onChange={(e) => setLongOn(Number(e.target.value))}
            />
          </div>
          <p className="text-xs text-slate-500">
            Timezone: <span className="font-mono">{settings.timezone}</span>
          </p>
        </div>
        <SheetFooter>
          <Button
            onClick={() =>
              onSave({
                office_open: open_,
                office_close: close_,
                long_on_minutes: longOn,
              })
            }
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
