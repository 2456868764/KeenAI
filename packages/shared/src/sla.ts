import { z } from "zod";

const daySlotSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});

export const officeHoursScheduleSchema = z.record(z.array(daySlotSchema));

export const upsertOfficeHoursSchema = z.object({
  timezone: z.string().min(1).max(64).default("UTC"),
  schedule: officeHoursScheduleSchema.default({}),
  holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).default([]),
});

export const createSlaPolicySchema = z.object({
  name: z.string().min(1).max(128),
  firstResponseSec: z.number().int().min(60).optional(),
  resolutionSec: z.number().int().min(60).optional(),
  operationalHoursOnly: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export const updateSlaPolicySchema = createSlaPolicySchema.partial();
