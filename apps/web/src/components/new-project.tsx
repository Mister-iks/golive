"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowRight, FileUp } from "lucide-react";
import { TEMPLATES, parseSpec } from "@golive/spec";
import { useStore } from "@/lib/store";
import { TopologyThumb } from "./topology-thumb";
import { Button, cx, Dialog, Input } from "./ui";

export function TemplateGrid({ onPick, compact }: { onPick: (id: string) => void; compact?: boolean }) {
  return (
    <div className={cx("grid gap-3", compact ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3")}>
      {TEMPLATES.map((t) => (
        <button
          key={t.id}
          onClick={() => onPick(t.id)}
          className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface text-left transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-[0_1px_0_var(--line),0_6px_16px_-10px_rgb(0_0_0/0.25)]"
        >
          <div className="relative h-24 border-b border-line bg-[radial-gradient(var(--canvas-dot)_1px,transparent_1px)] [background-size:10px_10px]">
            <TopologyThumb spec={t.spec} className="absolute inset-0 size-full p-2" />
          </div>
          <div className="flex items-start justify-between gap-2 px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium">{t.name}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-fg-3">{t.description}</p>
            </div>
            <ArrowRight size={14} className="mt-0.5 shrink-0 text-fg-4 transition-transform group-hover:translate-x-0.5 group-hover:text-fg-2" />
          </div>
        </button>
      ))}
    </div>
  );
}

export function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useStore((s) => s.create);
  const router = useRouter();
  const [name, setName] = useState("");

  const pick = async (template: string) => {
    try {
      const id = await create({ template, name: name.trim() || undefined });
      onOpenChange(false);
      router.push(`/p/${id}`);
    } catch (e) {
      useStore.getState().notify((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Nouveau projet" description="Partez d'une architecture type, vous l'adapterez dans le Studio." width={760}>
      <div className="flex flex-col gap-4 p-5">
        <Input autoFocus placeholder="Nom du projet (facultatif)" value={name} onChange={(e) => setName(e.target.value)} />
        <TemplateGrid onPick={(t) => void pick(t)} />
      </div>
    </Dialog>
  );
}

export function ImportButton() {
  const create = useStore((s) => s.create);
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();

  const onFile = async (file: File) => {
    const r = parseSpec(await file.text());
    if (!r.ok) {
      setError(r.issues.map((i) => `${i.line ? `ligne ${i.line} : ` : ""}${i.message}`).join("\n"));
      return;
    }
    try {
      router.push(`/p/${await create({ spec: r.spec })}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept=".yaml,.yml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = "";
        }}
      />
      <Button icon={<FileUp size={14} />} onClick={() => ref.current?.click()}>
        Importer golive.yaml
      </Button>
      <Dialog open={!!error} onOpenChange={() => setError(undefined)} title="Fichier invalide" description="Ce fichier n'est pas un GoLive Spec valide.">
        <pre className="m-5 whitespace-pre-wrap rounded-md border border-red-line bg-red-soft p-3 font-mono text-xs text-red">{error}</pre>
      </Dialog>
    </>
  );
}
