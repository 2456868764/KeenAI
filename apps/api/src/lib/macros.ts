export type Macro = {
  slug: string;
  name: string;
  body: string;
};

export const BUILTIN_MACROS: Macro[] = [
  {
    slug: "refund",
    name: "Refund policy",
    body: "Thanks for reaching out. I've started a refund review for your order. You'll receive confirmation within 3–5 business days once it's processed.",
  },
  {
    slug: "shipping",
    name: "Shipping delay",
    body: "Sorry for the delay — we're tracking your shipment and will email you an updated ETA within 24 hours.",
  },
  {
    slug: "thanks",
    name: "Thank you",
    body: "Thank you for your patience. Let us know if anything else comes up!",
  },
];

export function getMacroBySlug(slug: string): Macro | undefined {
  return BUILTIN_MACROS.find((m) => m.slug === slug);
}
