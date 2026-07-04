import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  const { loadSnapshot } = await import("./office-data.server");
  return loadSnapshot();
});

const ToggleInput = z.object({ deviceId: z.string().uuid(), is_on: z.boolean() });
export const toggleDevice = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ToggleInput.parse(input))
  .handler(async ({ data }) => {
    const { toggleDeviceState } = await import("./office-data.server");
    return toggleDeviceState(data.deviceId, data.is_on);
  });

const SettingsInput = z.object({
  office_open: z.string().regex(/^\d{2}:\d{2}$/),
  office_close: z.string().regex(/^\d{2}:\d{2}$/),
  long_on_minutes: z.number().int().min(1).max(1440),
});
export const updateSettings = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SettingsInput.parse(input))
  .handler(async ({ data }) => {
    const { updateSettingsState } = await import("./office-data.server");
    return updateSettingsState(data);
  });
