import { ID_MAP_KEY } from "./types";

/**
 * Translates localStorage IDs → Supabase UUIDs per entity.
 * Persisted to localStorage so FKs still resolve after a page reload.
 */
export class IdMapper {
  private maps: Record<string, Map<string, string>>;

  constructor(initial: Record<string, Record<string, string>> = {}) {
    this.maps = {};
    for (const [entity, pairs] of Object.entries(initial)) {
      this.maps[entity] = new Map(Object.entries(pairs));
    }
  }

  register(entity: string, localId: string, uuid: string): void {
    if (!this.maps[entity]) this.maps[entity] = new Map();
    this.maps[entity].set(String(localId), uuid);
  }

  registerMany(entity: string, pairs: Record<string, string>): void {
    if (!this.maps[entity]) this.maps[entity] = new Map();
    for (const [localId, uuid] of Object.entries(pairs)) {
      this.maps[entity].set(String(localId), uuid);
    }
  }

  resolve(entity: string, localId: string | undefined | null): string | undefined {
    if (!localId) return undefined;
    return this.maps[entity]?.get(String(localId));
  }

  /** Look up across multiple candidate entities (used when product name or id might be used). */
  resolveAny(entity: string, candidates: (string | undefined | null)[]): string | undefined {
    for (const c of candidates) {
      const hit = this.resolve(entity, c ?? "");
      if (hit) return hit;
    }
    return undefined;
  }

  toJSON(): Record<string, Record<string, string>> {
    const out: Record<string, Record<string, string>> = {};
    for (const [entity, m] of Object.entries(this.maps)) {
      out[entity] = Object.fromEntries(m);
    }
    return out;
  }

  persist(): void {
    try {
      localStorage.setItem(ID_MAP_KEY, JSON.stringify(this.toJSON()));
    } catch {
      // ignore storage errors
    }
  }

  static load(): IdMapper {
    try {
      const raw = localStorage.getItem(ID_MAP_KEY);
      if (!raw) return new IdMapper();
      return new IdMapper(JSON.parse(raw));
    } catch {
      return new IdMapper();
    }
  }

  static fromJSON(json: Record<string, Record<string, string>>): IdMapper {
    return new IdMapper(json);
  }
}
