import { FileIcon } from "./FileIcon";

interface Props {
  project: string;
  files: string[];
  activeFile: string;
  modified: string[];
}

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

function TreeNode({ node, depth, activeFile, modified }: { node: Node; depth: number; activeFile: string; modified: string[] }) {
  if (node.isDir) {
    const dirModified = modified.some((m) => m.startsWith(node.path + "/"));
    return (
      <>
        <div
          className={`flex h-[22px] items-center gap-1 pr-3 hover:bg-[#2a2d2e] ${dirModified ? "text-[#e2c08d]" : "text-[#cccccc]"}`}
          style={{ paddingLeft: 8 + depth * 12 }}
        >
          <span className="w-4 text-center text-[10px] text-[#c5c5c5]">⌄</span>
          <span className="flex-1 truncate">{node.name}</span>
          {dirModified && <span className="h-1.5 w-1.5 rounded-full bg-[#e2c08d]/80" />}
        </div>
        {node.children.map((c) => (
          <TreeNode key={c.path} node={c} depth={depth + 1} activeFile={activeFile} modified={modified} />
        ))}
      </>
    );
  }
  const active = node.path === activeFile;
  const isModified = modified.includes(node.path);
  return (
    <div
      className={`flex h-[22px] items-center gap-1 pr-3 ${
        active ? "bg-[#37373d] outline -outline-offset-1 outline-[#0078d4]" : "hover:bg-[#2a2d2e]"
      } ${isModified ? "text-[#e2c08d]" : active ? "text-white" : "text-[#cccccc]"}`}
      style={{ paddingLeft: 8 + depth * 12 + 12 }}
    >
      <FileIcon name={node.name} />
      <span className="flex-1 truncate">{node.name}</span>
      {isModified && <span className="text-[11px]">M</span>}
    </div>
  );
}

export function FileExplorer({ project, files, activeFile, modified }: Props) {
  const tree = buildTree(files);
  return (
    <div className="flex w-60 shrink-0 cursor-default flex-col overflow-y-auto border-r border-[#2b2b2b] bg-[#181818] text-[13px]">
      <div className="flex h-9 shrink-0 items-center justify-between px-5 text-[11px] tracking-wide text-[#bbbbbb] uppercase">
        <span>Explorer</span>
        <span className="text-[14px]">⋯</span>
      </div>
      <div className="flex h-[22px] shrink-0 items-center gap-1 px-1 text-[11px] font-bold text-[#cccccc] uppercase">
        <span className="w-4 text-center text-[10px]">⌄</span>
        {project}
      </div>
      {tree.map((n) => (
        <TreeNode key={n.path} node={n} depth={0} activeFile={activeFile} modified={modified} />
      ))}
    </div>
  );
}
