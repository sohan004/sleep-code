import { FileIcon } from "./FileIcon";

interface Node {
  name: string;
  path: string;
  children: Node[];
  isDir: boolean;
}

const EXTRA_FILES = [".gitignore", "README.md"];

function buildTree(paths: string[]): Node[] {
  const root: Node = { name: "", path: "", children: [], isDir: true };
  for (const p of new Set([...paths, ...EXTRA_FILES])) {
    const parts = p.split("/");
    let cur = root;
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join("/");
      let next = cur.children.find((c) => c.name === part);
      if (!next) {
        next = { name: part, path, children: [], isDir: i < parts.length - 1 };
        cur.children.push(next);
      }
      cur = next;
    });
  }
  const sort = (n: Node) => {
    n.children.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
    n.children.forEach(sort);
  };
  sort(root);
  return root.children;
}

/**
 * Collapses chains of single-child folders into one row, like VS Code's compact folders
 * and JetBrains' compacted packages (`com.example.app` under java/kotlin source roots).
 */
function compact(nodes: Node[], variant: TreeVariant, parentName = ""): Node[] {
  const sourceRoot = (name: string) => variant === "jetbrains" && /^(java|kotlin|scala)$/.test(name);
  return nodes.map((n) => {
    if (!n.isDir) return n;
    let cur = n;
    let name = n.name;
    const sep = () => (sourceRoot(parentName) ? "." : "/");
    // JetBrains keeps source roots (java/, kotlin/) as their own row and compacts the packages beneath
    while (cur.children.length === 1 && cur.children[0].isDir && !sourceRoot(cur.name) && !sourceRoot(cur.children[0].name)) {
      cur = cur.children[0];
      name += sep() + cur.name;
    }
    return { ...cur, name, children: compact(cur.children, variant, cur.name) };
  });
}

export type TreeVariant = "vscode" | "jetbrains" | "xcode";

interface TreeProps {
  files: string[];
  activeFile: string;
  modified: string[];
  variant?: TreeVariant;
  rowHeight?: number;
}

function Row({
  node,
  depth,
  activeFile,
  modified,
  variant,
  rowHeight,
}: { node: Node; depth: number } & Required<Omit<TreeProps, "files">>) {
  const indent = variant === "jetbrains" ? 14 : variant === "xcode" ? 14 : 12;
  if (node.isDir) {
    const dirModified = modified.some((m) => m.startsWith(node.path + "/"));
    return (
      <>
        <div
          className="flex items-center gap-1 pr-3"
          style={{
            height: rowHeight,
            paddingLeft: 8 + depth * indent,
            color: dirModified && variant !== "xcode" ? "var(--ui-modified)" : "var(--ui-fg)",
          }}
        >
          <span className="w-4 text-center text-[10px]" style={{ color: "var(--ui-muted)" }}>
            {variant === "vscode" ? "⌄" : "▾"}
          </span>
          {variant !== "vscode" && (
            <span className="text-[12px]" style={{ color: variant === "xcode" ? "#3e8bf5" : "#9aa7b0" }}>
              {variant === "xcode" ? "▣" : "▰"}
            </span>
          )}
          <span className="flex-1 truncate">{node.name}</span>
          {dirModified && variant === "vscode" && (
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--ui-modified)" }} />
          )}
        </div>
        {node.children.map((c) => (
          <Row
            key={c.path}
            node={c}
            depth={depth + 1}
            activeFile={activeFile}
            modified={modified}
            variant={variant}
            rowHeight={rowHeight}
          />
        ))}
      </>
    );
  }
  const active = node.path === activeFile;
  const isModified = modified.includes(node.path);
  return (
    <div
      className={`flex items-center gap-1 pr-3 ${variant === "xcode" && active ? "rounded-md" : ""}`}
      style={{
        height: rowHeight,
        paddingLeft: 8 + depth * indent + (variant === "vscode" ? 12 : 16),
        background: active ? "var(--ui-list-active)" : undefined,
        outline: active && variant === "vscode" ? "1px solid var(--ui-accent)" : undefined,
        outlineOffset: -1,
        color: isModified ? "var(--ui-modified)" : "var(--ui-fg)",
      }}
    >
      <FileIcon name={node.name} />
      <span className="flex-1 truncate">{node.name}</span>
      {isModified && <span className="text-[11px]">M</span>}
    </div>
  );
}

export function ProjectTree({ files, activeFile, modified, variant = "vscode", rowHeight = 22 }: TreeProps) {
  return (
    <>
      {compact(buildTree(files), variant).map((n) => (
        <Row
          key={n.path}
          node={n}
          depth={0}
          activeFile={activeFile}
          modified={modified}
          variant={variant}
          rowHeight={rowHeight}
        />
      ))}
    </>
  );
}

interface Props {
  project: string;
  files: string[];
  activeFile: string;
  modified: string[];
}

/** VS Code explorer side bar. */
export function FileExplorer({ project, files, activeFile, modified }: Props) {
  return (
    <div
      className="flex w-60 shrink-0 cursor-default flex-col overflow-y-auto border-r text-[13px]"
      style={{ borderColor: "var(--ui-border)", background: "var(--ui-sidebar)" }}
    >
      <div className="flex h-9 shrink-0 items-center justify-between px-5 text-[11px] tracking-wide uppercase" style={{ color: "var(--ui-muted)" }}>
        <span>Explorer</span>
        <span className="text-[14px]">⋯</span>
      </div>
      <div className="flex h-[22px] shrink-0 items-center gap-1 px-1 text-[11px] font-bold uppercase" style={{ color: "var(--ui-fg)" }}>
        <span className="w-4 text-center text-[10px]">⌄</span>
        {project}
      </div>
      <ProjectTree files={files} activeFile={activeFile} modified={modified} />
    </div>
  );
}
