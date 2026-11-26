import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const LOGO_URL =
  "https://COCONUDIMUDIAL.b-cdn.net/AGENCIA%20FACILITY/Rob%C3%B4%20IA%20ZapcomIA%20Neon.png";

export function Auth() {
  const [mode, setMode] = useState<"in" | "up" | "reset">("in");
  const [resetSent, setResetSent] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === "reset") {
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) toast.error(error.message);
        else setResetSent(true);
      } catch {
        toast.error("Não foi possível enviar o e-mail. Tente novamente.");
      } finally {
        setBusy(false);
      }
      return;
    } else if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast.error("E-mail ou senha incorretos");
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin, data: { name } },
      });
      if (error) toast.error(error.message);
      else if (!data.session)
        toast.success("Conta criada! Confirme pelo link enviado ao seu e-mail.");
    }
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-5 rounded-2xl border bg-card p-8 shadow-glow"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <img
            src={LOGO_URL}
            alt="Logo"
            width={150}
            height={90}
            className="mx-auto block h-[90px] w-[150px] shrink-0 object-contain"
          />
        </div>
        {mode === "up" && (
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
        )}
        {mode === "reset" && (
          <p role="status" className="text-sm text-muted-foreground">
            {resetSent
              ? "Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha. Confira também o spam."
              : "Recuperar senha"}
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        {mode !== "reset" && (
          <div className="space-y-2">
            <Label htmlFor="pw">Senha</Label>
            <Input
              id="pw"
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        )}
        <Button className="w-full" disabled={busy || (mode === "reset" && resetSent)}>
          {busy
            ? "Aguarde…"
            : mode === "reset"
              ? "Enviar link de recuperação"
              : mode === "in"
                ? "Entrar"
                : "Criar conta"}
        </Button>
        {mode === "in" && (
          <Button
            type="button"
            variant="link"
            className="w-full"
            onClick={() => {
              setResetSent(false);
              setMode("reset");
            }}
          >
            Esqueci minha senha
          </Button>
        )}
        <Button
          type="button"
          variant="link"
          className="w-full"
          onClick={() => setMode(mode === "in" ? "up" : "in")}
        >
          {mode === "reset"
            ? "Voltar para entrar"
            : mode === "in"
              ? "Não tem conta? Cadastre-se"
              : "Já tem conta? Entrar"}
        </Button>
      </form>
    </div>
  );
}
