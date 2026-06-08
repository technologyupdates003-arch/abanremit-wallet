import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as any).standalone === true
  );
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
}

/**
 * Persistent install button.
 * - Android / desktop Chrome / Edge: uses beforeinstallprompt → native install.
 * - iOS Safari: opens a sheet with the "Share → Add to Home Screen" steps,
 *   since iOS does not expose a programmatic install API.
 * Hides itself permanently only once the app is actually installed
 * (display-mode: standalone), so it remains visible until the user installs.
 */
export function InstallPWA() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());
  const [showIOS, setShowIOS] = useState(false);

  useEffect(() => {
    if (installed) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    const mq = window.matchMedia("(display-mode: standalone)");
    const onMode = () => setInstalled(mq.matches);
    mq.addEventListener?.("change", onMode);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      mq.removeEventListener?.("change", onMode);
    };
  }, [installed]);

  if (installed) return null;

  async function handleInstall() {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setDeferred(null);
      return;
    }
    if (isIOS()) {
      setShowIOS(true);
      return;
    }
    // Some Android browsers won't fire beforeinstallprompt until criteria met.
    setShowIOS(true);
  }

  return (
    <>
      <Button
        onClick={handleInstall}
        className="fixed bottom-4 right-4 z-50 h-11 px-4 rounded-full gradient-primary glow-primary text-primary-foreground shadow-2xl flex items-center gap-2"
        aria-label="Install app"
      >
        <Download className="h-4 w-4" />
        Install app
      </Button>

      {showIOS && (
        <div
          className="fixed inset-0 z-[60] grid place-items-end sm:place-items-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowIOS(false)}
        >
          <div
            className="w-full sm:max-w-sm m-0 sm:m-4 rounded-t-3xl sm:rounded-3xl bg-surface-1 border border-border/40 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-display text-lg font-semibold">Install AbanRemit</div>
                <div className="text-xs text-muted-foreground">Add to your Home Screen</div>
              </div>
              <button
                onClick={() => setShowIOS(false)}
                className="p-1.5 rounded-lg hover:bg-muted/40"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ol className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <span className="h-6 w-6 grid place-items-center rounded-full bg-primary/15 text-primary text-xs font-semibold">
                  1
                </span>
                <span className="flex items-center gap-1.5">
                  Tap the <Share className="h-4 w-4 inline" /> Share button in your browser
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="h-6 w-6 grid place-items-center rounded-full bg-primary/15 text-primary text-xs font-semibold">
                  2
                </span>
                <span>Choose <strong>Add to Home Screen</strong></span>
              </li>
              <li className="flex items-start gap-3">
                <span className="h-6 w-6 grid place-items-center rounded-full bg-primary/15 text-primary text-xs font-semibold">
                  3
                </span>
                <span>Tap <strong>Add</strong> — AbanRemit will appear like a native app</span>
              </li>
            </ol>
            <div className="text-[11px] text-muted-foreground">
              On Android, open this site in Chrome → menu → <strong>Install app</strong>.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
