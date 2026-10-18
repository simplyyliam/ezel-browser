import type { ComponentType } from "react";

/**
 * File-based page discovery. Single source of truth for the router.
 *
 *   pages/app/page.tsx                         -> /          (browser view)
 *   pages/app/settings/page.tsx                -> /settings
 *   pages/standalone/updates/page.tsx          -> /updates
 *   pages/standalone/docs/[...rest]/page.tsx   -> /docs/*
 */

export type PageModule = { default: ComponentType };

/** Which layout the page renders in. */
export type PageSection = "app" | "standalone";

export interface PageEntry {
  /** Source file, relative to this module. */
  file: string;
  section: PageSection;
  /** Route path, e.g. "/settings". */
  path: string;
  load: () => Promise<PageModule>;
}

const PAGE_FILE = /^\.\.\/pages\/(app|standalone)\/(?:(.+)\/)?page\.tsx$/;

function toRouteSegment(segment: string): string {
  if (/^\[\.\.\.[^\]]+\]$/.test(segment)) return "*";
  return segment.replace(/^\[([^\]]+)\]$/, ":$1");
}

function toPageEntry(file: string, load: () => Promise<PageModule>): PageEntry | null {
  const match = PAGE_FILE.exec(file);
  if (!match) return null;

  const section = match[1] as PageSection;
  const segments = match[2]?.split("/") ?? [];

  return { file, section, path: `/${segments.map(toRouteSegment).join("/")}`, load };
}

function assertUniquePaths(entries: readonly PageEntry[]): void {
  const seen = new Map<string, string>();
  for (const { path, file } of entries) {
    const existing = seen.get(path);
    if (existing) {
      throw new Error(`[routing] "${existing}" and "${file}" both resolve to "${path}".`);
    }
    seen.set(path, file);
  }
}

// Lazy glob: each page becomes its own chunk, loaded on first navigation.
const modules = import.meta.glob<PageModule>("../pages/**/page.tsx");

export const pages: readonly PageEntry[] = Object.entries(modules)
  .map(([file, load]) => toPageEntry(file, load))
  .filter((entry): entry is PageEntry => entry !== null);

assertUniquePaths(pages);