import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useState } from "react";

type Row = {
  id: string;
  email: string | null;
  name: string | null;
  lic: { starts_at: string; ends_at: string; active: boolean } | null;
};
const toLocal = (iso: string) => iso.slice(0, 10);

export function Admin() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async (): Promise<Row[]> => {
      const [{ data: p }, { data: l }] = await Promise.all([
        supabase.from("profiles").select("id,email,name").order("created_at"),
        supabase.from("licenses").select("*"),
      ]);
      return (p ?? []).map((u) => ({
        ...u,
        lic: (l ?? []).find((x) => x.user_id === u.id) ?? null,
      }));
    },
  });
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Licenças dos usuários</h2>
      {data.map((u) => (
        <UserRow
          key={u.id}
          u={u}
          onSaved={() => qc.invalidateQueries({ queryKey: ["admin-users"] })}
        />
      ))}
    </div>
  );
}

function UserRow({ u, onSaved }: { u: Row; onSaved: () => void }) {
  const [start, setStart] = useState(toLocal(u.lic?.starts_at ?? new Date().toISOString()));
  const [end, setEnd] = useState(toLocal(u.lic?.ends_at ?? new Date().toISOString()));
  const [active, setActive] = useState(u.lic?.active ?? false);
  const expired = new Date(end + "T23:59:59") < new Date();
  async function save() {
    const { error } = await supabase.from("licenses").upsert({
      user_id: u.id,
      starts_at: new Date(start + "T00:00:00").toISOString(),
      ends_at: new Date(end + "T23:59:59").toISOString(),
      active,
      updated_at: new Date().toISOString(),
    });
    if (error) toast.error("Não foi possível salvar");
    else {
      toast.success("Licença salva");
      onSaved();
    }
  }
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] md:items-end">
      <div className="min-w-0">
        <p className="truncate font-medium">{u.name || "Sem nome"}</p>
        <p className="truncate text-sm text-muted-foreground">{u.email}</p>
        <p
          className={`text-xs font-semibold ${active && !expired ? "text-success" : "text-destructive"}`}
        >
          {active && !expired ? "Ativa" : expired ? "Vencida" : "Inativa"}
        </p>
      </div>
      <label className="text-xs text-muted-foreground">
        Início
        <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label className="text-xs text-muted-foreground">
        Fim
        <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        Ativar
        <Switch checked={active} onCheckedChange={setActive} />
      </label>
      <Button onClick={save}>Salvar</Button>
    </div>
  );
}
