import { z } from "zod";
import { ObjectId } from "mongodb";

export const SubscriptionPlanSchema = z.object({
  name: z.string(),
  type: z.enum(["basic", "premium", "enterprise"]),
  price: z.number(),
  interval: z.enum(["month", "year"]),
  features: z.array(z.string()),
  status: z.enum(["active", "inactive"]).default("active"),
  activeUsers: z.number().default(0),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export const PromoCodeSchema = z.object({
  code: z.string().min(3),
  discountPercent: z.number().min(0).max(100),
  description: z.string().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
  redemptions: z.number().default(0),
  maxRedemptions: z.number().optional(),
  expiryDate: z.date().optional(),
  createdAt: z.date().default(() => new Date()),
});

export type SubscriptionPlan = z.infer<typeof SubscriptionPlanSchema> & { _id?: ObjectId };
export type PromoCode = z.infer<typeof PromoCodeSchema> & { _id?: ObjectId };
