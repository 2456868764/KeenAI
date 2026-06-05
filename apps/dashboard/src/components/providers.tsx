"use client";

import { type AppLocale, getStoredLocale, messagesForLocale } from "@/i18n/locale-store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { useEffect, useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 5_000, refetchOnWindowFocus: true },
        },
      }),
  );
  const [locale, setLocale] = useState<AppLocale>("en");

  useEffect(() => {
    setLocale(getStoredLocale());
  }, []);

  return (
    <NextIntlClientProvider locale={locale} messages={messagesForLocale(locale)}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}
