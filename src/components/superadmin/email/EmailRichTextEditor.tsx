import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect } from "react";
import {
  Bold, Italic, List, ListOrdered, Link as LinkIcon, Heading2,
  Heading3, Minus, Quote, Undo2, Redo2, Code,
} from "lucide-react";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

function ToolbarButton({
  active, onClick, title, children,
}: {
  active?: boolean; onClick: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded transition-colors ${
        active
          ? "bg-teal-600 text-white"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
      <ToolbarButton active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <div className="mx-1 h-5 w-px bg-slate-300" />
      <ToolbarButton active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Titull 2">
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Titull 3">
        <Heading3 className="h-4 w-4" />
      </ToolbarButton>
      <div className="mx-1 h-5 w-px bg-slate-300" />
      <ToolbarButton active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Liste">
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Liste e numeruar">
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Citim">
        <Quote className="h-4 w-4" />
      </ToolbarButton>
      <div className="mx-1 h-5 w-px bg-slate-300" />
      <ToolbarButton
        active={editor.isActive("link")}
        onClick={() => {
          const existing = editor.getAttributes("link").href as string | undefined;
          const url = window.prompt("URL (bosh per te hequr):", existing ?? "https://");
          if (url === null) return;
          if (url === "") editor.chain().focus().unsetLink().run();
          else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
        }}
        title="Link"
      >
        <LinkIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Ndarje">
        <Minus className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()} title="Kod">
        <Code className="h-4 w-4" />
      </ToolbarButton>
      <div className="ml-auto flex items-center gap-0.5">
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Kthe prapa">
          <Undo2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Perserit">
          <Redo2 className="h-4 w-4" />
        </ToolbarButton>
      </div>
    </div>
  );
}

export default function EmailRichTextEditor({ value, onChange, placeholder, minHeight = 220 }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: placeholder ?? "Shkruani permbajtjen e emailit..." }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "prose prose-slate max-w-none focus:outline-none px-4 py-3 text-sm leading-relaxed",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if ((value || "") !== current) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100">
      <Toolbar editor={editor} />
      <div style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
