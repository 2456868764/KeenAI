import type { LibsqlStore, Store } from "@keenai/storage";
import { type FeedbackPostVectorStore, createLibsqlFeedbackPostVectorStore } from "@keenai/storage";

let feedbackPostVectorStore: FeedbackPostVectorStore | null = null;

export function initFeedbackPostVectorFromStore(store: Store): void {
  if (store.dialect !== "libsql") return;
  feedbackPostVectorStore = createLibsqlFeedbackPostVectorStore((store as LibsqlStore).client);
}

export function getFeedbackPostVectorStore(): FeedbackPostVectorStore | null {
  return feedbackPostVectorStore;
}
