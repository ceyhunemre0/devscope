import { type ReactNode } from "react";

interface ReportContentProps {
  content: string;
}

type Block =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "code"; lang: string; text: string }
  | { kind: "list"; items: ListItem[] };

interface ListItem {
  indent: number;
  text: string;
  children: ListItem[];
}

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const lang = fence[1] ?? "";
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({ kind: "code", lang, text: buf.join("\n") });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        text: heading[2].trim(),
      });
      i++;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const flat: ListItem[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const m = lines[i].match(/^(\s*)[-*]\s+(.*)$/);
        if (!m) break;
        flat.push({
          indent: m[1].length,
          text: m[2],
          children: [],
        });
        i++;
      }
      blocks.push({ kind: "list", items: nestItems(flat) });
      continue;
    }

    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^```/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ kind: "paragraph", text: buf.join(" ") });
  }

  return blocks;
}

function nestItems(flat: ListItem[]): ListItem[] {
  const root: ListItem[] = [];
  const stack: ListItem[] = [];

  for (const item of flat) {
    while (stack.length > 0 && stack[stack.length - 1].indent >= item.indent) {
      stack.pop();
    }
    if (stack.length === 0) {
      root.push(item);
    } else {
      stack[stack.length - 1].children.push(item);
    }
    stack.push(item);
  }

  return root;
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const matches = Array.from(
    text.matchAll(/(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g),
  );
  let cursor = 0;
  let key = 0;

  for (const match of matches) {
    const start = match.index ?? 0;
    if (start > cursor) {
      nodes.push(text.slice(cursor, start));
    }
    if (match[2] !== undefined) {
      nodes.push(
        <strong key={key++} className="font-semibold text-foreground">
          {match[2]}
        </strong>,
      );
    } else if (match[3] !== undefined) {
      nodes.push(<em key={key++}>{match[3]}</em>);
    } else if (match[4] !== undefined) {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground"
        >
          {match[4]}
        </code>,
      );
    }
    cursor = start + match[0].length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}

function RenderList({ items }: { items: ListItem[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 marker:text-muted-foreground">
      {items.map((item, idx) => (
        <li key={idx} className="text-foreground/90">
          <span>{renderInline(item.text)}</span>
          {item.children.length > 0 && <RenderList items={item.children} />}
        </li>
      ))}
    </ul>
  );
}

function renderBlock(block: Block, idx: number): ReactNode {
  switch (block.kind) {
    case "heading": {
      const sizes: Record<number, string> = {
        1: "text-xl font-semibold tracking-tight",
        2: "text-lg font-semibold tracking-tight",
        3: "text-base font-semibold tracking-tight",
        4: "text-sm font-semibold",
        5: "text-sm font-semibold text-muted-foreground",
        6: "text-xs font-semibold uppercase tracking-wide text-muted-foreground",
      };
      const cls = `${sizes[block.level]} text-foreground mt-2 first:mt-0`;
      const Tag = `h${block.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return (
        <Tag key={idx} className={cls}>
          {renderInline(block.text)}
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p key={idx} className="text-sm leading-relaxed text-foreground/90">
          {renderInline(block.text)}
        </p>
      );
    case "code":
      return (
        <pre
          key={idx}
          className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs text-foreground/90"
        >
          <code>{block.text}</code>
        </pre>
      );
    case "list":
      return <RenderList key={idx} items={block.items} />;
  }
}

export function ReportContent({ content }: ReportContentProps) {
  const blocks = parseBlocks(content);
  return (
    <div className="max-h-[70vh] space-y-3 overflow-auto rounded-lg border border-border bg-muted/30 p-4">
      {blocks.map((block, idx) => renderBlock(block, idx))}
    </div>
  );
}
