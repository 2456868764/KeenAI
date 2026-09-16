"use client";

import { Button, Input, cn } from "@keenai/ui";
import {
  BookOpen,
  ChevronDown,
  Image as ImageIcon,
  Info,
  Link as LinkIcon,
  List,
  Palette,
  PlusCircle,
  Repeat2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";

type BrandingTab = "branding" | "portal-menu";

type MenuItem = {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
};

const tabs: Array<{ id: BrandingTab; label: string; icon: LucideIcon }> = [
  { id: "branding", label: "Branding", icon: Palette },
  { id: "portal-menu", label: "Portal menu", icon: List },
];

const defaultMenuItems: MenuItem[] = [
  { id: "changelog", name: "Changelog", description: "Updates module", icon: Repeat2 },
  { id: "help-center", name: "Help Center", description: "Help center module", icon: BookOpen },
];

export function BrandingSettings() {
  const [activeTab, setActiveTab] = useState<BrandingTab>("branding");
  const [name, setName] = useState("OriginTech");
  const [brandColor, setBrandColor] = useState("#4652f2");
  const [subdomain, setSubdomain] = useState("origintech");
  const [backgroundColor, setBackgroundColor] = useState("#13161F");
  const [menuItems, setMenuItems] = useState(defaultMenuItems);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [menuName, setMenuName] = useState("");
  const [menuUrl, setMenuUrl] = useState("");

  return (
    <main className="flex-1 overflow-y-auto bg-[hsl(var(--surface-0))]">
      <div className="mx-auto w-full max-w-[900px] px-6 py-8">
        <header className="mb-7">
          <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
            Branding
          </h1>
          <p className="mt-3 text-lg text-[hsl(var(--muted-foreground))]">
            Manage branding and the portal menu visible to your visitors.
          </p>
        </header>

        <BrandingTabs activeTab={activeTab} onChange={setActiveTab} />

        <div className="mt-10">
          {activeTab === "branding" ? (
            <BrandingTabContent
              name={name}
              brandColor={brandColor}
              subdomain={subdomain}
              backgroundColor={backgroundColor}
              onNameChange={setName}
              onBrandColorChange={setBrandColor}
              onSubdomainChange={setSubdomain}
              onBackgroundColorChange={setBackgroundColor}
            />
          ) : (
            <PortalMenuTab menuItems={menuItems} onCreate={() => setDialogOpen(true)} />
          )}
        </div>
      </div>

      {dialogOpen ? (
        <CreateMenuItemDialog
          name={menuName}
          url={menuUrl}
          onNameChange={setMenuName}
          onUrlChange={setMenuUrl}
          onClose={() => setDialogOpen(false)}
          onCreate={() => {
            const nextName = menuName.trim();
            const nextUrl = menuUrl.trim();
            if (!nextName || !nextUrl) return;
            setMenuItems((items) => [
              ...items,
              {
                id: `${nextName.toLowerCase().replace(/\s+/g, "-")}-${items.length}`,
                name: nextName,
                description: nextUrl,
                icon: LinkIcon,
              },
            ]);
            setMenuName("");
            setMenuUrl("");
            setDialogOpen(false);
          }}
        />
      ) : null}
    </main>
  );
}

function BrandingTabs({
  activeTab,
  onChange,
}: {
  activeTab: BrandingTab;
  onChange: (tab: BrandingTab) => void;
}) {
  return (
    <div
      className="inline-flex rounded-[18px] bg-[hsl(var(--surface-2))] p-1"
      role="tablist"
      aria-label="Branding settings sections"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={cn(
              "flex h-11 items-center gap-3 rounded-[14px] px-5 text-base font-semibold transition-colors",
              active
                ? "bg-[hsl(var(--surface-1))] text-[hsl(var(--foreground))] shadow-sm ring-1 ring-[hsl(var(--border))]"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
            )}
            onClick={() => onChange(tab.id)}
          >
            <Icon className="size-5" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function BrandingTabContent({
  name,
  brandColor,
  subdomain,
  backgroundColor,
  onNameChange,
  onBrandColorChange,
  onSubdomainChange,
  onBackgroundColorChange,
}: {
  name: string;
  brandColor: string;
  subdomain: string;
  backgroundColor: string;
  onNameChange: (value: string) => void;
  onBrandColorChange: (value: string) => void;
  onSubdomainChange: (value: string) => void;
  onBackgroundColorChange: (value: string) => void;
}) {
  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">Branding</h2>
        <p className="mt-2 text-lg text-[hsl(var(--muted-foreground))]">
          Manage the branding for your workspace, including name, logo, and appearance settings.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] shadow-sm">
        <SettingsRow title="Name">
          <Input
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            aria-label="Workspace name"
            className="h-10 w-full max-w-[320px] bg-[hsl(var(--surface-0))]"
          />
        </SettingsRow>

        <SettingsRow
          title="Logo"
          description="Shown throughout the portal and widgets. PNG, JPEG, GIF, WebP or SVG."
        >
          <div className="flex items-center gap-4">
            <div className="flex size-10 items-center justify-center rounded-full bg-lime-600 text-white">
              <Palette className="size-5" />
            </div>
            <Button variant="outline">Remove</Button>
          </div>
        </SettingsRow>

        <SettingsRow
          title="Brand color"
          description="Primary accent color used across the portal and widgets."
        >
          <ColorInput color={brandColor} onChange={onBrandColorChange} label="Brand color" />
        </SettingsRow>

        <SettingsRow
          title="Workspace subdomain"
          description="Where people will be able to access your workspace."
          last
        >
          <div className="flex w-full max-w-[460px] gap-2">
            <div className="flex min-w-0 flex-1 overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))]">
              <Input
                value={subdomain}
                onChange={(event) => onSubdomainChange(event.target.value)}
                aria-label="Workspace subdomain"
                className="h-10 min-w-0 flex-1 border-0 bg-transparent"
              />
              <span className="flex h-10 items-center px-3 text-sm font-semibold text-[hsl(var(--muted-foreground))]">
                .keenai.app
              </span>
            </div>
            <Button>Change</Button>
          </div>
        </SettingsRow>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">
          Portal customization
        </h2>
        <div className="mt-4 overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] shadow-sm">
          <SettingsRow
            title="Default theme"
            description="Initial appearance when visitors load your portal."
          >
            <select
              aria-label="Default theme"
              className="h-10 w-full max-w-[240px] rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] px-3 text-sm font-semibold text-[hsl(var(--foreground))]"
              defaultValue="light"
            >
              <option value="light">Light</option>
              <option value="system">System default</option>
              <option value="dark">Dark</option>
            </select>
          </SettingsRow>

          <SettingsRow
            title={
              <span className="inline-flex items-center gap-2">
                Background color
                <Info className="size-4 text-[hsl(var(--muted-foreground))]" />
              </span>
            }
            description="Background color visitors see when dark mode is active."
          >
            <ColorInput
              color={backgroundColor}
              onChange={onBackgroundColorChange}
              label="Background color"
            />
          </SettingsRow>

          <SettingsRow
            title={
              <span className="inline-flex items-center gap-2">
                Social media preview
                <Info className="size-4 text-[hsl(var(--muted-foreground))]" />
              </span>
            }
            description="Image shown when someone shares a link to your portal."
            last
          >
            <div className="flex h-28 w-full items-center justify-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))]">
              <Button variant="outline">
                <ImageIcon className="size-4" />
                Add featured image
              </Button>
            </div>
          </SettingsRow>
        </div>
      </div>
    </section>
  );
}

function PortalMenuTab({
  menuItems,
  onCreate,
}: {
  menuItems: MenuItem[];
  onCreate: () => void;
}) {
  return (
    <section>
      <div className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">Portal menu</h2>
          <p className="mt-2 text-lg text-[hsl(var(--muted-foreground))]">
            Reorder, customize or remove links from being displayed from user-facing portal.
          </p>
        </div>
        <Button variant="outline" className="h-10 shrink-0 rounded-lg text-base" onClick={onCreate}>
          <PlusCircle className="size-5" />
          Add link / module
        </Button>
      </div>

      <div className="space-y-4">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className="flex min-h-[84px] w-full items-center gap-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-5 py-4 text-left shadow-sm"
            >
              <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] text-[hsl(var(--muted-foreground))]">
                <Icon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">{item.name}</h3>
                <p className="mt-1 text-base font-semibold text-[hsl(var(--muted-foreground))]">
                  {item.description}
                </p>
              </div>
              <ChevronDown className="size-5 text-[hsl(var(--muted-foreground))]" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SettingsRow({
  title,
  description,
  children,
  last = false,
}: {
  title: React.ReactNode;
  description?: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-4 px-5 py-5 md:grid-cols-[minmax(220px,1fr)_minmax(260px,380px)] md:items-center",
        last ? "" : "border-b border-[hsl(var(--border))]",
      )}
    >
      <div>
        <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm font-medium text-[hsl(var(--muted-foreground))]">
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex justify-start md:justify-end">{children}</div>
    </div>
  );
}

function ColorInput({
  color,
  onChange,
  label,
}: {
  color: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        aria-label={`${label} picker`}
        type="color"
        value={color}
        onChange={(event) => onChange(event.target.value)}
        className="size-10 cursor-pointer rounded-full border-0 bg-transparent p-0"
      />
      <Input
        value={color}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="h-10 w-[140px] bg-[hsl(var(--surface-0))] font-semibold"
      />
    </div>
  );
}

function CreateMenuItemDialog({
  name,
  url,
  onNameChange,
  onUrlChange,
  onClose,
  onCreate,
}: {
  name: string;
  url: string;
  onNameChange: (value: string) => void;
  onUrlChange: (value: string) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  return (
    <dialog
      open
      className="fixed inset-0 z-50 m-0 flex h-screen max-h-none w-screen max-w-none items-center justify-center border-0 bg-black/30 p-6 text-sm backdrop:bg-transparent"
      aria-labelledby="create-menu-item-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="w-full max-w-[680px] rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-6 shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate();
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="create-menu-item-title"
              className="text-xl font-semibold tracking-tight text-[hsl(var(--foreground))]"
            >
              Create Menu Item
            </h2>
            <p className="mt-3 text-base text-[hsl(var(--muted-foreground))]">
              Enter the details for the new menu item.
            </p>
          </div>
          <button
            type="button"
            className="flex size-9 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]"
            aria-label="Close create menu item dialog"
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-7 space-y-5">
          <div>
            <label
              htmlFor="menu-item-name"
              className="mb-2 block text-sm font-semibold text-[hsl(var(--foreground))]"
            >
              Icon & Name
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] text-[hsl(var(--muted-foreground))]"
                aria-label="Choose menu item icon"
              >
                <LinkIcon className="size-5" />
              </button>
              <Input
                id="menu-item-name"
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder="Enter menu item name (en)"
                className="h-11 bg-[hsl(var(--surface-0))] text-sm"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="menu-item-url"
              className="mb-2 block text-sm font-semibold text-[hsl(var(--foreground))]"
            >
              Link
            </label>
            <div className="grid gap-3 md:grid-cols-[170px_1fr]">
              <button
                type="button"
                className="flex h-11 items-center justify-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] text-sm font-semibold text-[hsl(var(--foreground))] shadow-sm"
              >
                <LinkIcon className="size-5 text-[hsl(var(--muted-foreground))]" />
                Custom link
              </button>
              <Input
                id="menu-item-url"
                value={url}
                onChange={(event) => onUrlChange(event.target.value)}
                placeholder="https://..."
                className="h-11 bg-[hsl(var(--surface-0))] text-sm"
              />
            </div>
          </div>
        </div>

        <div className="mt-7 flex justify-end">
          <Button
            type="submit"
            className="h-10 rounded-lg px-5 text-sm"
            disabled={!name.trim() || !url.trim()}
          >
            Create Menu Item
          </Button>
        </div>
      </form>
    </dialog>
  );
}
