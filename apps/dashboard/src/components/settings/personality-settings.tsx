"use client";

import { type Brand, type BrandPersonality, listBrands, updateBrand } from "@/lib/api";
import { Button, Input } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

const TONE_OPTIONS = [
  { value: "friendly_professional", label: "Friendly professional" },
  { value: "casual", label: "Casual" },
  { value: "formal", label: "Formal" },
] as const;

const LENGTH_OPTIONS = [
  { value: "concise", label: "Concise" },
  { value: "balanced", label: "Balanced" },
  { value: "detailed", label: "Detailed" },
] as const;

function toFormState(brand: Brand): BrandPersonality {
  return brand.personality;
}

export function PersonalitySettingsForm() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["brands"],
    queryFn: listBrands,
  });

  const items = data?.items ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((b) => b.id === selectedId) ?? items[0] ?? null;

  const [form, setForm] = useState<BrandPersonality | null>(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [guardRailInput, setGuardRailInput] = useState("");

  useEffect(() => {
    if (!selected) {
      setForm(null);
      setLogoUrl("");
      return;
    }
    setSelectedId(selected.id);
    setForm(toFormState(selected));
    setLogoUrl(selected.logoUrl ?? "");
  }, [selected]);

  const save = useMutation({
    mutationFn: () => {
      if (!selected || !form) throw new Error("missing_brand");
      return updateBrand(selected.id, {
        personality: form,
        logoUrl: logoUrl.trim() || null,
      });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["brands"] }),
  });

  if (isLoading) {
    return <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading brands…</p>;
  }
  if (error) {
    return <p className="text-sm text-red-400">{error.message}</p>;
  }
  if (!selected || !form) {
    return (
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        Create a brand first under Settings → Brands.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {items.length > 1 ? (
        <div>
          <label htmlFor="personality-brand" className="mb-1 block text-xs font-medium">
            Brand
          </label>
          <select
            id="personality-brand"
            className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-3 py-2 text-sm"
            value={selected.id}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {items.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name} (/{brand.slug})
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <section className="space-y-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
        <h2 className="text-sm font-medium">Agent identity</h2>
        <div>
          <label htmlFor="agent-name" className="mb-1 block text-xs font-medium">
            Agent name
          </label>
          <Input
            id="agent-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="logo-url" className="mb-1 block text-xs font-medium">
            Logo URL
          </label>
          <Input
            id="logo-url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://cdn.example.com/logo.png"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="voice-tone" className="mb-1 block text-xs font-medium">
              Tone
            </label>
            <select
              id="voice-tone"
              className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 py-2 text-sm"
              value={form.voice.tone}
              onChange={(e) =>
                setForm({
                  ...form,
                  voice: {
                    ...form.voice,
                    tone: e.target.value as BrandPersonality["voice"]["tone"],
                  },
                })
              }
            >
              {TONE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="response-length" className="mb-1 block text-xs font-medium">
              Response length
            </label>
            <select
              id="response-length"
              className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 py-2 text-sm"
              value={form.voice.responseLength}
              onChange={(e) =>
                setForm({
                  ...form,
                  voice: {
                    ...form.voice,
                    responseLength: e.target.value as BrandPersonality["voice"]["responseLength"],
                  },
                })
              }
            >
              {LENGTH_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="system-prompt" className="mb-1 block text-xs font-medium">
            System prompt
          </label>
          <textarea
            id="system-prompt"
            className="min-h-[120px] w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 py-2 text-sm"
            value={form.systemPrompt}
            onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
          />
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
        <h2 className="text-sm font-medium">Guardrails</h2>
        <ul className="space-y-2">
          {form.guardRails.map((rule) => (
            <li
              key={rule}
              className="flex items-center justify-between gap-2 rounded-md bg-[hsl(var(--surface-0))] px-3 py-2 text-sm"
            >
              <span>{rule}</span>
              <button
                type="button"
                className="text-xs text-red-400 hover:underline"
                onClick={() =>
                  setForm({
                    ...form,
                    guardRails: form.guardRails.filter((r) => r !== rule),
                  })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Input
            value={guardRailInput}
            onChange={(e) => setGuardRailInput(e.target.value)}
            placeholder="Never promise refunds without approval"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!guardRailInput.trim()}
            onClick={() => {
              const next = guardRailInput.trim();
              if (!next || form.guardRails.includes(next)) return;
              setForm({ ...form, guardRails: [...form.guardRails, next] });
              setGuardRailInput("");
            }}
          >
            Add
          </Button>
        </div>
      </section>

      <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save personality"}
      </Button>
    </div>
  );
}
