"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, Loader2, CheckCircle, XCircle } from "lucide-react";
import type { AIProvider, AppSettings } from "@/lib/settings";
import { loadSettings, saveSettings } from "@/lib/settings";

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
  const [settings, setSettings] = useState<AppSettings>({ activeProvider: "gemini", geminiApiKey: "", anthropicApiKey: "" });
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
    </div>
  );
}
