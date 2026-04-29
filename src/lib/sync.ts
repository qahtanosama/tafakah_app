export let syncTimeout: ReturnType<typeof setTimeout> | null = null;

export function triggerBackgroundSync() {
  if (typeof window === "undefined") return;
  if (syncTimeout) clearTimeout(syncTimeout);
  
  syncTimeout = setTimeout(async () => {
    try {
      const { runMigration } = await import("@/lib/migration/migrate");
      await runMigration({ dryRun: false });
      console.log("[Auto-Sync] Successfully synced local data to cloud database.");
    } catch (error) {
      console.error("[Auto-Sync] Failed to sync data:", error);
    }
  }, 2000); // Wait 2 seconds after the last change before syncing
}
