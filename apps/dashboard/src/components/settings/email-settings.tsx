"use client";

import { Button, Input, cn } from "@keenai/ui";
import {
  Ban,
  BookOpen,
  ChevronDown,
  CircleAlert,
  Info,
  Mail,
  PencilLine,
  Plus,
  Send,
  Shield,
  Smile,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";

type EmailTab = "sending" | "ignored" | "spam" | "branding" | "signatures";
type FromNameMode = "teammate" | "custom";

const tabs: Array<{ id: EmailTab; label: string; icon: LucideIcon }> = [
  { id: "sending", label: "Sending", icon: Send },
  { id: "ignored", label: "Ignored addresses", icon: Ban },
  { id: "spam", label: "Spam filter", icon: Shield },
  { id: "branding", label: "Branding", icon: Mail },
  { id: "signatures", label: "Signatures", icon: PencilLine },
];

export function EmailSettings() {
  const [activeTab, setActiveTab] = useState<EmailTab>("sending");
  const [domainDialogOpen, setDomainDialogOpen] = useState(false);
  const [domainDraft, setDomainDraft] = useState("");
  const [sendingDomains, setSendingDomains] = useState<string[]>([]);
  const [ignoredDraft, setIgnoredDraft] = useState("");
  const [ignoredAddresses, setIgnoredAddresses] = useState<string[]>([]);
  const [routeAutoresponders, setRouteAutoresponders] = useState(false);
  const [replyTo, setReplyTo] = useState("");
  const [signatureEnabled, setSignatureEnabled] = useState(true);
  const [signatureText, setSignatureText] = useState("");
  const [fromNameMode, setFromNameMode] = useState<FromNameMode>("teammate");

  const content = useMemo(() => {
    if (activeTab === "ignored") {
      return (
        <IgnoredAddressesTab
          draft={ignoredDraft}
          addresses={ignoredAddresses}
          onDraftChange={setIgnoredDraft}
          onAdd={() => {
            const next = ignoredDraft.trim();
            if (!next) return;
            setIgnoredAddresses((items) => (items.includes(next) ? items : [...items, next]));
            setIgnoredDraft("");
          }}
          onRemove={(address) =>
            setIgnoredAddresses((items) => items.filter((item) => item !== address))
          }
        />
      );
    }

    if (activeTab === "spam") {
      return (
        <SpamFilterTab
          routeAutoresponders={routeAutoresponders}
          onToggleAutoresponders={() => setRouteAutoresponders((value) => !value)}
        />
      );
    }

    if (activeTab === "branding") {
      return <BrandingTab replyTo={replyTo} onReplyToChange={setReplyTo} />;
    }

    if (activeTab === "signatures") {
      return (
        <SignaturesTab
          enabled={signatureEnabled}
          signatureText={signatureText}
          fromNameMode={fromNameMode}
          onToggleEnabled={() => setSignatureEnabled((value) => !value)}
          onSignatureTextChange={setSignatureText}
          onFromNameModeChange={setFromNameMode}
        />
      );
    }

    return <SendingTab domains={sendingDomains} onAddDomain={() => setDomainDialogOpen(true)} />;
  }, [
    activeTab,
    fromNameMode,
    ignoredAddresses,
    ignoredDraft,
    replyTo,
    routeAutoresponders,
    sendingDomains,
    signatureEnabled,
    signatureText,
  ]);

  return (
    <main className="flex-1 overflow-y-auto bg-[hsl(var(--surface-0))]">
      <div className="mx-auto w-full max-w-[900px] px-6 py-8">
        <InfoBanner className="mb-14">
          We highly recommend setting up a custom sending address to improve email deliverability
          and make your emails look more professional.{" "}
          <span className="font-semibold text-[hsl(var(--primary))]">Read more</span>{" "}
          <BookOpen className="inline size-4 align-[-2px] text-[hsl(var(--primary))]" />
        </InfoBanner>

        <header className="mb-7">
          <h1 className="text-2xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
            Email
          </h1>
          <p className="mt-3 text-lg text-[hsl(var(--muted-foreground))]">
            Configure sending domains, addresses, email branding, and signatures.
          </p>
        </header>

        <EmailTabs activeTab={activeTab} onChange={setActiveTab} />

        <div className="mt-10">{content}</div>
      </div>

      {domainDialogOpen ? (
        <AddDomainDialog
          value={domainDraft}
          onChange={setDomainDraft}
          onClose={() => setDomainDialogOpen(false)}
          onAdd={() => {
            const next = domainDraft.trim();
            if (!next) return;
            setSendingDomains((items) => (items.includes(next) ? items : [...items, next]));
            setDomainDraft("");
            setDomainDialogOpen(false);
          }}
        />
      ) : null}
    </main>
  );
}

function EmailTabs({
  activeTab,
  onChange,
}: {
  activeTab: EmailTab;
  onChange: (tab: EmailTab) => void;
}) {
  return (
    <div
      className="grid w-full grid-cols-5 rounded-[18px] bg-[hsl(var(--surface-2))] p-1"
      role="tablist"
      aria-label="Email settings sections"
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
              "flex h-12 min-w-0 items-center justify-center gap-2 rounded-[14px] px-3 text-sm font-semibold transition-colors lg:text-base",
              active
                ? "bg-[hsl(var(--surface-1))] text-[hsl(var(--foreground))] shadow-sm ring-1 ring-[hsl(var(--border))]"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
            )}
            onClick={() => onChange(tab.id)}
          >
            <Icon className="size-5 shrink-0" />
            <span className="min-w-0 truncate">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function SendingTab({
  domains,
  onAddDomain,
}: {
  domains: string[];
  onAddDomain: () => void;
}) {
  return (
    <section className="space-y-14">
      <div>
        <div className="mb-6 flex items-start justify-between gap-6">
          <div>
            <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">Sending domains</h2>
            <p className="mt-2 text-lg text-[hsl(var(--muted-foreground))]">
              Authenticate your domain to improve email deliverability and sender reputation.
            </p>
          </div>
          <Button className="h-11 shrink-0 rounded-lg px-5 text-base" onClick={onAddDomain}>
            <Plus className="size-5" />
            Add domain
          </Button>
        </div>

        <div className="rounded-lg bg-[hsl(var(--surface-1))] px-6 py-7 text-center text-lg font-medium text-[hsl(var(--muted-foreground))]">
          {domains.length ? (
            <ul className="space-y-2 text-left">
              {domains.map((domain) => (
                <li key={domain} className="rounded-md bg-[hsl(var(--surface-2))] px-4 py-3">
                  {domain}
                </li>
              ))}
            </ul>
          ) : (
            "No sending domains added yet."
          )}
        </div>
      </div>

      <InfoBanner>
        <strong>Currently sending and receiving support emails on a KeenAI subdomain</strong>
        <br />
        Until you add your own sending domain, outbound support emails are sent from a{" "}
        <code className="rounded bg-[hsl(var(--surface-0))] px-1.5 py-0.5">keenai-mail.com</code>{" "}
        subdomain.
        <br />
        Add your own domain below to send from your brand and improve deliverability.
      </InfoBanner>

      <div className="opacity-55">
        <div className="mb-6 flex items-start justify-between gap-6">
          <div>
            <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">
              Sending addresses
            </h2>
            <p className="mt-2 text-lg text-[hsl(var(--muted-foreground))]">
              Verify a sending domain above to start adding sender addresses.
            </p>
          </div>
          <Button className="h-11 shrink-0 rounded-lg px-5 text-base" disabled>
            <Plus className="size-5" />
            Add sender
          </Button>
        </div>
        <div className="rounded-lg bg-[hsl(var(--surface-1))] px-6 py-7 text-center text-lg font-medium text-[hsl(var(--muted-foreground))]">
          Add a verified sending domain first.
        </div>
      </div>
    </section>
  );
}

function IgnoredAddressesTab({
  draft,
  addresses,
  onDraftChange,
  onAdd,
  onRemove,
}: {
  draft: string;
  addresses: string[];
  onDraftChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (address: string) => void;
}) {
  return (
    <section className="space-y-6">
      <InfoBanner>
        If you forward messages into your Support Inbox, we add the forwarding address, the original
        sender, and all recipients as conversation participants. Add addresses here to exclude them
        from being added. Addresses set up in the "Sending addresses" section are ignored by
        default.
      </InfoBanner>

      <form
        className="flex gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          onAdd();
        }}
      >
        <Input
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          aria-label="Ignored email address"
          placeholder="e.g. no-reply@shopify.com"
          className="h-12 flex-1 rounded-lg bg-[hsl(var(--surface-1))] text-lg"
          type="email"
        />
        <Button type="submit" className="h-12 rounded-lg px-5 text-lg" disabled={!draft.trim()}>
          Add
        </Button>
      </form>

      <div className="rounded-lg bg-[hsl(var(--surface-1))] px-6 py-6 text-center text-lg font-medium text-[hsl(var(--muted-foreground))]">
        {addresses.length ? (
          <ul className="space-y-2 text-left">
            {addresses.map((address) => (
              <li
                key={address}
                className="flex items-center justify-between rounded-md bg-[hsl(var(--surface-2))] px-4 py-3"
              >
                <span>{address}</span>
                <button
                  type="button"
                  className="text-sm font-semibold text-[hsl(var(--primary))]"
                  onClick={() => onRemove(address)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          "No ignored addresses."
        )}
      </div>
    </section>
  );
}

function SpamFilterTab({
  routeAutoresponders,
  onToggleAutoresponders,
}: {
  routeAutoresponders: boolean;
  onToggleAutoresponders: () => void;
}) {
  return (
    <section className="space-y-14">
      <div>
        <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">Spam detection</h2>
        <p className="mt-3 max-w-4xl text-lg leading-relaxed text-[hsl(var(--muted-foreground))]">
          Infrastructure-filtered emails appear in Inbox Spam. Conversations KeenAI identifies
          appear under AI Agent {"->"} Spam.
        </p>

        <div className="mt-7 flex min-h-[110px] items-center gap-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-6 py-5 shadow-sm">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">
              Route auto-responders to the inbox
            </h3>
            <p className="mt-1 max-w-3xl text-base text-[hsl(var(--muted-foreground))]">
              By default, out-of-office and automatic replies go to Spam. Turn this on to deliver
              them to the inbox instead.
            </p>
          </div>
          <Toggle
            checked={routeAutoresponders}
            onClick={onToggleAutoresponders}
            label="Route auto-responders to the inbox"
          />
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">Review and tuning</h2>
        <p className="mt-3 text-lg text-[hsl(var(--muted-foreground))]">
          Fine-tune classification, test potential spam, and manage trusted senders.
        </p>

        <div className="mt-7 space-y-4">
          <ReviewItem
            icon={CircleAlert}
            title="Spam guidance - 0/100 live"
            description="Teach the classifier what your workspace considers spam."
          />
          <ReviewItem
            icon={Send}
            title="Preview tester"
            description="Test how a sample email would be classified."
          />
          <ReviewItem
            icon={Shield}
            title="Trusted senders"
            description="Allow addresses and domains to bypass spam filtering."
          />
        </div>
      </div>
    </section>
  );
}

function BrandingTab({
  replyTo,
  onReplyToChange,
}: {
  replyTo: string;
  onReplyToChange: (value: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] shadow-sm">
      <div className="grid gap-5 border-b border-[hsl(var(--border))] px-6 py-6 md:grid-cols-[1fr_360px] md:items-center">
        <div>
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Reply-to address</h2>
          <p className="mt-2 text-base text-[hsl(var(--muted-foreground))]">
            Set a custom reply-to email for notification and update emails.
          </p>
        </div>
        <Input
          value={replyTo}
          onChange={(event) => onReplyToChange(event.target.value)}
          aria-label="Reply-to address"
          placeholder="notifications@example.com"
          type="email"
          className="h-12 rounded-lg bg-[hsl(var(--surface-0))] text-base"
        />
      </div>

      <div className="grid gap-5 px-6 py-6 md:grid-cols-[1fr_220px] md:items-center">
        <div>
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Email logo</h2>
          <p className="mt-2 text-base text-[hsl(var(--muted-foreground))]">
            Upload a custom logo to display in your outgoing emails. PNG, JPEG, GIF or WebP.
          </p>
        </div>
        <div className="flex h-12 items-center justify-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] text-base font-semibold text-[hsl(var(--muted-foreground))]">
          No logo
        </div>
      </div>
    </section>
  );
}

function SignaturesTab({
  enabled,
  signatureText,
  fromNameMode,
  onToggleEnabled,
  onSignatureTextChange,
  onFromNameModeChange,
}: {
  enabled: boolean;
  signatureText: string;
  fromNameMode: FromNameMode;
  onToggleEnabled: () => void;
  onSignatureTextChange: (value: string) => void;
  onFromNameModeChange: (value: FromNameMode) => void;
}) {
  return (
    <section className="space-y-7">
      <div className="flex min-h-[88px] items-center gap-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-6 py-5 shadow-sm">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Enable signature</h2>
          <p className="mt-1 text-base text-[hsl(var(--muted-foreground))]">
            When disabled, no signature will be appended to support emails.
          </p>
        </div>
        <Toggle checked={enabled} onClick={onToggleEnabled} label="Enable signature" />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-[hsl(var(--foreground))]">Preview</h2>
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-6">
          <div className="space-y-3 border-b border-[hsl(var(--border))] pb-5">
            <div className="h-3 w-72 rounded-full bg-[hsl(var(--surface-2))]" />
            <div className="h-3 w-[420px] max-w-full rounded-full bg-[hsl(var(--surface-2))]" />
            <div className="h-3 w-80 max-w-full rounded-full bg-[hsl(var(--surface-2))]" />
          </div>
          <p className="pt-5 text-base italic text-[hsl(var(--muted-foreground))]">
            {signatureText.trim() || "Your signature will appear here..."}
          </p>
        </div>
      </div>

      <div>
        <label
          htmlFor="signature-text"
          className="mb-3 block text-lg font-semibold text-[hsl(var(--foreground))]"
        >
          Signature text
        </label>
        <div className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))]">
          <textarea
            id="signature-text"
            value={signatureText}
            onChange={(event) => onSignatureTextChange(event.target.value)}
            placeholder="Type your signature..."
            className="min-h-[136px] w-full resize-none bg-transparent px-5 py-4 text-base text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))]"
          />
          <div className="flex h-12 items-center gap-5 px-4 text-[hsl(var(--muted-foreground))]">
            <X className="size-4" />
            <span className="font-semibold">B</span>
            <span className="font-semibold">H1</span>
            <span className="font-semibold">H2</span>
            <span className="font-semibold">-</span>
            <span className="font-semibold">1.</span>
            <span className="font-semibold">link</span>
            <span className="font-semibold">{"</>"}</span>
            <Smile className="size-4" />
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">
          Logo <span className="text-[hsl(var(--muted-foreground))]">(Optional)</span>
        </h2>
        <p className="mt-2 text-base text-[hsl(var(--muted-foreground))]">
          Upload a PNG, JPG, or GIF image smaller than 1MB.
        </p>
        <input
          id="signature-logo"
          type="file"
          accept="image/png,image/jpeg,image/gif"
          className="mt-3"
        />
      </div>

      <div className="border-t border-[hsl(var(--border))] pt-7">
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">From name</h2>
        <p className="mt-2 text-base text-[hsl(var(--muted-foreground))]">
          Control the name shown in the "From" field of support emails.
        </p>
        <div className="mt-5 flex flex-wrap gap-8">
          <RadioOption
            id="from-teammate"
            label="Use teammate name"
            checked={fromNameMode === "teammate"}
            onChange={() => onFromNameModeChange("teammate")}
          />
          <RadioOption
            id="from-custom"
            label="Use custom name"
            checked={fromNameMode === "custom"}
            onChange={() => onFromNameModeChange("custom")}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button className="h-11 rounded-lg px-5 text-base">Save</Button>
      </div>
    </section>
  );
}

function InfoBanner({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex gap-4 rounded-lg border border-[hsl(var(--primary)/0.22)] bg-[hsl(var(--primary)/0.08)] px-6 py-5 text-lg leading-relaxed text-[hsl(var(--primary))]",
        className,
      )}
    >
      <Info className="mt-1 size-5 shrink-0" />
      <p>{children}</p>
    </div>
  );
}

function ReviewItem({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      className="flex min-h-[94px] w-full items-center gap-5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] px-6 py-5 text-left shadow-sm"
    >
      <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-0))] text-[hsl(var(--muted-foreground))]">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">{title}</h3>
        <p className="mt-2 text-base font-semibold text-[hsl(var(--muted-foreground))]">
          {description}
        </p>
      </div>
      <ChevronDown className="size-5 text-[hsl(var(--muted-foreground))]" />
    </button>
  );
}

function Toggle({
  checked,
  onClick,
  label,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors",
        checked ? "bg-[hsl(var(--primary))]" : "bg-[hsl(var(--surface-2))]",
      )}
    >
      <span
        className={cn(
          "size-6 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}

function RadioOption({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-3 text-base font-semibold text-[hsl(var(--foreground))]"
    >
      <input id={id} type="radio" checked={checked} onChange={onChange} className="size-5" />
      {label}
    </label>
  );
}

function AddDomainDialog({
  value,
  onChange,
  onClose,
  onAdd,
}: {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onAdd: () => void;
}) {
  return (
    <dialog
      open
      className="fixed inset-0 z-50 m-0 flex h-screen max-h-none w-screen max-w-none items-center justify-center border-0 bg-black/30 p-6 text-sm backdrop:bg-transparent"
      aria-labelledby="add-domain-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="w-full max-w-[760px] rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-6 shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          onAdd();
        }}
      >
        <h2
          id="add-domain-title"
          className="text-xl font-semibold tracking-tight text-[hsl(var(--foreground))]"
        >
          Add sending domain
        </h2>
        <p className="mt-4 text-base text-[hsl(var(--muted-foreground))]">
          Add a domain to send emails from.
        </p>

        <div className="mt-7">
          <label
            htmlFor="sending-domain"
            className="mb-2 flex items-center gap-2 text-base font-semibold text-[hsl(var(--foreground))]"
          >
            Domain
            <Info className="size-5 text-[hsl(var(--muted-foreground))]" />
          </label>
          <Input
            id="sending-domain"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="notifications.example.com"
            className="h-11 rounded-lg bg-[hsl(var(--surface-0))] text-sm"
          />
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="h-10 rounded-lg px-5 text-sm" disabled={!value.trim()}>
            Add domain
          </Button>
        </div>
      </form>
    </dialog>
  );
}
