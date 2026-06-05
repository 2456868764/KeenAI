import { HelpArticleEditor } from "@/components/help-center/help-article-editor";

export default async function HelpArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <HelpArticleEditor articleId={id} />;
}
