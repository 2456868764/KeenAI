"use client";

import { AppHeader } from "@/components/layout/app-header";
import { SettingsNav } from "@/components/settings/settings-nav";
import { type Brand, createBrand, listBrands, updateBrand } from "@/lib/api";
import { Button, Input } from "@keenai/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";

export default function BrandsSettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["brands"],
    queryFn: listBrands,
  });

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: () => createBrand({ slug: slug.trim(), name: name.trim() }),
    onSuccess: () => {
      setSlug("");
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["brands"] });
    },
  });

  const items = data?.items ?? [];

  return (
    <div className="flex h-screen flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Settings" />

      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-6">
        <SettingsNav />
        <p className="mb-6 text-sm text-[hsl(var(--muted-foreground))]">
          Multi-brand workspaces share one org with separate widget slugs, email routing, and
          workflows.
        </p>

        <form
          className="mb-8 flex flex-wrap items-end gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="min-w-[140px] flex-1">
            <label htmlFor="brand-slug" className="mb-1 block text-xs font-medium">
              Slug
            </label>
            <Input
              id="brand-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="acme-eu"
              required
            />
          </div>
          <div className="min-w-[180px] flex-[2]">
            <label htmlFor="brand-name" className="mb-1 block text-xs font-medium">
              Display name
            </label>
            <Input
              id="brand-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Europe"
              required
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={create.isPending || !slug.trim() || !name.trim()}
          >
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : "Add brand"}
          </Button>
        </form>

        {isLoading ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading brands…</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error.message}</p>
        ) : (
          <ul className="divide-y divide-[hsl(var(--border))] rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))]">
            {items.map((brand) => (
              <BrandRow key={brand.id} brand={brand} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function BrandRow({ brand }: { brand: Brand }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(brand.name);
  const [domain, setDomain] = useState(brand.domain ?? "");

  const save = useMutation({
    mutationFn: () =>
      updateBrand(brand.id, {
        name: name.trim(),
        domain: domain.trim() || null,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["brands"] }),
  });

  return (
    <li className="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-xs text-[hsl(var(--muted-foreground))]">/{brand.slug}</p>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          placeholder="Custom domain (optional)"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
        />
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
      </Button>
    </li>
  );
}
