"use client";

import en from "@/messages/en.json";
import zh from "@/messages/zh.json";

export type AppLocale = "en" | "zh";

const STORAGE_KEY = "keenai-locale";

export function getStoredLocale(): AppLocale {
  if (typeof window === "undefined") return "en";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === "zh" ? "zh" : "en";
}

export function setStoredLocale(locale: AppLocale) {
  window.localStorage.setItem(STORAGE_KEY, locale);
}

export function messagesForLocale(locale: AppLocale) {
  return locale === "zh" ? zh : en;
}
