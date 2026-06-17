import { ChangelogEntryEditor } from "@/components/changelog/changelog-entry-editor";
import { AppHeader } from "@/components/layout/app-header";

export default async function ChangelogEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="flex h-screen flex-col bg-[hsl(var(--surface-0))]">
      <AppHeader title="Changelog" />
      <main className="flex-1 overflow-y-auto">
        <ChangelogEntryEditor entryId={id} />
      </main>
    </div>
  );
}
