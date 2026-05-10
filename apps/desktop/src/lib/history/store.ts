import { writable } from "svelte/store";
import { dbAdd, dbGetAll, dbClear } from "./db";
import type { ConversionRecord } from "./types";

const MAX_ITEMS = 50;

export const historyItems = writable<ConversionRecord[]>([]);

export async function loadHistory(): Promise<void> {
  try {
    const rows = await dbGetAll();
    historyItems.set(rows.slice(0, MAX_ITEMS));
  } catch {
    // IndexedDB erişilemiyor (ör. private browsing) — sessizce geç
  }
}

export async function recordConversion(entry: Omit<ConversionRecord, "id">): Promise<void> {
  try {
    const id = await dbAdd(entry);
    historyItems.update((prev) => [{ ...entry, id }, ...prev].slice(0, MAX_ITEMS));
  } catch {
    // DB yazma hatası — UI'ı engelleme
  }
}

export async function clearHistory(): Promise<void> {
  try {
    await dbClear();
    historyItems.set([]);
  } catch {
    // sessizce geç
  }
}
