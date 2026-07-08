"use client";

import ar from "../messages/ar.json";
import de from "../messages/de.json";
import en from "../messages/en.json";
import es from "../messages/es.json";
import fr from "../messages/fr.json";
import hi from "../messages/hi.json";
import it from "../messages/it.json";
import ja from "../messages/ja.json";
import ko from "../messages/ko.json";
import nl from "../messages/nl.json";
import pt from "../messages/pt.json";
import zh from "../messages/zh.json";

export const SUPPORTED_LOCALES = [
  "en",
  "zh",
  "ja",
  "ko",
  "es",
  "fr",
  "de",
  "pt",
  "it",
  "nl",
  "ar",
  "hi",
] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const MESSAGES_BY_LOCALE: Record<AppLocale, typeof en> = {
  en,
  zh,
  ja,
  ko,
  es,
  fr,
  de,
  pt,
  it,
  nl,
  ar,
  hi,
};

const STORAGE_KEY = "keenai-locale";

function isAppLocale(value: string | null): value is AppLocale {
  return SUPPORTED_LOCALES.includes(value as AppLocale);
}

export function getStoredLocale(): AppLocale {
  if (typeof window === "undefined") return "en";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return isAppLocale(raw) ? raw : "en";
}

export function setStoredLocale(locale: AppLocale) {
  window.localStorage.setItem(STORAGE_KEY, locale);
}

export function messagesForLocale(locale: AppLocale) {
  return MESSAGES_BY_LOCALE[locale] ?? en;
}
