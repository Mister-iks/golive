"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { yaml } from "@codemirror/lang-yaml";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { Copy, Download } from "lucide-react";
import { parseSpec, stringifySpec, type SpecIssue } from "@golive/spec";
import { useMessages } from "@/i18n/client";
import { projectFilesMessages } from "@/i18n/messages/project-files";
import { useStore } from "@/lib/store";
import { exportYaml } from "@/lib/format";
import { Button, StatusIcon } from "./ui";
import type { WorkspaceProps } from "./workspace";

/**
 * Two-way editor: the Studio writes the YAML, and valid YAML typed here
 * updates the Studio. Invalid YAML is kept locally with inline errors.
 */
export function YamlEditor({ project }: WorkspaceProps) {
  const t = useMessages(projectFilesMessages);
  const replace = useStore((s) => s.replaceSpec);
  const canonical = useMemo(() => stringifySpec(project.spec), [project.spec]);
  const [text, setText] = useState(canonical);
  const [issues, setIssues] = useState<SpecIssue[]>([]);
  const [dark, setDark] = useState(false);
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setText(canonical);
  }, [canonical]);

  useEffect(() => {
    const read = () => setDark(document.documentElement.dataset.theme === "dark");
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  const onChange = (value: string) => {
    editing.current = true;
    setText(value);
    const r = parseSpec(value);
    setIssues(r.issues);
    if (r.ok) replace(project.id, r.spec);
  };

  const lint = useMemo(
    () =>
      linter((view) => {
        const r = parseSpec(view.state.doc.toString());
        return r.issues.map<Diagnostic>((i) => {
          const line = view.state.doc.line(Math.min(Math.max(i.line ?? 1, 1), view.state.doc.lines));
          return { from: line.from, to: line.to, severity: "error", message: i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message };
        });
      }, { delay: 250 }),
    [],
  );

  const theme = useMemo(
    () =>
      EditorView.theme(
        {
          "&": { color: "var(--fg)" },
          ".cm-content": { caretColor: "var(--fg)" },
          ".cm-cursor": { borderLeftColor: "var(--fg)" },
          "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": { background: "color-mix(in oklab, var(--go) 22%, transparent) !important" },
        },
        { dark },
      ),
    [dark],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-2">
        <div className="flex items-center gap-2 text-xs">
          <StatusIcon status={issues.length ? "fail" : "pass"} size={13} />
          {issues.length ? (
            <span className="text-red">
              {t.yamlErrors(issues.length)}
            </span>
          ) : (
            <span className="text-fg-2">{t.yamlValid}</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" icon={<Copy size={13} />} onClick={() => void navigator.clipboard.writeText(text)}>
            {t.copy}
          </Button>
          <Button size="sm" icon={<Download size={13} />} onClick={() => exportYaml(project.spec)} disabled={issues.length > 0}>
            {t.download}
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-surface">
        <CodeMirror
          value={text}
          onChange={onChange}
          onBlur={() => {
            editing.current = false;
            if (issues.length === 0) setText(canonical);
          }}
          extensions={[yaml(), lint, lintGutter(), theme, EditorView.lineWrapping]}
          theme={dark ? "dark" : "light"}
          height="100%"
          basicSetup={{ foldGutter: true, highlightActiveLine: true, autocompletion: false }}
          aria-label={t.editorLabel}
        />
      </div>
    </div>
  );
}
