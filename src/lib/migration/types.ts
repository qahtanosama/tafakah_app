export type MigrationStatus = "idle" | "running" | "success" | "failed" | "partial";

export type MigrationEntity =
  | "products"
  | "buyers"
  | "sellers"
  | "contracts"
  | "contract_finance"
  | "contract_shipping"
  | "contract_documents";

export interface MigrationError {
  id?: string;
  message: string;
  item?: unknown;
}

export interface EntityMigrationResult {
  entity: MigrationEntity;
  localCount: number;
  migratedCount: number;
  failedCount: number;
  skippedExisting: number;
  errors: MigrationError[];
}

export interface MigrationRun {
  startedAt: string;
  finishedAt?: string;
  status: MigrationStatus;
  results: EntityMigrationResult[];
  dryRun: boolean;
}

export const MIGRATION_ENTITIES: MigrationEntity[] = [
  "products",
  "buyers",
  "sellers",
  "contracts",
  "contract_finance",
  "contract_shipping",
  "contract_documents",
];

export const LAST_RUN_KEY = "migration-last-run";
export const ID_MAP_KEY = "migration-id-map";
export const RUNNING_FLAG_KEY = "migration-running";
export const BANNER_DISMISS_KEY = "migration-dismissed-until";
