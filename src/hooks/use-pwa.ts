import { useEffect } from "react";
import { toast } from "sonner";

const UPDATE_TOAST_ID = "pwa-update";

/**
 * Registra o service worker (apenas em produção) e avisa quando há versão
 * nova: o toast "Atualizar" manda SKIP_WAITING para o SW — sem reload
 * surpresa, que perderia formulários abertos no Painel.
 */
export function usePwaUpdate() {
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let refreshed = false;
    const onControllerChange = () => {
      if (refreshed) return;
      refreshed = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    let registration: ServiceWorkerRegistration | undefined;
    const notify = (reg: ServiceWorkerRegistration) => {
      if (!reg.waiting || refreshed) return;
      toast("Nova versão disponível", {
        id: UPDATE_TOAST_ID,
        description: "Toque em Atualizar para usar a versão mais recente.",
        duration: 60_000,
        action: {
          label: "Atualizar",
          onClick: () => {
            reg.waiting?.postMessage({ type: "SKIP_WAITING" });
          },
        },
      });
    };

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        registration = reg;
        notify(reg);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            // "installed" com controller = tem SW antigo rodando = versão nova esperando.
            if (sw.state === "installed" && navigator.serviceWorker.controller) notify(reg);
          });
        });
      })
      .catch((e) => console.error("service worker: falha ao registrar", e));

    // PWA aberto em segundo plano não checa update sozinho: checa ao voltar.
    const onVisibility = () => {
      if (document.visibilityState === "visible") registration?.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
}
