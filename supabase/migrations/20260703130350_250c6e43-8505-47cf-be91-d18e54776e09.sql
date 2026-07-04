
-- Rooms
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);
GRANT SELECT ON public.rooms TO anon, authenticated;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read rooms" ON public.rooms FOR SELECT USING (true);

-- Devices
CREATE TABLE public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('fan','light')),
  label TEXT NOT NULL,
  watts NUMERIC NOT NULL,
  is_on BOOLEAN NOT NULL DEFAULT false,
  last_changed TIMESTAMPTZ NOT NULL DEFAULT now(),
  position_x NUMERIC NOT NULL DEFAULT 0,
  position_y NUMERIC NOT NULL DEFAULT 0
);
CREATE INDEX devices_room_idx ON public.devices(room_id);
GRANT SELECT ON public.devices TO anon, authenticated;
GRANT ALL ON public.devices TO service_role;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read devices" ON public.devices FOR SELECT USING (true);

-- State history
CREATE TABLE public.device_state_history (
  id BIGSERIAL PRIMARY KEY,
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  is_on BOOLEAN NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX dsh_device_time_idx ON public.device_state_history(device_id, changed_at DESC);
GRANT SELECT ON public.device_state_history TO anon, authenticated;
GRANT ALL ON public.device_state_history TO service_role;
ALTER TABLE public.device_state_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read history" ON public.device_state_history FOR SELECT USING (true);

-- Hourly usage (Wh)
CREATE TABLE public.hourly_usage (
  id BIGSERIAL PRIMARY KEY,
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  hour TIMESTAMPTZ NOT NULL,
  wh NUMERIC NOT NULL DEFAULT 0,
  UNIQUE (room_id, hour)
);
GRANT SELECT ON public.hourly_usage TO anon, authenticated;
GRANT ALL ON public.hourly_usage TO service_role;
ALTER TABLE public.hourly_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read usage" ON public.hourly_usage FOR SELECT USING (true);

-- Alerts
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX alerts_created_idx ON public.alerts(created_at DESC);
GRANT SELECT ON public.alerts TO anon, authenticated;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read alerts" ON public.alerts FOR SELECT USING (true);

-- Settings (singleton)
CREATE TABLE public.settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  office_open TIME NOT NULL DEFAULT '09:00',
  office_close TIME NOT NULL DEFAULT '17:00',
  long_on_minutes INT NOT NULL DEFAULT 120,
  timezone TEXT NOT NULL DEFAULT 'Asia/Dhaka',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.settings TO anon, authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read settings" ON public.settings FOR SELECT USING (true);
INSERT INTO public.settings (id) VALUES (1);

-- Seed rooms
INSERT INTO public.rooms (slug, name, sort_order) VALUES
  ('drawing', 'Drawing Room', 1),
  ('work1', 'Work Room 1', 2),
  ('work2', 'Work Room 2', 3);

-- Seed devices: 2 fans + 3 lights per room (positions in relative %)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, slug FROM public.rooms LOOP
    INSERT INTO public.devices (room_id, kind, label, watts, position_x, position_y) VALUES
      (r.id, 'fan',   'Fan 1',   60, 30, 30),
      (r.id, 'fan',   'Fan 2',   60, 70, 30),
      (r.id, 'light', 'Light 1', 15, 20, 70),
      (r.id, 'light', 'Light 2', 15, 50, 70),
      (r.id, 'light', 'Light 3', 15, 80, 70);
  END LOOP;
END $$;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.devices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.settings;
