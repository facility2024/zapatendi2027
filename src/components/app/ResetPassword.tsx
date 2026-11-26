import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPassword() {
  const [status, setStatus] = useState<"checking" | "ready" | "invalid" | "done">("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let recovery = new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery";
    const verify = async () => {
      try {
        const { data, error: authError } = await supabase.auth.getUser();
        if (active) setStatus(recovery && data.user && !authError ? "ready" : "invalid");
      } catch {
        if (active) setStatus("invalid");
      }
    };
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        recovery = true;
        // Auth callbacks must not await another auth call while the lock is held.
        window.setTimeout(() => {
          if (active) void verify();
        }, 0);
      } else if (event === "SIGNED_OUT" && active) {
        setStatus("invalid");
      }
    });
    void verify();
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (status !== "ready" || busy) return;
    if (password.length < 6) {
      setError("Use pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) {
        setStatus("invalid");
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setPassword("");
      setConfirmation("");
      setStatus("done");
    } catch {
      setError("Não foi possível alterar a senha. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <section className="w-full max-w-sm space-y-5 rounded-2xl border bg-card p-8 shadow-glow">
        <div className="flex flex-col items-center gap-3 text-center">
          <img
            src="https://COCONUDIMUDIAL.b-cdn.net/AGENCIA%20FACILITY/Rob%C3%B4%20IA%20ZapcomIA%20Neon.png"
            alt="Logo"
            width={150}
            height={90}
            className="h-[90px] w-[150px] shrink-0 object-contain"
          />
          <h1 className="text-xl font-bold">Nova senha</h1>
        </div>
        {status === "checking" && (
          <p role="status" className="text-center text-sm text-muted-foreground">
            Verificando seu link…
          </p>
        )}
        {status === "invalid" && (
          <p role="alert" className="text-center text-sm text-destructive">
            Link inválido ou expirado. Solicite outro em “Esqueci minha senha”.
          </p>
        )}
        {status === "done" && (
          <p role="status" className="text-center text-sm">
            Senha alterada com sucesso.
          </p>
        )}
        {status === "ready" && (
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova senha</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={6}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar nova senha</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={6}
                required
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Salvando…" : "Salvar nova senha"}
            </Button>
          </form>
        )}
        {status !== "checking" && (
          <Button asChild variant="link" className="w-full">
            <Link to="/">{status === "done" ? "Ir para o painel" : "Voltar ao início"}</Link>
          </Button>
        )}
      </section>
    </div>
  );
}
