"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, Loader2, CheckCircle, XCircle, Download, Upload, Trash2, HardDrive, Ship, MessageSquare } from "lucide-react";
import type { AIProvider, AppSettings } from "@/lib/settings";
import { loadSettings, saveSettings } from "@/lib/settings";
import { exportBackup, parseBackup, restoreBackup, clearAllData, getStorageStats } from "@/lib/backup";
import { getUsage, setUsageLimit } from "@/lib/shipsgo";
import { supportsSaveFilePicker, saveBlobWithPicker, saveBlobWithDownload } from "@/lib/quick-share/save-file";

interface ProviderCardProps {
  provider: AIProvider;
  label: string;
  model: string;
  helpUrl: string;
  helpText: string;
  apiKey: string;
  onKeyChange: (key: string) => void;
  isActive: boolean;
  onActivate: () => void;
  onSave: () => void;
}

function ProviderCard({
  provider,
  label,
  model,
  helpUrl,
  helpText,
  apiKey,
  onKeyChange,
  isActive,
  onActivate,
  onSave,
}: ProviderCardProps) {
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const masked = apiKey
    ? apiKey.substring(0, 4) + "\u2022".repeat(Math.min(apiKey.length - 8, 16)) + apiKey.slice(-4)
    : "";

  const handleTest = useCallback(async () => {
    if (!apiKey) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({ success: false, message: (err as Error).message });
    } finally {
      setTesting(false);
    }
  }, [provider, apiKey]);

  return (
    <Card className={`transition-all ${isActive ? "border-2 border-emerald-400 shadow-md" : "border"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className={`inline-block h-3 w-3 rounded-full ${isActive ? "bg-emerald-500" : "bg-zinc-300"}`} />
            {label}
          </CardTitle>
          <span className="text-xs text-zinc-400">{model}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* API key input */}
        <div>
          <Label>API Key</Label>
          <div className="mt-1 flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => { onKeyChange(e.target.value); setTestResult(null); }}
                placeholder="Paste your API key..."
                className="pr-10 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {!apiKey && <p className="mt-1 text-xs text-zinc-400">Not configured</p>}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={!apiKey || testing} onClick={handleTest}>
            {testing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Test Connection
          </Button>
          <Button size="sm" disabled={!apiKey} onClick={onSave}>
            Save
          </Button>
        </div>

        {/* Test result */}
        {testResult && (
          <div className={`flex items-start gap-2 rounded px-3 py-2 text-xs ${
            testResult.success
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}>
            {testResult.success ? <CheckCircle className="mt-0.5 h-3 w-3 shrink-0" /> : <XCircle className="mt-0.5 h-3 w-3 shrink-0" />}
            <span>{testResult.message}</span>
          </div>
        )}

        {/* Radio */}
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="radio"
            name="activeProvider"
            checked={isActive}
            onChange={onActivate}
            className="h-4 w-4 accent-emerald-600"
          />
          <span className={isActive ? "font-medium text-emerald-700" : "text-zinc-500"}>
            Use this provider
          </span>
        </label>

        {/* Help */}
        <p className="text-xs text-zinc-400">
          {helpText}{" "}
          <a href={helpUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-600">
            Get API key
          </a>
        </p>
      </CardContent>
    </Card>
  );
}

export default function SettingsForm() {
  const [settings, setSettings] = useState<AppSettings>({ activeProvider: "gemini", geminiApiKey: "", anthropicApiKey: "", shipsgoToken: "", wechatHandoffEnabled: false });
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setSettings(loadSettings());
    setLoaded(true);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleSave = useCallback(() => {
    saveSettings(settings);
    showToast("Settings saved");
  }, [settings, showToast]);

  if (!loaded) return <div className="flex items-center justify-center py-20 text-zinc-500">Loading...</div>;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-6 py-8">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-800 shadow-lg">
          {toast}
        </div>
      )}

      <div>
        <h2 className="text-xl font-bold">AI Provider Configuration</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Choose which AI provider to use for document analysis.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <ProviderCard
          provider="gemini"
          label="Google Gemini"
          model="gemini-2.0-flash"
          helpUrl="https://aistudio.google.com/apikey"
          helpText="Free tier: 15 req/min."
          apiKey={settings.geminiApiKey}
          onKeyChange={(k) => setSettings((s) => ({ ...s, geminiApiKey: k }))}
          isActive={settings.activeProvider === "gemini"}
          onActivate={() => { setSettings((s) => ({ ...s, activeProvider: "gemini" })); handleSave(); }}
          onSave={handleSave}
        />
        <ProviderCard
          provider="anthropic"
          label="Anthropic Claude"
          model="claude-sonnet-4-5"
          helpUrl="https://console.anthropic.com"
          helpText="Pay-as-you-go: ~$0.05/doc."
          apiKey={settings.anthropicApiKey}
          onKeyChange={(k) => setSettings((s) => ({ ...s, anthropicApiKey: k }))}
          isActive={settings.activeProvider === "anthropic"}
          onActivate={() => { setSettings((s) => ({ ...s, activeProvider: "anthropic" })); handleSave(); }}
          onSave={handleSave}
        />
      </div>

      <p className="text-xs text-zinc-400">
        Keys are stored locally in your browser. When this app is deployed to the web, keys will be stored securely on the server.
      </p>

      {/* ═══ SHIPSGO API ═══ */}
      <ShipsgoSection
        token={settings.shipsgoToken}
        onTokenChange={(t) => setSettings((s) => ({ ...s, shipsgoToken: t }))}
        onSave={handleSave}
        showToast={showToast}
      />

      {/* ═══ QUICK SHARE ═══ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" style={{ color: "#07C160" }} /> Quick Share
          </CardTitle>
          <p className="text-xs text-zinc-400">Optional recipient channels for factory Quick Share.</p>
        </CardHeader>
        <CardContent>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-emerald-600"
              checked={settings.wechatHandoffEnabled}
              onChange={(e) => {
                const next = { ...settings, wechatHandoffEnabled: e.target.checked };
                setSettings(next);
                saveSettings(next);
                showToast(e.target.checked ? "WeChat handoff enabled" : "WeChat handoff disabled");
              }}
            />
            <div>
              <p className="text-sm font-medium">Show &ldquo;Send via WeChat&rdquo; on factory Quick Share</p>
              <p className="text-xs text-zinc-500">
                When on, factories with a WeChat ID / group name get a WeChat button in Quick Share that copies the message and shows paste-into-group instructions. When off, only WhatsApp shows.
              </p>
            </div>
          </label>
        </CardContent>
      </Card>

      {/* ═══ DATA MANAGEMENT ═══ */}
      <DataManagementSection showToast={showToast} />
    </div>
  );
}

function ShipsgoSection({ token, onTokenChange, onSave, showToast }: {
  token: string;
  onTokenChange: (t: string) => void;
  onSave: () => void;
  showToast: (msg: string) => void;
}) {
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [usage, setUsageState] = useState<{ month: string; count: number; limit: number } | null>(null);
  const [limitEdit, setLimitEdit] = useState("");

  useEffect(() => {
    const u = getUsage();
    setUsageState(u);
    setLimitEdit(String(u.limit));
  }, []);

  const handleTest = useCallback(async () => {
    if (!token) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/shipping/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({ success: false, message: (err as Error).message });
    } finally {
      setTesting(false);
    }
  }, [token]);

  const handleSaveLimit = useCallback(() => {
    const n = parseInt(limitEdit, 10);
    if (isNaN(n) || n < 1) return;
    setUsageLimit(n);
    setUsageState(getUsage());
    showToast(`Monthly limit set to ${n}`);
  }, [limitEdit, showToast]);

  const percent = usage ? Math.round((usage.count / usage.limit) * 100) : 0;
  const barColor = percent >= 100 ? "bg-red-500" : percent >= 80 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <Card id="shipsgo" className="border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Ship className="h-4 w-4" /> Shipping Tracking API
        </CardTitle>
        <p className="text-xs text-zinc-400">Provider: Shipsgo &mdash; covers 150+ carriers with one token</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>API Token</Label>
          <div className="mt-1 flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => { onTokenChange(e.target.value); setTestResult(null); }}
                placeholder="Paste your Shipsgo user token..."
                className="pr-10 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {!token && <p className="mt-1 text-xs text-zinc-400">Not configured</p>}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={!token || testing} onClick={handleTest}>
            {testing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Test Connection
          </Button>
          <Button size="sm" disabled={!token} onClick={onSave}>Save</Button>
        </div>

        {testResult && (
          <div className={`flex items-start gap-2 rounded px-3 py-2 text-xs ${testResult.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {testResult.success ? <CheckCircle className="mt-0.5 h-3 w-3 shrink-0" /> : <XCircle className="mt-0.5 h-3 w-3 shrink-0" />}
            <span>{testResult.message}</span>
          </div>
        )}

        {/* Usage tracker */}
        {usage && (
          <div className="space-y-2 rounded-lg border bg-zinc-50 p-3 dark:bg-zinc-800">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">API Usage ({usage.month})</span>
              <span className={percent >= 100 ? "text-red-600 font-semibold" : percent >= 80 ? "text-amber-600 font-medium" : "text-zinc-500"}>
                {usage.count} / {usage.limit}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
              <div className={`h-full ${barColor} transition-all`} style={{ width: `${Math.min(100, percent)}%` }} />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-500">Monthly limit:</span>
              <Input
                type="number"
                value={limitEdit}
                onChange={(e) => setLimitEdit(e.target.value)}
                className="h-7 w-20 text-xs"
              />
              <Button size="sm" variant="outline" onClick={handleSaveLimit}>Update</Button>
              <span className="text-zinc-400">(free tier default is 50)</span>
            </div>
          </div>
        )}

        <p className="text-xs text-zinc-400">
          Get a token at{" "}
          <a href="https://shipsgo.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-600">shipsgo.com</a>.
          Token is stored in your browser only. When deployed to the web, we&rsquo;ll move it to secure server storage.
        </p>
      </CardContent>
    </Card>
  );
}

function DataManagementSection({ showToast }: { showToast: (msg: string) => void }) {
  const [exporting, setExporting] = useState(false);
  const [confirmClear, setConfirmClear] = useState("");
  const [storageInfo, setStorageInfo] = useState({ lsUsed: "0 MB", lsTotal: "5 MB", idbDocs: 0 });
  const restoreInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setStorageInfo(getStorageStats());
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const { json, stats } = await exportBackup();
      const blob = new Blob([json], { type: "application/json" });
      const filename = `TAFAKAH_Backup_${new Date().toISOString().split("T")[0]}.json`;
      const summary = `${stats.contracts} contracts, ${stats.buyers} buyers, ${stats.shipments} shipments, ${stats.documents} documents`;
      if (supportsSaveFilePicker()) {
        const result = await saveBlobWithPicker(blob, filename);
        if (result === "cancelled") {
          showToast("Export cancelled.");
        } else {
          showToast(`Backup saved: ${summary}`);
        }
      } else {
        await saveBlobWithDownload(blob, filename);
        showToast(`Backup exported: ${summary}`);
      }
    } catch (err) {
      showToast("Export failed: " + (err as Error).message);
    } finally {
      setExporting(false);
    }
  }, [showToast]);

  const handleRestore = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const text = await file.text();
    const parsed = parseBackup(text);
    if (!parsed) { showToast("Invalid backup file"); return; }
    if (!confirm(`Restore backup?\n\n${parsed.stats.contracts} contracts, ${parsed.stats.buyers} buyers, ${parsed.stats.products} products, ${parsed.stats.shipments} shipments, ${parsed.stats.documents} documents.\nCreated: ${new Date(parsed.data.createdAt).toLocaleDateString()}\n\nThis will REPLACE all current data.`)) return;
    await restoreBackup(parsed.data);
    showToast("Backup restored. Reloading...");
    setTimeout(() => window.location.reload(), 1000);
  }, [showToast]);

  const handleClear = useCallback(async () => {
    if (confirmClear !== "DELETE") return;
    await clearAllData();
    showToast("All data cleared. Reloading...");
    setTimeout(() => window.location.reload(), 1000);
  }, [confirmClear, showToast]);

  return (
    <>
      <div>
        <h2 className="text-xl font-semibold">Data Management</h2>
        <p className="mt-1 text-sm text-zinc-500">Export, restore, or clear your data.</p>
      </div>

      {/* Storage info */}
      <div className="flex items-center gap-4 rounded-lg border bg-white px-5 py-3 dark:bg-zinc-900">
        <HardDrive className="h-5 w-5 text-zinc-400" />
        <div className="text-sm">
          <span className="text-zinc-500">localStorage:</span> <span className="font-medium">{storageInfo.lsUsed} / {storageInfo.lsTotal}</span>
          <span className="mx-3 text-zinc-300">|</span>
          <span className="text-zinc-500">Documents:</span> <span className="font-medium">{storageInfo.idbDocs} files in IndexedDB</span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
            <Download className="h-8 w-8 text-emerald-500" />
            <p className="text-sm font-medium">Export Backup</p>
            <p className="text-xs text-zinc-400">Download all data as JSON</p>
            <Button variant="outline" className="gap-2" disabled={exporting} onClick={handleExport}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
            <Upload className="h-8 w-8 text-blue-500" />
            <p className="text-sm font-medium">Restore from Backup</p>
            <p className="text-xs text-zinc-400">Import a .json backup file</p>
            <Button variant="outline" className="gap-2" onClick={() => restoreInputRef.current?.click()}>
              <Upload className="h-4 w-4" /> Restore
            </Button>
            <input ref={restoreInputRef} type="file" accept=".json" className="hidden" onChange={handleRestore} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
            <Trash2 className="h-8 w-8 text-red-500" />
            <p className="text-sm font-medium">Clear All Data</p>
            <p className="text-xs text-zinc-400">Type DELETE to confirm</p>
            <Input value={confirmClear} onChange={(e) => setConfirmClear(e.target.value)} placeholder='Type "DELETE"' className="text-center" />
            <Button variant="destructive" className="gap-2" disabled={confirmClear !== "DELETE"} onClick={handleClear}>
              <Trash2 className="h-4 w-4" /> Clear Everything
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
