import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Copy,
  LogOut,
  Mic,
  Image,
  Video,
  MessageSquare,
  Wifi,
  Trash2,
  Wallet,
  ShieldCheck,
  QrCode,
  RefreshCw,
  Loader2,
  Link2,
} from "lucide-react";
import {
  getConnection,
  getFishBalance,
  getQrCode,
  setupWebhook,
  testAi,
  testAiSequence,
  testWhatsapp,
  type SeqStep,
} from "@/lib/bot.functions";
import { webhookUrl } from "@/lib/site";
import { keepQr } from "@/lib/qr";
import { Admin } from "./Admin";

type Cfg = Tables<"bot_configs">;

export function Panel({ userId, email }: { userId: string; email: string }) {
  const qc = useQueryClient();
  const fishFn = useServerFn(getFishBalance);
  const aiFn = useServerFn(testAi);
  const waFn = useServerFn(testWhatsapp);
  const qrFn = useServerFn(getQrCode);
  const [qrOn, setQrOn] = useState(false);
  const connFn = useServerFn(getConnection);
  const hookFn = useServerFn(setupWebhook);
  const conn = useQuery({
    queryKey: ["conn", userId],
    queryFn: () => connFn(),
    refetchInterval: qrOn ? 4000 : 30000,
  });
  const connected = !!conn.data?.connected;
  // W-API sometimes omits the phone details while connected; keep the last ones shown.
  const [who, setWho] = useState({ phone: "", name: "" });
  useEffect(() => {
    if (!conn.data?.connected) {
      if (conn.data) setWho({ phone: "", name: "" });
      return;
    }
    if (conn.data.phone) setWho({ phone: conn.data.phone, name: conn.data.name });
  }, [conn.data]);
  const QR_REFRESH = 30000;
  // W-API's QR endpoint fails at random; a failed refresh must never blank a working code.
  const [lastQr, setLastQr] = useState("");
  const [secs, setSecs] = useState(0);
  const qr = useQuery({
    queryKey: ["qr", userId],
    queryFn: () => qrFn(),
    enabled: qrOn && !connected,
    refetchInterval: qrOn && !connected ? (lastQr ? QR_REFRESH : 8000) : false,
  });
  useEffect(() => {
    setLastQr((p) => keepQr(p, qr.data));
  }, [qr.data]);
  useEffect(() => {
    setSecs(QR_REFRESH / 1000);
  }, [qr.dataUpdatedAt]);
  useEffect(() => {
    if (!qrOn) return;
    const t = setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [qrOn]);
  useEffect(() => {
    if (qrOn && connected) {
      setQrOn(false);
      toast.success(`WhatsApp conectado! ${who.phone}`);
      void hookNow();
    }
  }, [qrOn, connected, who.phone]);

  const { data } = useQuery({
    queryKey: ["me", userId],
    queryFn: async () => {
      const [c, l, r] = await Promise.all([
        supabase.from("bot_configs").select("*").eq("user_id", userId).single(),
        supabase.from("licenses").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
      return { cfg: c.data, lic: l.data, admin: (r.data ?? []).some((x) => x.role === "admin") };
    },
  });
  const balance = useQuery({
    queryKey: ["fish", userId],
    queryFn: () => fishFn(),
    refetchInterval: 60000,
  });

  const [cfg, setCfg] = useState<Cfg | null>(null);
  useEffect(() => {
    if (data?.cfg) setCfg(data.cfg);
  }, [data?.cfg]);
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [testVal, setTestVal] = useState({
    text: "Olá! Teste do painel ✅",
    audio: "Olá, este é um teste de áudio.",
    image: "",
    video: "",
  });

  if (!data || !cfg) return <div className="p-10 text-muted-foreground">Carregando…</div>;
  const lic = data.lic;
  const licOk =
    !!lic &&
    lic.active &&
    Date.now() >= +new Date(lic.starts_at) &&
    Date.now() <= +new Date(lic.ends_at);
  const webhook = webhookUrl(cfg.webhook_secret);
  const set = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setCfg({ ...cfg, [k]: v });

  async function save(patch?: Partial<Cfg>) {
    const next = { ...cfg!, ...patch };
    const { user_id: _u, webhook_secret: _w, ...rest } = next;
    const { error } = await supabase
      .from("bot_configs")
      .update({ ...rest, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) {
      toast.error("Erro ao salvar");
      return;
    }
    toast.success("Salvo");
    setCfg(next);
    qc.invalidateQueries({ queryKey: ["fish", userId] });
  }
  async function hookNow() {
    const r = await hookFn();
    r.ok ? toast.success(r.msg) : toast.error(`Webhook: ${r.msg}`);
  }
  async function clearMem() {
    if (!confirm("Apagar toda a memória das conversas da IA?")) return;
    const { error } = await supabase.from("ai_memory").delete().eq("user_id", userId);
    error ? toast.error("Erro ao limpar") : toast.success("Memória da IA limpa");
  }
  async function wa(kind: "status" | "text" | "audio" | "image" | "video") {
    if (sending) return;
    const value = kind === "status" ? "" : testVal[kind];
    setSending(kind);
    try {
      const r = await waFn({ data: { kind, phone, value } });
      r.ok ? toast.success(r.msg) : toast.error(r.msg);
    } catch {
      toast.error("Falha ao enviar teste");
    } finally {
      setSending(null);
    }
  }
  async function ai(provider: "openai" | "grok" | "gemini") {
    await save();
    const r = await aiFn({ data: { provider } });
    r.ok ? toast.success(r.msg) : toast.error(r.msg);
  }
  const field = (k: keyof Cfg, label: string, type = "text", ph = "") => (
    <div className="space-y-1.5">
      <Label htmlFor={k}>{label}</Label>
      <Input
        id={k}
        type={type}
        placeholder={ph}
        value={String(cfg[k] ?? "")}
        onChange={(e) => set(k, e.target.value as never)}
      />
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <header className="relative flex justify-center px-20">
        <div className="flex min-w-0 flex-col items-center gap-1 text-center">
          <img
            src="https://COCONUDIMUDIAL.b-cdn.net/AGENCIA%20FACILITY/Rob%C3%B4%20IA%20ZapcomIA%20Neon.png"
            alt="Logo"
            width={150}
            height={90}
            className="h-[90px] w-[150px] shrink-0 object-contain"
          />
          <div className="min-w-0 max-w-full">
            <p className="break-all text-sm text-muted-foreground">{email}</p>
          </div>
        </div>
        <Button
          className="absolute right-0 top-0"
          variant="outline"
          onClick={() => supabase.auth.signOut()}
        >
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          icon={<ShieldCheck />}
          label="Licença"
          value={licOk ? "Ativa" : "Inativa / vencida"}
          good={licOk}
          sub={
            lic
              ? `${new Date(lic.starts_at).toLocaleDateString()} até ${new Date(lic.ends_at).toLocaleDateString()}`
              : ""
          }
        />
        <Stat
          icon={<Wallet />}
          label="Saldo Fish Audio"
          good={!!balance.data?.ok}
          value={
            balance.isLoading
              ? "…"
              : balance.data?.ok
                ? `$ ${Number(balance.data.credit).toFixed(2)}`
                : balance.data && !balance.data.ok
                  ? balance.data.error
                  : "—"
          }
          sub="Atualiza a cada minuto"
        />
        <div className="flex items-center justify-between rounded-xl border bg-card p-4 shadow-glow">
          <div>
            <p className="text-sm text-muted-foreground">Robô</p>
            <p
              className={`text-lg font-bold ${cfg.bot_active ? "text-success" : "text-muted-foreground"}`}
            >
              {cfg.bot_active ? "Ligado" : "Desligado"}
            </p>
          </div>
          <Switch
            checked={cfg.bot_active}
            disabled={!licOk}
            onCheckedChange={(v) => save({ bot_active: v })}
            aria-label="Ativar robô"
          />
        </div>
      </div>
      {!licOk && (
        <p className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm">
          Sua licença não está ativa. Fale com o administrador para liberar o acesso.
        </p>
      )}

      <Tabs defaultValue="whatsapp">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="ia">Chaves de IA</TabsTrigger>
          <TabsTrigger value="treino">Treinamento</TabsTrigger>
          <TabsTrigger value="audio">Áudio</TabsTrigger>
          <TabsTrigger value="comunic">Comunicação</TabsTrigger>
          <TabsTrigger value="teste">Testes</TabsTrigger>
          {data.admin && <TabsTrigger value="admin">Admin</TabsTrigger>}
        </TabsList>

        <TabsContent value="whatsapp">
          <Card>
            <div
              className={`flex items-center gap-2 rounded-lg border p-3 text-sm font-semibold ${connected ? "border-success text-success" : "text-muted-foreground"}`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-success" : "bg-destructive"}`}
              />
              {connected
                ? `WhatsApp conectado${who.phone ? ` — ${who.phone}` : ""}${who.name ? ` (${who.name})` : ""}`
                : "WhatsApp desconectado"}
            </div>
            {field("wapi_instance_id", "ID da instância W-API")}
            {field("wapi_token", "Token W-API", "password")}
            {field("wapi_base_url", "Endereço da API W-API")}
            <div className="space-y-1.5">
              <Label>Webhook (o painel configura sozinho na W-API ao salvar)</Label>
              <div className="flex gap-2">
                <Input readOnly value={webhook} className="font-mono text-xs" />
                <Button
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(webhook);
                    toast.success("Webhook copiado");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={async () => {
                  await save();
                  if (cfg.wapi_instance_id && cfg.wapi_token) await hookNow();
                }}
              >
                Salvar
              </Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  await save();
                  await hookNow();
                }}
              >
                <Link2 className="h-4 w-4" />
                Configurar webhook na W-API
              </Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  await save();
                  await wa("status");
                  conn.refetch();
                }}
              >
                <Wifi className="h-4 w-4" />
                Testar conexão
              </Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  await save();
                  setLastQr("");
                  setSecs(QR_REFRESH / 1000);
                  setQrOn(true);
                }}
              >
                <QrCode className="h-4 w-4" />
                {connected ? "Reconectar via QR Code" : "Conectar via QR Code"}
              </Button>
            </div>
            {qrOn && (
              <div className="flex flex-col items-center gap-3 rounded-xl border bg-secondary p-5 text-center">
                {lastQr ? (
                  <>
                    <img
                      src={lastQr}
                      alt="QR Code para conectar o WhatsApp"
                      className="h-72 w-72 rounded-lg bg-white p-3"
                    />
                    <p className="text-sm">
                      Abra o WhatsApp no celular → Aparelhos conectados → Conectar aparelho e leia o
                      código.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {qr.isFetching
                        ? "Buscando um novo código…"
                        : secs > 0
                          ? `Este código vale mais ${secs} s e se renova sozinho.`
                          : "Este código pode ter expirado. Clique em Gerar novo código."}
                    </p>
                  </>
                ) : qr.isFetching ? (
                  <>
                    <Loader2 className="h-7 w-7 animate-spin text-primary" />
                    <p className="text-muted-foreground">Gerando QR Code…</p>
                    <p className="text-xs text-muted-foreground">
                      A W-API costuma demorar e falhar sozinha. Estamos tentando de novo a cada 8
                      segundos — pode levar até 1 minuto.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm">{qr.data?.msg ?? "Não foi possível gerar o QR Code"}</p>
                    <p className="text-xs text-muted-foreground">
                      Tentando de novo sozinho, ou clique em Gerar novo código.
                    </p>
                  </>
                )}
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="outline" onClick={() => conn.refetch()}>
                    Já li, verificar conexão
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setLastQr("");
                      qr.refetch();
                    }}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Gerar novo código
                  </Button>
                  <Button variant="ghost" onClick={() => setQrOn(false)}>
                    Fechar
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="ia">
          <Card>
            <div className="space-y-1.5">
              <Label htmlFor="prov">IA que vai responder</Label>
              <select
                id="prov"
                className="h-10 w-full rounded-md border bg-input px-3 text-foreground"
                value={cfg.ai_provider}
                onChange={(e) => {
                  const p = e.target.value;
                  setCfg({
                    ...cfg,
                    ai_provider: p,
                    ai_model:
                      p === "openai"
                        ? "gpt-4o-mini"
                        : p === "grok"
                          ? "grok-3-mini"
                          : "gemini-2.5-flash",
                  });
                }}
              >
                <option value="openai">OpenAI</option>
                <option value="grok">Grok</option>
                <option value="gemini">Gemini</option>
              </select>
            </div>
            {field("ai_model", "Modelo")}
            {(["openai", "grok", "gemini"] as const).map((p) => (
              <div key={p} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                {field(
                  `${p}_key` as keyof Cfg,
                  `Chave ${p === "openai" ? "OpenAI" : p === "grok" ? "Grok" : "Gemini"}`,
                  "password",
                )}
                <Button variant="secondary" onClick={() => ai(p)}>
                  Testar
                </Button>
              </div>
            ))}
            <Button onClick={() => save()}>Salvar</Button>
          </Card>
        </TabsContent>

        <TabsContent value="treino">
          <Card>
            <Label htmlFor="prompt">Treinamento da IA (como ela deve atender)</Label>
            <Textarea
              id="prompt"
              rows={14}
              value={cfg.prompt}
              onChange={(e) => set("prompt", e.target.value)}
              placeholder={
                "Você é a atendente da Loja X...\nQuando pedirem o cardápio envie [IMAGEM: https://...]\nPara o vídeo de apresentação envie [VIDEO: https://...mp4]\nPara dar boas-vindas em áudio use [AUDIO: texto]"
              }
            />
            <p className="text-xs text-muted-foreground">
              A IA já recebe a diretriz para responder com texto, áudio, imagem, vídeo e link usando
              as tags [IMAGEM: url], [VIDEO: url], [AUDIO: texto] e [LINK: url] — sempre a partir do
              que você escrever aqui.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dmin">Tempo mínimo de resposta (segundos)</Label>
                <Input
                  id="dmin"
                  type="number"
                  min={0}
                  max={120}
                  value={cfg.delay_min}
                  onChange={(e) => set("delay_min", Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dmax">Tempo máximo de resposta (segundos)</Label>
                <Input
                  id="dmax"
                  type="number"
                  min={0}
                  max={120}
                  value={cfg.delay_max}
                  onChange={(e) => set("delay_max", Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              A cada resposta a IA espera um tempo sorteado entre o mínimo e o máximo, para parecer
              uma pessoa digitando.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => save()}>Salvar treinamento</Button>
              <Button variant="destructive" onClick={clearMem}>
                <Trash2 className="h-4 w-4" />
                Limpar memória da IA
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="audio">
          <Card>
            {field(
              "fish_api_key",
              "Chave API Fish Audio (opcional — vazio usa a chave padrão)",
              "password",
            )}
            {field("fish_voice_id", "ID da voz (Fish Audio)")}
            <label className="flex items-center justify-between rounded-lg border p-3">
              <span>Responder sempre com áudio</span>
              <Switch
                checked={cfg.audio_replies}
                onCheckedChange={(v) => set("audio_replies", v)}
              />
            </label>
            <Button onClick={() => save()}>Salvar</Button>
          </Card>
        </TabsContent>

        <TabsContent value="comunic">
          <ComunicConfig cfg={cfg} set={set} save={save} />
        </TabsContent>

        <TabsContent value="teste">
          <Card>
            <div className="space-y-1.5">
              <Label htmlFor="ph">Número para teste (com DDI e DDD)</Label>
              <Input
                id="ph"
                placeholder="5511999999999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <TestRow
              icon={<MessageSquare className="h-4 w-4" />}
              label="Enviar texto"
              v={testVal.text}
              on={(v) => setTestVal({ ...testVal, text: v })}
              go={() => wa("text")}
              busy={sending === "text"}
            />
            <TestRow
              icon={<Mic className="h-4 w-4" />}
              label="Enviar áudio"
              v={testVal.audio}
              on={(v) => setTestVal({ ...testVal, audio: v })}
              go={() => wa("audio")}
              busy={sending === "audio"}
            />
            <TestRow
              icon={<Image className="h-4 w-4" />}
              label="Enviar imagem"
              ph="https://... (URL da imagem)"
              v={testVal.image}
              on={(v) => setTestVal({ ...testVal, image: v })}
              go={() => wa("image")}
              busy={sending === "image"}
            />
            <TestRow
              icon={<Video className="h-4 w-4" />}
              label="Enviar vídeo"
              ph="https://...mp4"
              v={testVal.video}
              on={(v) => setTestVal({ ...testVal, video: v })}
              go={() => wa("video")}
              busy={sending === "video"}
            />
          </Card>
        </TabsContent>

        {data.admin && (
          <TabsContent value="admin">
            <Admin />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 space-y-4 rounded-2xl border bg-card p-6">{children}</div>;
}
function Stat({
  icon,
  label,
  value,
  sub,
  good,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  good: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-glow">
      <div className="flex items-center gap-2 text-sm text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
        {icon}
        {label}
      </div>
      <p className={`mt-1 text-lg font-bold ${good ? "text-success" : "text-foreground"}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
function TestRow({
  icon,
  label,
  v,
  on,
  go,
  ph,
  busy,
}: {
  icon: React.ReactNode;
  label: string;
  v: string;
  on: (v: string) => void;
  go: () => void;
  ph?: string;
  busy?: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
      <Input value={v} placeholder={ph} onChange={(e) => on(e.target.value)} aria-label={label} />
      <Button
        onClick={go}
        disabled={busy}
        className="min-w-36 active:scale-95 transition-transform"
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Enviando…
          </>
        ) : (
          <>
            {icon}
            {label}
          </>
        )}
      </Button>
    </div>
  );
}

function ComunicConfig({
  cfg,
  set,
  save,
}: {
  cfg: Cfg;
  set: <K extends keyof Cfg>(k: K, v: Cfg[K]) => void;
  save: () => Promise<void>;
}) {
  const seqFn = useServerFn(testAiSequence);
  const [testing, setTesting] = useState(false);
  const [steps, setSteps] = useState<SeqStep[] | null>(null);
  const mode = (cfg.audio_mode ?? "text") as "text" | "auto" | "frequency";
  const delayOn = cfg.delay_enabled ?? false;
  const delaySec = cfg.delay_seconds ?? 5;
  const freq = cfg.audio_frequency ?? 3;

  async function runSeq() {
    setTesting(true);
    setSteps(null);
    try {
      const r = await seqFn();
      if (r?.ok) {
        setSteps(r.steps);
        toast.success(r.msg);
      } else {
        toast.error(r?.msg ?? "Falha no teste");
      }
    } catch {
      toast.error("Falha no teste de sequência");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Configurações de comunicação da IA</h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${delayOn ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
        >
          {delayOn ? "Ativo" : "Inativo"}
        </span>
      </div>

      <div className="space-y-4 rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Intervalo entre mensagens</p>
            <p className="text-sm text-muted-foreground">Ativar delay automático</p>
          </div>
          <Switch
            checked={delayOn}
            onCheckedChange={(v) => set("delay_enabled", v)}
            aria-label="Ativar delay automático"
          />
        </div>
        <div className="space-y-2">
          <p className="text-2xl font-bold">{delaySec} segundos</p>
          <Slider
            value={[delaySec]}
            min={1}
            max={30}
            step={1}
            disabled={!delayOn}
            onValueChange={([v]) => set("delay_seconds", v ?? 5)}
            aria-label="Segundos entre mensagens"
          />
          <p className="text-xs text-muted-foreground">
            Tempo de espera entre cada mensagem enviada.
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border p-4">
        <p className="font-medium">Respostas em áudio</p>
        <RadioGroup
          value={mode}
          onValueChange={(v) => set("audio_mode", v as "text" | "auto" | "frequency")}
        >
          <label className="flex cursor-pointer items-center gap-2">
            <RadioGroupItem value="text" /> Somente texto
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <RadioGroupItem value="auto" /> Texto e áudio automático
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <RadioGroupItem value="frequency" /> Áudio conforme frequência
          </label>
        </RadioGroup>
        <p className="text-xs text-muted-foreground">
          Provedor de áudio: <span className="font-semibold text-success">Fish Audio</span> —
          marcações [soft], [pause], [emphasis] são preservadas na narração.
        </p>
      </div>

      {mode === "frequency" && (
        <div className="space-y-3 rounded-xl border p-4">
          <div className="space-y-2">
            <p className="font-medium">Quantidade de mensagens recebidas</p>
            <p className="text-2xl font-bold">{freq} mensagens</p>
            <Slider
              value={[freq]}
              min={1}
              max={10}
              step={1}
              onValueChange={([v]) => set("audio_frequency", v ?? 3)}
              aria-label="Frequência de áudio"
            />
            <p className="text-xs text-muted-foreground">
              Após essa quantidade de mensagens recebidas, a próxima resposta poderá ser em áudio.
            </p>
          </div>
          <label className="flex items-center justify-between rounded-lg border p-3">
            <span className="text-sm">Permitir pedido direto de áudio pelo cliente</span>
            <Switch
              checked={cfg.allow_audio_request ?? true}
              onCheckedChange={(v) => set("allow_audio_request", v)}
            />
          </label>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => save()}>Salvar configurações</Button>
        <Button variant="secondary" disabled={testing} onClick={runSeq}>
          {testing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Testando…
            </>
          ) : (
            "TESTAR ENVIO DA IA"
          )}
        </Button>
      </div>

      {steps && (
        <div className="space-y-1.5 rounded-xl border bg-muted/40 p-4 font-mono text-xs">
          <p className="font-sans text-sm font-semibold">Resultado da sequência</p>
          {steps.map((s, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <span className="text-muted-foreground">{new Date(s.at).toLocaleTimeString()}</span>
              <span className={s.ok === false ? "text-destructive" : "text-foreground"}>
                {s.step}
              </span>
              {s.waitedMs !== undefined && (
                <span className={s.ok ? "text-success" : "text-destructive"}>
                  espera {Math.round(s.waitedMs / 1000)}s
                  {s.expectedMs !== undefined
                    ? ` / esperado ${Math.round(s.expectedMs / 1000)}s`
                    : ""}
                  {s.ok ? " ✓" : " ✗"}
                </span>
              )}
              {s.detail && <span className="text-muted-foreground">— {s.detail}</span>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
