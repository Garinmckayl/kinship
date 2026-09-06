"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ text, large }: { text: string; large?: boolean }) {
  return (
    <div className={large ? "text-2xl leading-relaxed" : "text-base leading-relaxed"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-bold text-white">{children}</strong>,
          ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          h1: ({ children }) => <p className="font-bold text-2xl mb-2">{children}</p>,
          h2: ({ children }) => <p className="font-bold text-xl mb-2">{children}</p>,
          h3: ({ children }) => <p className="font-bold text-lg mb-1">{children}</p>,
          code: ({ children }) => <code className="bg-white/10 rounded px-1">{children}</code>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
